import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, BookOpen, ClipboardList, Factory, FileText, Search, Server, ShieldCheck, Wifi } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import { navItems } from '../data/navigation';
import { fetchTverskoyOnline } from '../lib/online';

interface HomeProps { onNavigate: (path: string) => void; }

const courseCards = [
  { id: 'basics', title: 'Основа службы', desc: 'Вводная, полномочия, рабочий комплект и начало смены.', count: '01—05', icon: ShieldCheck },
  { id: 'check', title: 'Служебная проверка', desc: 'Сообщения, план проверки, объяснения и доказательства.', count: '06—11', icon: Search },
  { id: 'control', title: 'Повседневный контроль', desc: 'Патруль, документы, транспорт и применение силы.', count: '12—13', icon: ClipboardList },
  { id: 'discipline', title: 'Дисциплина и решения', desc: 'Квалификация, взыскания, передача и архив.', count: '14—24', icon: FileText },
  { id: 'practice', title: 'Практика и зачёт', desc: 'Учебный кейс, задачи и практический зачёт.', count: '25—28', icon: BookOpen },
  { id: 'appendix', title: 'Приложения и формы', desc: 'Формы Ф1—Ф5 и рабочие документы.', count: 'Ф1—Ф5', icon: Factory },
];

export default function Home({ onNavigate }: HomeProps) {
  const reduceMotion = useReducedMotion();
  const [online, setOnline] = useState<number | null>(null);
  useEffect(() => { const controller = new AbortController(); fetchTverskoyOnline(controller.signal).then(value => setOnline(value.current)).catch(() => undefined); return () => controller.abort(); }, []);

  return <PageTransition className="home-page">
    <section className="home-intro">
      <div className="home-intro-copy"><p className="eyebrow">РОССИЯ ОНЛАЙН · ГИБДД</p><h1>ГИБДД Вики</h1><p className="home-lead">Рабочая энциклопедия для сотрудников ГИБДД: курс службы, формы, кадровые документы и инструменты фракции в одном месте.</p><div className="home-actions"><button className="primary-button" onClick={() => onNavigate('/basics')}>Начать курс <ArrowRight size={17} /></button><button className="secondary-button" onClick={() => onNavigate('/crafts')}>Открыть крафты</button></div></div>
      <figure className="home-intro-photo">
        <img src={`${import.meta.env.BASE_URL}gibdd-hero.webp`}
          alt="Патрульный автомобиль дорожной полиции на вечерней городской улице"
          width={1200} height={751} loading="eager" />
      </figure>
    </section>

    <section className="status-strip"><div className="status-strip-label"><span className={online === null ? 'status-dot status-dot-pending' : 'status-dot'} /><span>{online === null ? 'Получаем данные' : `${online.toLocaleString('ru-RU')} онлайн в Тверском`}</span></div><button onClick={() => onNavigate('/servers')}>Подробнее <ArrowRight size={15} /></button></section>

    <div className="section-heading"><div><p className="eyebrow">НАВИГАЦИЯ</p><h2>Все разделы</h2></div><button className="text-button" onClick={() => window.dispatchEvent(new CustomEvent('open-wiki-search'))}><Search size={16} /> Поиск по Wiki</button></div>
    <div className="catalog-cards">
      {courseCards.map((card, index) => {
        const item = navItems.find(nav => nav.id === card.id);
        const Icon = card.icon;
        return (
          <motion.button key={card.id} className="catalog-card" onClick={() => onNavigate(item?.path || '/')}
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            whileHover={reduceMotion ? undefined : { y: -4 }}
            viewport={{ once: true, amount: 0.18 }}
            transition={{ duration: reduceMotion ? 0 : 0.42, delay: reduceMotion ? 0 : (index % 3) * 0.06 }}>
            <div className="catalog-card-icon"><Icon size={22} /></div>
            <div className="catalog-card-body"><h3>{card.title}</h3><p>{card.desc}</p><span>{card.count}</span></div>
            <ArrowRight className="card-arrow" size={18} />
          </motion.button>
        );
      })}
    </div>

    <div className="section-heading compact"><div><p className="eyebrow">ИНСТРУМЕНТЫ</p><h2>Для ежедневной работы</h2></div></div>
    <div className="tool-grid"><button onClick={() => onNavigate('/crafts')} className="tool-card"><Factory size={20} /><span><strong>Крафты ГИБДД</strong><small>Каталог предметов и калькулятор материалов</small></span><ArrowRight size={17} /></button><button onClick={() => onNavigate('/servers')} className="tool-card"><Server size={20} /><span><strong>Онлайн Тверского</strong><small>Живой статус и динамика сервера</small></span><ArrowRight size={17} /></button><button onClick={() => onNavigate('/appendix')} className="tool-card"><FileText size={20} /><span><strong>Документы и формы</strong><small>Редактируемые бланки и приложения</small></span><ArrowRight size={17} /></button><button onClick={() => onNavigate('/promotion')} className="tool-card"><Wifi size={20} /><span><strong>Кадровые заявки</strong><small>Повышение, восстановление и перевод</small></span><ArrowRight size={17} /></button></div>

    <footer className="site-footer"><p>ГИБДД Россия Онлайн · игровая энциклопедия</p><p>Материалы созданы для проекта Россия Онлайн и не являются официальными документами.</p></footer>
  </PageTransition>;
}
