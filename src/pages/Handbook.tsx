import { useEffect, useMemo, useState } from 'react';
import PageTransition from '../components/PageTransition';
import { handbookCategories, HandbookArticle, HandbookPart } from '../data/handbook';
import { useAuth } from '../lib/auth';
import { loadRemoteFavorites, saveRemoteFavorites } from '../lib/db';

const FAV_KEY = 'usb-favs';

function loadLocalFavs(): string[] {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch { return []; }
}

const Star = ({ filled }: { filled: boolean }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
  </svg>
);

interface Row {
  id: string;
  catName: string;
  article: HandbookArticle;
  part?: HandbookPart;
}

export default function Handbook() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'all' | 'fav'>('all');
  const [query, setQuery] = useState('');
  const [favs, setFavs] = useState<string[]>(loadLocalFavs);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  // Cloud sync of favorites for logged-in users (localStorage is the guest fallback)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    loadRemoteFavorites(user.id, loadLocalFavs()).then(ids => {
      if (!cancelled) { setFavs(ids); localStorage.setItem(FAV_KEY, JSON.stringify(ids)); }
    });
    return () => { cancelled = true; };
  }, [user]);

  const toggleFav = (id: string) => {
    const next = favs.includes(id) ? favs.filter(x => x !== id) : [...favs, id];
    setFavs(next);
    localStorage.setItem(FAV_KEY, JSON.stringify(next));
    if (user) void saveRemoteFavorites(user.id, next);
  };

  const q = query.trim().toLowerCase();
  const match = (text: string) => text.toLowerCase().includes(q);
  const articleMatches = (a: HandbookArticle) =>
    !q ||
    match(`${a.num} ${a.title} ${a.punishment || ''}`) ||
    (a.parts || []).some(p => match(`${p.num} ${p.title} ${p.punishment}`)) ||
    (a.items || []).some(i => match(i));

  // Flat list of every row (articles + parts) — used by the favorites tab
  const allRows = useMemo<Row[]>(() => {
    const rows: Row[] = [];
    for (const c of handbookCategories) {
      for (const a of c.articles) {
        rows.push({ id: a.id, catName: c.name, article: a });
        for (const p of a.parts || []) rows.push({ id: p.id, catName: c.name, article: a, part: p });
      }
    }
    return rows;
  }, []);

  const favRows = allRows.filter(r => favs.includes(r.id) &&
    (!q || match(`${r.article.num} ${r.article.title} ${r.part ? r.part.num + ' ' + r.part.title + ' ' + r.part.punishment : ''} ${(r.article.items || []).join(' ')}`)));

  // Favorites are available only after Discord login
  const favBtn = (id: string) => !user ? null : (
    <button onClick={(e) => { e.stopPropagation(); toggleFav(id); }}
      title={favs.includes(id) ? 'Убрать из избранного' : 'В избранное'}
      className={`shrink-0 p-1.5 rounded-lg transition-all ${favs.includes(id) ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-400/70'}`}>
      <Star filled={favs.includes(id)} />
    </button>
  );

  const partRow = (p: HandbookPart) => (
    <div key={p.id} className="flex items-start gap-2 pl-3 pr-2 py-2.5 border-t border-purple-500/5">
      <span className="font-mono text-[10px] text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.5 rounded whitespace-nowrap">{p.num}</span>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-gray-200">{p.title}</div>
        <p className="text-[11px] text-gray-500 leading-relaxed mt-0.5 !mb-0">{p.punishment}</p>
      </div>
      {favBtn(p.id)}
    </div>
  );

  const articleBlock = (a: HandbookArticle, catName: string) => {
    const hasParts = Boolean(a.parts?.length);
    const isOpen = open[a.id] ?? Boolean(q); // auto-expand while searching
    return (
      <div key={a.id} className="rounded-xl border border-purple-500/10 bg-white/[0.02] overflow-hidden">
        <div className="flex items-center gap-1 pr-2">
          <button onClick={() => hasParts && setOpen(o => ({ ...o, [a.id]: !isOpen }))}
            className={`flex-1 flex items-start gap-2 px-3 py-2.5 text-left ${hasParts ? 'cursor-pointer' : 'cursor-default'}`}>
            {a.num && (
              <span className="font-mono text-[10px] text-purple-300 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded whitespace-nowrap shrink-0">{a.num}</span>
            )}
            <span className="flex-1 min-w-0 text-xs font-medium text-gray-200 leading-snug">{a.title}</span>
            {hasParts && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                <path d="M6 9l6 6 6-6"/>
              </svg>
            )}
          </button>
          {favBtn(a.id)}
        </div>

        {a.punishment && (
          <p className="text-xs text-gray-500 leading-relaxed px-3 pb-2.5 !mb-0">{a.punishment}</p>
        )}
        {hasParts && isOpen && <div>{a.parts!.map(partRow)}</div>}
        {a.items && (
          <ol className="px-5 pb-3 pt-1 space-y-1 list-none">
            {a.items.map((item, i) => (
              <li key={i} className="text-xs text-gray-400 leading-relaxed flex gap-2">
                <span className="text-purple-400 font-mono shrink-0">{i + 1}.</span><span>{item}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  };

  return (
    <PageTransition className="wiki-content">
      <div className="glass rounded-2xl p-8 border border-purple-500/10 mb-6">
        <h2 className="!mt-0 !mb-2">📕 Памятка Россия Онлайн</h2>
        <p className="text-sm text-gray-500 !mb-0">Выдержки из кодексов: статьи, части, наказания и порядок задержания. {user ? 'Нажмите ★ — статья попадёт в избранное и сохранится в вашем аккаунте.' : 'Войдите через Discord, чтобы добавлять статьи в избранное ★'}</p>
      </div>

      {/* Search + tabs */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск по памятке..."
          className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-purple-500/20 text-sm text-gray-200 outline-none focus:border-purple-500/50 transition-all placeholder:text-gray-600" />
        <div className="flex rounded-xl overflow-hidden border border-purple-500/20 shrink-0">
          {([['all', 'Все статьи'], ['fav', user ? `Избранные (${favs.length})` : 'Избранные 🔒']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-xs font-mono transition-all ${tab === key ? 'bg-purple-500/25 text-purple-200' : 'bg-white/5 text-gray-400 hover:text-gray-200'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'all' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          {handbookCategories.map(c => {
            const arts = c.articles.filter(articleMatches);
            if (!arts.length) return null;
            return (
              <section key={c.id} className="glass rounded-2xl p-4 border border-purple-500/10">
                <h2 className="!mt-0 !text-base !border-b !border-purple-500/20 !pb-2">{c.name}</h2>
                <div className="space-y-2">{arts.map(a => articleBlock(a, c.name))}</div>
              </section>
            );
          })}
        </div>
      ) : (
        <section className="glass rounded-2xl p-6 border border-yellow-500/15 mb-6">
          <h2 className="!mt-0 !text-lg">⭐ Избранные статьи</h2>
          {!user ? (
            <div className="rounded-lg border border-purple-500/15 bg-white/[0.02] p-4">
              <p className="text-sm text-gray-500 !mb-0 leading-relaxed">
                🔒 Избранное доступно после входа через Discord — кнопка «Войти через Discord» вверху сайта.
              </p>
            </div>
          ) : favRows.length === 0 ? (
            <p className="text-sm text-gray-500 !mb-0">Пока пусто. Откройте «Все статьи» и нажмите ★ у нужных статей.</p>
          ) : (
            <div className="space-y-2">
              {favRows.map(r => (
                <div key={r.id}>
                  <div className="text-[10px] font-mono text-gray-600 uppercase tracking-wider mb-1 px-1">{r.catName}</div>
                  {r.part ? (
                    <div className="rounded-xl border border-purple-500/10 bg-white/[0.02] overflow-hidden">{partRow(r.part)}</div>
                  ) : articleBlock(r.article, r.catName)}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </PageTransition>
  );
}
