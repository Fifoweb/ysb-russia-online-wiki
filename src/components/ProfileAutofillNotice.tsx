import { CheckCircle, IdentificationCard } from '@phosphor-icons/react';
import { useAuth } from '../lib/auth';
import { useProfile } from '../lib/useProfile';

export default function ProfileAutofillNotice() {
  const { user } = useAuth();
  const { profile, status, refresh } = useProfile();
  if (!user) return null;
  const filled = Boolean(profile.game_nickname && profile.static_id);
  return <div className="profile-autofill-notice" role="status">
    {filled ? <CheckCircle size={20} aria-hidden="true" /> : <IdentificationCard size={20} aria-hidden="true" />}
    <p>{status === 'loading' ? 'Загружаем данные для автозаполнения…' : status === 'error'
      ? <>Не удалось загрузить профиль. Заполните данные вручную или <button type="button" onClick={() => void refresh()}>повторите загрузку</button>.</>
      : filled ? <>Ваши данные подставлены из <a href={import.meta.env.BASE_URL + 'profile'}>личного кабинета</a>. Их можно изменить в этой форме.</>
      : <>Сохраните никнейм, StaticID и отдел в <a href={import.meta.env.BASE_URL + 'profile'}>личном кабинете</a>, чтобы заполнять отчёты быстрее.</>}</p>
  </div>;
}
