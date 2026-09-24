export interface NavItem {
  id: string;
  label: string;
  icon: string;
  path: string;
  section?: string;
}

export const navItems: NavItem[] = [
  { id: 'home', label: 'Главная', icon: '⌂', path: '/', section: 'Обзор' },
  { id: 'crafts', label: 'Крафты ГИБДД', icon: '▦', path: '/crafts', section: 'Каталоги' },
  { id: 'servers', label: 'Онлайн Тверского', icon: '◉', path: '/servers', section: 'Каталоги' },
  { id: 'basics', label: 'Основа службы', icon: '01', path: '/basics', section: 'Курс' },
  { id: 'check', label: 'Служебная проверка', icon: '02', path: '/check', section: 'Курс' },
  { id: 'control', label: 'Повседневный контроль', icon: '03', path: '/control', section: 'Курс' },
  { id: 'discipline', label: 'Дисциплина и решения', icon: '04', path: '/discipline', section: 'Курс' },
  { id: 'practice', label: 'Практика и зачёт', icon: '05', path: '/practice', section: 'Курс' },
  { id: 'appendix', label: 'Приложения и формы', icon: '06', path: '/appendix', section: 'Курс' },
  { id: 'handbook', label: 'Памятка Россия Онлайн', icon: '07', path: '/handbook', section: 'Курс' },
  { id: 'report', label: 'Заявление на повышение', icon: '↗', path: '/report', section: 'Заявки' },
  { id: 'promotion', label: 'Запрос на повышение', icon: '↥', path: '/promotion', section: 'Заявки' },
  { id: 'appeal', label: 'Обжалование выговора', icon: '↪', path: '/appeal', section: 'Заявки' },
  { id: 'reprimand-work', label: 'Отработка выговора', icon: '↯', path: '/reprimand-work', section: 'Заявки' },
  { id: 'restore', label: 'Восстановление сотрудника', icon: '↻', path: '/restore', section: 'Заявки' },
  { id: 'transfer', label: 'Переводы в ГИБДД', icon: '⇄', path: '/transfer', section: 'Заявки' },
  { id: 'department', label: 'Заявки в отдел', icon: '⇢', path: '/department', section: 'Заявки' },
  { id: 'resign', label: 'Заявление на увольнение', icon: '□', path: '/resign', section: 'Заявки' },
  { id: 'complaints', label: 'Жалобы', icon: '!', path: '/complaints', section: 'Заявки' },
];
