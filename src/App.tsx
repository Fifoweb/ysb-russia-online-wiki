import { lazy, Suspense, useCallback, useState, useEffect } from 'react';
import { useReducedMotion } from 'framer-motion';
import GlassFilters from './components/GlassFilters';
import RouteBoundary from './components/RouteBoundary';
import PortalLink from './components/PortalLink';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Home from './pages/Home';
import { supabase } from './lib/supabase';

const ServiceBasics = lazy(() => import('./pages/ServiceBasics'));
const ServiceCheck = lazy(() => import('./pages/ServiceCheck'));
const DailyControl = lazy(() => import('./pages/DailyControl'));
const Discipline = lazy(() => import('./pages/Discipline'));
const Practice = lazy(() => import('./pages/Practice'));
const Appendix = lazy(() => import('./pages/Appendix'));
const Handbook = lazy(() => import('./pages/Handbook'));
const ReportForm = lazy(() => import('./pages/ReportForm'));
const AppealForm = lazy(() => import('./pages/AppealForm'));
const ReprimandWorkForm = lazy(() => import('./pages/ReprimandWorkForm'));
const RestoreForm = lazy(() => import('./pages/RestoreForm'));
const ResignForm = lazy(() => import('./pages/ResignForm'));
const TransferForm = lazy(() => import('./pages/TransferForm'));
const DepartmentApplicationForm = lazy(() => import('./pages/DepartmentApplicationForm'));
const ComplaintForm = lazy(() => import('./pages/ComplaintForm'));
const EmployeeComplaintForm = lazy(() => import('./pages/EmployeeComplaintForm'));
const PromotionForm = lazy(() => import('./pages/PromotionForm'));
const SeniorPromotionReportForm = lazy(() => import('./pages/SeniorPromotionReportForm'));
const AcademyPromotionReportForm = lazy(() => import('./pages/AcademyPromotionReportForm'));
const Crafts = lazy(() => import('./pages/Crafts'));
const Servers = lazy(() => import('./pages/Servers'));
const AchievementsDashboard = lazy(() => import('./pages/AchievementsDashboard'));
const AchievementReportForm = lazy(() => import('./pages/AchievementReportForm'));

// GitHub Pages hosts under /<repo>/ — strip that base from routing
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const normalizePath = (p: string) => {
  const stripped = BASE && p.startsWith(BASE) ? p.slice(BASE.length) || '/' : p;
  return stripped.length > 1 ? stripped.replace(/\/+$/, '') : stripped;
};

export default function App() {
  const reduceMotion = useReducedMotion();
  const [path, setPath] = useState(() => normalizePath(window.location.pathname));
  // Navigation opens as a modal without shifting the reading area.
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navigate = useCallback((newPath: string) => {
    const target = BASE + newPath;
    if (target !== window.location.pathname) {
      window.history.pushState({ path: newPath }, '', target);
    }
    setPath(newPath);
    // Close the sidebar only on mobile — on desktop it stays as the user left it
    if (window.innerWidth < 1024) setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [reduceMotion]);

  useEffect(() => {
    const handlePop = () => {
      setPath(normalizePath(window.location.pathname));
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  useEffect(() => {
    if (!supabase || path !== '/') return;
    const restore = () => {
      try {
        const started = Number(sessionStorage.getItem('achievement-report-return'));
        if (!started || Date.now() - started > 15 * 60_000) return;
        sessionStorage.removeItem('achievement-report-return');
        navigate('/achievement-report');
      } catch { /* Storage may be unavailable. */ }
    };
    void supabase.auth.getSession().then(({ data }) => { if (data.session) restore(); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { if (session) restore(); });
    return () => listener.subscription.unsubscribe();
  }, [path, navigate]);

  const renderPage = () => {
    switch (path) {
      case '/': return <Home onNavigate={navigate} />;
      case '/basics': return <ServiceBasics />;
      case '/check': return <ServiceCheck />;
      case '/control': return <DailyControl />;
      case '/discipline': return <Discipline />;
      case '/practice': return <Practice />;
      case '/appendix': return <Appendix />;
      case '/handbook': return <Handbook />;
      case '/report': return <ReportForm />;
      case '/appeal': return <AppealForm />;
      case '/reprimand-work': return <ReprimandWorkForm />;
      case '/restore': return <RestoreForm />;
      case '/resign': return <ResignForm />;
      case '/transfer': return <TransferForm />;
      case '/department': return <DepartmentApplicationForm />;
      case '/complaints': return <ComplaintForm />;
      case '/employee-complaint': return <EmployeeComplaintForm />;
      case '/promotion': return <PromotionForm />;
      case '/senior-report': return <SeniorPromotionReportForm />;
      case '/academy-report': return <AcademyPromotionReportForm />;
      case '/crafts': return <Crafts />;
      case '/servers': return <Servers />;
      case '/achievements': return <AchievementsDashboard />;
      case '/achievement-report': return <AchievementReportForm onNavigate={navigate} />;
      default: return <section className="portal-route-error"><span className="portal-error-code">404</span><h1>Такой страницы нет</h1><p>Возможно, ссылка устарела. Все материалы доступны с главной страницы.</p><PortalLink path="/" onNavigate={navigate} className="portal-primary">Вернуться на главную</PortalLink></section>;
    }
  };

  return (
    <div className="min-h-screen portal-shell">
      <GlassFilters />
      <a className="portal-skip-link" href="#main-content">Перейти к содержимому</a>
      <Sidebar currentPath={path} onNavigate={navigate} isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      <Header onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} currentTitle={path} onNavigate={navigate} sidebarOpen={sidebarOpen} />
      <main id="main-content" tabIndex={-1} className={`site-main portal-main px-4 md:px-8 pb-20 min-h-screen relative z-10${sidebarOpen ? ' site-main-with-sidebar' : ''}`}>
          <div key={path}>
            <RouteBoundary>
            <Suspense fallback={<div className="portal-route-skeleton" role="status" aria-label="Открываем раздел…"><span /><span /><span /></div>}>
              {renderPage()}
            </Suspense>
            </RouteBoundary>
          </div>
      </main>
    </div>
  );
}
