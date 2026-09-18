import { motion } from 'framer-motion';
import PageTransition from '../components/PageTransition';
import GlitchText from '../components/GlitchText';
import { navItems } from '../data/navigation';

interface HomeProps { onNavigate: (path: string) => void; }

const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } }),
};

export default function Home({ onNavigate }: HomeProps) {
  return (
    <PageTransition className="relative">
      <div className="relative overflow-hidden rounded-2xl glass border border-purple-500/10 p-8 md:p-12 mb-10">
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl translate-y-1/3 -translate-x-1/3 pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-mono tracking-[0.2em] text-purple-400 bg-purple-500/10 px-3 py-1.5 rounded-full border border-purple-500/20">УЧЕБНЫЙ КУРС</span>
            <span className="text-xs font-mono text-gray-600">РЕД. 2.0 · 17.09.2026</span>
          </div>
          <GlitchText text="УПРАВЛЕНИЕ СОБСТВЕННОЙ БЕЗОПАСНОСТИ" className="text-3xl md:text-5xl lg:text-6xl font-black tracking-tight text-white mb-4 block neon-purple" />
          <p className="text-lg md:text-xl text-cyan-300/80 font-medium mb-2">ГИБДД · РОССИЯ ОНЛАЙН</p>
          <p className="text-gray-400 max-w-2xl leading-relaxed mb-6">Полный курс подготовки сотрудника УСБ ГИБДД — от первой смены до самостоятельной служебной проверки. Рабочие алгоритмы, доказательства, документы, практика и зачёт.</p>
          <p className="text-xs text-gray-600 font-mono mb-6 bg-black/30 inline-block px-3 py-1.5 rounded-lg">Игровая правовая база. Без законодательства реальной России.<br />Методическое пособие; не ведомственный нормативный акт.</p>
          <div className="flex flex-wrap gap-3">
            {[
              { label: '📋 Алгоритмы', path: '/basics' },
              { label: '📎 Документы', path: '/appendix' },
              { label: '📕 Памятка', path: '/handbook' },
              { label: '🎯 Практика', path: '/practice' },
              { label: '✅ Зачёт', path: '/practice' },
            ].map(tag => (
              <button key={tag.label} onClick={() => onNavigate(tag.path)}
                className="text-xs font-mono text-gray-400 bg-white/5 px-3 py-1.5 rounded-lg border border-white/5 hover:text-purple-300 hover:border-purple-500/30 hover:bg-purple-500/10 transition-all cursor-pointer">
                {tag.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-8"><h2 className="text-xl font-bold text-white mb-2">📚 Разделы курса</h2><p className="text-sm text-gray-500 mb-6">Выберите раздел для изучения или используйте поиск (Ctrl+K)</p></div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-10">
        {[
          { ...navItems.find(i => i.id === 'basics')!, desc: 'Разделы 01–05: вводная, полномочия, компетенция, рабочий комплект, начало смены', count: 5 },
          { ...navItems.find(i => i.id === 'check')!, desc: 'Разделы 06–11: приём сообщений, план проверки, запросы, объяснения, доказательства, видео', count: 6 },
          { ...navItems.find(i => i.id === 'control')!, desc: 'Разделы 12–13: контроль патруля, документы, транспорт, ДТП, травмы, применение силы', count: 2 },
          { ...navItems.find(i => i.id === 'discipline')!, desc: 'Разделы 14–24: квалификация, взыскания, уголовное, КоАП, передача, заключение, архив', count: 11 },
          { ...navItems.find(i => i.id === 'practice')!, desc: 'Разделы 25–28: учебный кейс, разбор, задачи, практический зачёт', count: 4 },
          { ...navItems.find(i => i.id === 'appendix')!, desc: 'Формы Ф1–Ф5, негласная работа, источники курса, расхождения', count: 5 },
          { ...navItems.find(i => i.id === 'handbook')!, desc: 'Статьи УК, КоАП и УПК: наказания, порядок задержания, избранное', count: 3 },
        ].map((item, i) => (
          <motion.button key={item.id} custom={i} variants={cardVariants} initial="hidden" animate="visible"
            onClick={() => onNavigate(item.path)}
            className="text-left p-5 rounded-2xl glass border border-purple-500/10 hover:border-purple-500/30 hover:bg-white/[0.06] transition-all group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/3 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:bg-purple-500/6 transition-colors pointer-events-none" />
            <span className="text-3xl mb-3 block">{item.icon}</span>
            <h3 className="text-base font-bold text-gray-200 mb-1.5 group-hover:text-purple-300 transition-colors">{item.label}</h3>
            <p className="text-xs text-gray-500 leading-relaxed mb-3">{item.desc}</p>
            <span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 px-2 py-1 rounded-md">{item.count} разделов</span>
          </motion.button>
        ))}
      </div>

      <div className="glass rounded-2xl p-6 border border-purple-500/10 mb-10">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">⚡ Быстрый доступ</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Памятка УСБ', icon: '📋', path: '/appendix' }, { label: 'Альбом форм', icon: '📁', path: '/appendix' },
            { label: 'Учебный кейс', icon: '📖', path: '/practice' }, { label: 'Зачёт', icon: '🎯', path: '/practice' },
            { label: 'Документооборот', icon: '🔄', path: '/appendix' }, { label: 'Источники', icon: '📜', path: '/appendix' },
            { label: 'Формы Ф1–Ф5', icon: '📝', path: '/appendix' }, { label: 'Поиск (Ctrl+K)', icon: '🔎', path: '/' },
          ].map(btn => (
            <button key={btn.label} onClick={() => onNavigate(btn.path)}
              className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/5 border border-purple-500/10 text-sm text-gray-400 hover:text-gray-200 hover:border-purple-500/25 transition-all text-left">
              <span>{btn.icon}</span><span>{btn.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="text-center pb-10">
        <p className="text-[11px] text-gray-600 font-mono">Автор курса: Кира Комиссарова · ГИБДД Россия Онлайн<br />Разработка сайта: Мирон Комиссаров</p>
        <p className="text-[11px] text-gray-600 font-mono mt-2">Методическое пособие. Редакция 2.0 · 17 сентября 2026 года</p>
        <p className="text-[10px] text-gray-700 font-mono mt-4 max-w-2xl mx-auto leading-relaxed">
          Данное пособие создано исключительно для игрового проекта «Россия Онлайн» (GTA RP).
          Все названия, структуры, должности, документы и процедуры являются вымышленными игровыми элементами,
          не имеют отношения к органам государственной власти Российской Федерации, не являются официальными
          документами и не несут юридической силы на территории РФ.
        </p>
      </div>
    </PageTransition>
  );
}