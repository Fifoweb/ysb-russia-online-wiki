export interface NavItem {
  id: string;
  label: string;
  icon: string;
  path: string;
}

export const navItems: NavItem[] = [
  { id: 'home', label: 'Главная', icon: '🏠', path: '/' },
  { id: 'basics', label: 'Основа службы', icon: '📋', path: '/basics' },
  { id: 'check', label: 'Служебная проверка', icon: '🔍', path: '/check' },
  { id: 'control', label: 'Повседневный контроль', icon: '👁️', path: '/control' },
  { id: 'discipline', label: 'Дисциплина и решения', icon: '⚖️', path: '/discipline' },
  { id: 'practice', label: 'Практика и зачёт', icon: '📝', path: '/practice' },
  { id: 'appendix', label: 'Приложения и формы', icon: '📎', path: '/appendix' },
  { id: 'handbook', label: 'Памятка Россия Онлайн', icon: '📕', path: '/handbook' },
  { id: 'report', label: 'Заявление на повышение', icon: '📤', path: '/report' },
  { id: 'promotion', label: 'Запрос на повышение', icon: '⬆️', path: '/promotion' },
  { id: 'appeal', label: 'Обжалование выговора', icon: '⚖️', path: '/appeal' },
  { id: 'reprimand-work', label: 'Отработка выговора', icon: '🛠️', path: '/reprimand-work' },
  { id: 'restore', label: 'Восстановление сотрудника', icon: '♻️', path: '/restore' },
  { id: 'transfer', label: 'Переводы в ГИБДД', icon: '🚔', path: '/transfer' },
  { id: 'resign', label: 'Заявление на увольнение', icon: '📄', path: '/resign' },
  { id: 'complaints', label: 'Жалобы', icon: '🕵️', path: '/complaints' },
];
