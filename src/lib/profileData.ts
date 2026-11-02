export const profileDepartments = [
  { id: 'gu', label: 'ГУ ГИБДД' },
  { id: 'academy', label: 'Академия' },
  { id: 'usb', label: 'УСБ | Управление собственной безопасности' },
  { id: 'uku', label: 'УКУ | Учебно-кадровое управление' },
  { id: 'uor', label: 'УОР | Управление оперативного розыска' },
  { id: 'sdb', label: 'СДБ | Специальный дорожный батальон' },
  { id: 'mb', label: 'МБ | Мотоциклетный Батальон' },
  { id: 'ugk', label: 'УГК | Управление грузового контроля' },
  { id: 'dps', label: 'ДПС | Дорожно-патрульная служба' },
  { id: 'ukm', label: 'УКМ | Управление по контролю магистралей' },
] as const;

export interface Profile {
  game_nickname: string;
  static_id: string;
  department: string;
  full_name: string;
  rank: string;
  position: string;
  badge: string;
  about: string;
  updated_at: string;
}

export const emptyProfile: Profile = {
  game_nickname: '', static_id: '', department: '', full_name: '',
  rank: '', position: '', badge: '', about: '', updated_at: '',
};

// Whitelist columns: database metadata and arbitrary client keys never become form data.
export function readProfile(value: unknown): Profile {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return Object.fromEntries(Object.keys(emptyProfile).map(key => [key, typeof row[key] === 'string' ? row[key] : ''])) as unknown as Profile;
}

export function profileDepartmentLabel(id: string): string {
  return profileDepartments.find(department => department.id === id)?.label ?? '';
}

export type ProfileErrors = Partial<Record<keyof Profile, string>>;
export function validateProfile(profile: Profile): ProfileErrors {
  const errors: ProfileErrors = {};
  const nickname = profile.game_nickname.trim();
  if (nickname.length < 3 || nickname.length > 80 || /[\x00-\x1f\x7f]/.test(nickname)) {
    errors.game_nickname = 'Укажите игровой никнейм: от 3 до 80 символов, без переносов строк.';
  }
  if (!/^\d{1,10}$/.test(profile.static_id.trim())) errors.static_id = 'StaticID должен содержать от 1 до 10 цифр.';
  if (!profileDepartments.some(department => department.id === profile.department)) errors.department = 'Выберите ваш текущий отдел.';
  for (const key of ['full_name', 'rank', 'position', 'badge'] as const) {
    if (profile[key].trim().length > 100 || /[\x00-\x1f\x7f]/.test(profile[key])) errors[key] = 'Не более 100 символов, без переносов строк.';
  }
  if (profile.about.trim().length > 1000) errors.about = 'Не более 1000 символов.';
  return errors;
}

export function profileWriteValues(profile: Profile) {
  const { updated_at: _updatedAt, ...fields } = readProfile(profile);
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value.trim()])) as Omit<Profile, 'updated_at'>;
}

export type ProfileDefault = 'nickname' | 'staticId' | 'combined' | 'departmentLabel' | 'achievementDepartment' | 'sourceDepartment' | 'promotionDepartment';
export function profileDefault(profile: Profile, field: ProfileDefault): string {
  const nickname = profile.game_nickname.trim();
  const staticId = profile.static_id.trim();
  switch (field) {
    case 'nickname': return nickname;
    case 'staticId': return staticId;
    case 'combined': return nickname && staticId ? `${nickname} | ${staticId}` : '';
    case 'departmentLabel': return profileDepartmentLabel(profile.department).split(' | ')[0];
    case 'achievementDepartment': return !['academy', 'ukm'].includes(profile.department) && profileDepartmentLabel(profile.department) ? profile.department : '';
    case 'sourceDepartment': return profile.department !== 'gu' && profileDepartmentLabel(profile.department) ? profile.department : '';
    case 'promotionDepartment': return !['gu', 'ukm'].includes(profile.department) && profileDepartmentLabel(profile.department) ? profile.department : '';
  }
}

export type ProfileMapping<T> = Partial<Record<keyof T, ProfileDefault>>;
export function applyProfileDefaults<T extends object>(values: T, touched: readonly (keyof T)[], profile: Profile, mapping: ProfileMapping<T>): T {
  const result = { ...values };
  for (const key of Object.keys(mapping) as (keyof T)[]) {
    if (!touched.includes(key)) {
      const value = profileDefault(profile, mapping[key]!);
      if (value) result[key] = value as T[keyof T];
    }
  }
  return result;
}
