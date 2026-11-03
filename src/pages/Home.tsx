import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowRight, ArrowUpRight, BookOpenText, ClipboardText, FileText,
  GraduationCap, MagnifyingGlass, Scales, ShieldCheck, ShieldStar, Toolbox, Trophy, UsersThree, WifiHigh,
} from '@phosphor-icons/react';
import PortalLink from '../components/PortalLink';
import { fetchTverskoyOnline } from '../lib/online';

interface HomeProps { onNavigate: (path: string) => void; }
const courseCards = [
  { path: '/basics', title: 'Основа службы', desc: 'Полномочия, рабочий комплект и первые шаги на смене.', count: 'Темы 1–5', icon: ShieldCheck },
  { path: '/check', title: 'Служебная проверка', desc: 'От первого сообщения до объяснений и доказательств.', count: 'Темы 6–11', icon: MagnifyingGlass },
  { path: '/control', title: 'Повседневный контроль', desc: 'Патруль, документы, транспорт и применение силы.', count: 'Темы 12–13', icon: ClipboardText },
  { path: '/discipline', title: 'Дисциплина и решения', desc: 'Квалификация нарушений, взыскания и работа с материалами.', count: 'Темы 14–24', icon: Scales },
  { path: '/practice', title: 'Практика и зачёт', desc: 'Учебные ситуации, самостоятельные задачи и проверка знаний.', count: 'Темы 25–28', icon: GraduationCap },
  { path: '/appendix', title: 'Приложения и формы', desc: 'Рабочие бланки, личные копии и готовые документы.', count: 'Формы Ф1–Ф5', icon: FileText },
];
const tools = [
  { path: '/crafts', title: 'Крафты ГИБДД', desc: 'Подберите предметы и рассчитайте материалы.', icon: Toolbox },
  { path: '/handbook', title: 'Памятка сотрудника', desc: 'Найдите нужную статью и сохраните в избранное.', icon: BookOpenText },
  { path: '/promotion', title: 'Кадровые заявки', desc: 'Откройте форму и подготовьте запрос на повышение.', icon: UsersThree },
  { path: '/achievements', title: 'Ачивки фракции', desc: 'Следите за целями недели и вкладом отделов.', icon: Trophy },
];
const entrance = [0.16, 1, 0.3, 1] as const;

function Tagline() {
  const ref = useRef<HTMLParagraphElement>(null);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    const words = ref.current?.querySelectorAll('span');
    if (!words || reduceMotion) return;
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.setAttribute('data-visible', 'true');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 1, rootMargin: '0px 0px -12% 0px' });
    words.forEach(word => observer.observe(word));
    return () => observer.disconnect();
  }, [reduceMotion]);
  return <p ref={ref} className="portal-tagline">
    {['Меньше', 'поисков.'].map((word, index) => <span key={word} style={{ transitionDelay: index * 80 + 'ms' }}>{word}{' '}</span>)}
    <br />
    {['Больше', 'уверенности.'].map((word, index) => <span key={word} style={{ transitionDelay: (index + 2) * 80 + 'ms' }}>{word}{' '}</span>)}
  </p>;
}

export default function Home({ onNavigate }: HomeProps) {
  const reduceMotion = useReducedMotion();
  const [online, setOnline] = useState<number | null>(null);
  const [onlineFailed, setOnlineFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetchTverskoyOnline(controller.signal).then(value => setOnline(value.current))
      .catch(() => { if (!controller.signal.aborted) setOnlineFailed(true); });
    return () => controller.abort();
  }, []);
  const reveal = (delay = 0) => ({
    initial: reduceMotion ? false as const : { opacity: 0, y: 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.3 },
    transition: { duration: reduceMotion ? 0 : 0.9, ease: entrance, delay: reduceMotion ? 0 : delay },
  });

  return <div className="portal-home">
    <section className="portal-hero" aria-labelledby="portal-hero-title">
      <figure className="portal-hero-photo">
        <img src={import.meta.env.BASE_URL + 'gibdd-hero.webp'}
          alt="Патрульный автомобиль ГИБДД на вечерней городской набережной"
          width={1200} height={751} {...{ fetchpriority: 'high' }} />
      </figure>
      <div className="portal-hero-copy">
        <motion.div {...reveal()} className="portal-hero-context"><ShieldStar size={20} weight="duotone" aria-hidden="true" /> ГИБДД Вики <span>Россия Онлайн</span></motion.div>
        <motion.h1 {...reveal(0.08)} id="portal-hero-title">Уверенно<br />на службе.</motion.h1>
        <motion.p {...reveal(0.16)} className="portal-hero-lead">Знания, документы и инструменты фракции. Ваша опора на каждой смене.</motion.p>
        <motion.div {...reveal(0.24)} className="portal-hero-actions">
          <PortalLink path="/basics" onNavigate={onNavigate} className="portal-primary">Открыть курс <ArrowUpRight size={20} aria-hidden="true" /></PortalLink>
        </motion.div>
      </div>
      <PortalLink path="/servers" onNavigate={onNavigate} className="portal-live-card liquid-glass refractive" aria-label="Открыть мониторинг сервера Тверской">
        <span className="portal-live-heading"><span className={online === null ? 'portal-live-dot pending' : 'portal-live-dot'} /> Тверской <ArrowUpRight size={18} aria-hidden="true" /></span>
        <span className={'portal-live-value' + (onlineFailed ? ' is-unavailable' : '')} aria-live="polite">{online === null ? <span className={onlineFailed ? '' : 'portal-number-skeleton'}>{onlineFailed ? 'Нет данных' : '—'}</span> : online.toLocaleString('ru-RU')}</span>
        <span className="portal-live-caption"><WifiHigh size={16} aria-hidden="true" /> {onlineFailed ? 'Источник временно недоступен' : online === null ? 'Получаем онлайн…' : 'игроков на сервере сейчас'}</span>
      </PortalLink>
    </section>

    <motion.section {...reveal()} className="portal-search-strip" aria-label="Быстрый поиск">
      <div className="portal-search-description"><MagnifyingGlass size={24} aria-hidden="true" /><div><h2>Нужен конкретный ответ?</h2><p>Найдите статью, форму или документ по названию.</p></div></div>
      <button type="button" className="portal-search-trigger" onClick={() => window.dispatchEvent(new CustomEvent('open-wiki-search'))}>Поиск по Вики <kbd>Ctrl K</kbd></button>
    </motion.section>

    <section className="portal-course" aria-labelledby="portal-course-title">
      <div className="portal-section-heading"><h2 id="portal-course-title">Все разделы</h2><span className="portal-section-meta"><BookOpenText size={18} aria-hidden="true" /> 28 тем курса</span></div>
      <div className="portal-course-grid">
        {courseCards.map((card, index) => {
          const Icon = card.icon;
          return <motion.div key={card.path} {...reveal((index % 3) * 0.08)}>
            <PortalLink path={card.path} onNavigate={onNavigate} className={'portal-course-card' + (index === 0 ? ' first-course' : '')}>
              <div className="portal-course-top"><span className="portal-course-icon"><Icon size={24} weight="duotone" aria-hidden="true" /></span><span>{card.count}</span><ArrowUpRight size={18} aria-hidden="true" /></div>
              <h3>{card.title}</h3><p>{card.desc}</p>
              {index === 0 && <span className="portal-start-hint">Начните отсюда <ArrowRight size={16} aria-hidden="true" /></span>}
            </PortalLink>
          </motion.div>;
        })}
      </div>
    </section>

    <section className="portal-tools" aria-labelledby="portal-tools-title">
      <div className="portal-section-heading"><h2 id="portal-tools-title">Для ежедневной работы</h2></div>
      <div className="portal-tool-grid">{tools.map((tool, index) => {
        const Icon = tool.icon;
        return <motion.div key={tool.path} {...reveal((index % 2) * 0.08)}>
          <PortalLink path={tool.path} onNavigate={onNavigate} className="portal-tool-card">
            <Icon size={24} weight="duotone" aria-hidden="true" /><div><h3>{tool.title}</h3><p>{tool.desc}</p></div><ArrowUpRight size={20} aria-hidden="true" />
          </PortalLink>
        </motion.div>;
      })}</div>
    </section>

    <section className="portal-closing" aria-label="Всё необходимое для службы">
      <Tagline />
      <PortalLink path="/basics" onNavigate={onNavigate} className="portal-secondary">Открыть курс <ArrowUpRight size={20} aria-hidden="true" /></PortalLink>
    </section>
    <footer className="portal-footer">
      <div className="portal-footer-brand"><ShieldStar size={24} weight="duotone" aria-hidden="true" /><span>ГИБДД Вики</span><span>Россия Онлайн</span></div>
      <p>Игровая энциклопедия фракции.<br />Материалы не являются официальными документами.</p>
      <PortalLink path="/handbook" onNavigate={onNavigate}>Памятка сотрудника <ArrowUpRight size={16} aria-hidden="true" /></PortalLink>
    </footer>
  </div>;
}
