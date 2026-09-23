import { useCallback, useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Home from './pages/Home';
import ServiceBasics from './pages/ServiceBasics';
import ServiceCheck from './pages/ServiceCheck';
import DailyControl from './pages/DailyControl';
import Discipline from './pages/Discipline';
import Practice from './pages/Practice';
import Appendix from './pages/Appendix';
import Handbook from './pages/Handbook';
import ReportForm from './pages/ReportForm';
import AppealForm from './pages/AppealForm';
import RestoreForm from './pages/RestoreForm';
import ResignForm from './pages/ResignForm';
import TransferForm from './pages/TransferForm';
import ComplaintForm from './pages/ComplaintForm';
import PromotionForm from './pages/PromotionForm';

// GitHub Pages hosts under /<repo>/ — strip that base from routing
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const stripBase = (p: string) => (BASE && p.startsWith(BASE) ? p.slice(BASE.length) || '/' : p);

export default function App() {
  const [path, setPath] = useState(() => stripBase(window.location.pathname));
  // Sidebar is always open on desktop (layout already reserves space for it),
  // hidden by default on mobile
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1024);

  const navigate = useCallback((newPath: string) => {
    const target = BASE + newPath;
    if (target !== window.location.pathname) {
      window.history.pushState({ path: newPath }, '', target);
    }
    setPath(newPath);
    // Close the sidebar only on mobile — on desktop it stays as the user left it
    if (window.innerWidth < 1024) setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const handlePop = () => {
      setPath(stripBase(window.location.pathname));
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

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
      case '/restore': return <RestoreForm />;
      case '/resign': return <ResignForm />;
      case '/transfer': return <TransferForm />;
      case '/complaints': return <ComplaintForm />;
      case '/promotion': return <PromotionForm />;
      default: return <Home onNavigate={navigate} />;
    }
  };

  return (
    <div className="min-h-screen bg-[#050508] text-gray-200">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 -right-20 w-[600px] h-[600px] bg-purple-500/[0.02] rounded-full blur-3xl" />
        <div className="absolute bottom-0 -left-20 w-[500px] h-[500px] bg-cyan-500/[0.02] rounded-full blur-3xl" />
        <div className="absolute inset-0 bg-grid opacity-30" />
      </div>
      <Sidebar currentPath={path} onNavigate={navigate} isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      <Header onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} currentTitle={path} onNavigate={navigate} sidebarOpen={sidebarOpen} />
      <main className={`${sidebarOpen ? 'lg:ml-[260px]' : ''} transition-[margin] duration-300 pt-20 px-4 md:px-8 pb-20 min-h-screen relative z-10 max-w-5xl mx-auto`}>
        <AnimatePresence mode="wait"><div key={path}>{renderPage()}</div></AnimatePresence>
      </main>
    </div>
  );
}
