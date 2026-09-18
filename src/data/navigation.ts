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
];