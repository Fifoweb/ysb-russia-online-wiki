import { supabase } from './supabase';
import { getApplicationSession } from './auth';
import { readProfile, validateProfile, profileWriteValues, type Profile } from './profileData';

const columns = 'game_nickname,static_id,department,full_name,rank,position,badge,about,updated_at';

async function requireProfileSession(userId: string) {
  const result = await getApplicationSession(userId);
  if (!result.session) throw new Error(result.error);
  if (!result.session.user.identities?.some(identity => identity.provider === 'discord')) {
    throw new Error('Для личного кабинета войдите через Discord.');
  }
  if (!supabase) throw new Error('Личный кабинет временно недоступен.');
  return supabase;
}

export async function loadProfile(userId: string): Promise<Profile> {
  const client = await requireProfileSession(userId);
  const { data, error } = await client.from('profiles').select(columns).eq('id', userId).maybeSingle();
  if (error) throw new Error('Не удалось загрузить профиль. Попробуйте ещё раз.');
  return readProfile(data);
}

export async function saveProfile(userId: string, profile: Profile): Promise<Profile> {
  if (Object.keys(validateProfile(profile)).length) throw new Error('Проверьте данные профиля.');
  const client = await requireProfileSession(userId);
  const { data, error } = await client.from('profiles')
    .upsert({ ...profileWriteValues(profile), id: userId }, { onConflict: 'id' })
    .select(columns).single();
  if (error || !data) throw new Error('Не удалось сохранить профиль. Проверьте соединение и попробуйте ещё раз.');
  return readProfile(data);
}
