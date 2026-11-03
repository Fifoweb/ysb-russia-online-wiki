/** Current department names, shared by the portal and its submission handlers. */
export const currentDepartments = [
  { id: 'ovk', label: 'ОВК | Отдел внутреннего контроля' },
  { id: 'udk', label: 'УДК | Управление дорожного контроля' },
  { id: 'sdb', label: 'СДБ | Специальный дорожный батальон' },
  { id: 'uor', label: 'УОР | Управление оперативного розыска' },
  { id: 'mb', label: 'МБ | Мотоциклетный батальон' },
  { id: 'ugk', label: 'УГК | Управление грузового контроля' },
  { id: 'uku', label: 'УКУ | Учебно-кадровое управление' },
  { id: 'dps', label: 'ДПС | Дорожно-патрульная служба' },
] as const;
export type DepartmentId = typeof currentDepartments[number]['id'];

/** Notification roles are distinct from the membership roles used for sign-in. */
export const departmentLeadershipRoles = {
  senior: '1538937566273732632',
  ovk: '1540269592927019038',
  udk: '1540269491404017674',
  sdb: '1540268801193672755',
  uor: '1540268999718342656',
  mb: '1542235140611379260',
  ugk: '1540269700443799583',
  uku: '1540268884987478096',
  dps: '1540268712282562610',
} as const;

export const departmentLeadershipOptions = [
  { id: 'senior', label: 'Старший состав' },
  ...currentDepartments.map(department => ({ id: department.id, label: `Руководство ${department.label.split(' | ')[0]}` })),
];

// OVK retains the former USB application thread and leadership role. Keep old
// stored profile IDs readable without putting the retired option in new forms.
export const canonicalDepartment = (id: string): string => id === 'usb' ? 'ovk' : id;
