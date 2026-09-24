import { useMemo, useState } from 'react';
import { Calculator, Minus, Package, Plus, Search, Shield, Stethoscope, Wrench, X } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import { craftCategoryLabels, craftItems, type CraftCategory, type CraftItem } from '../data/crafts';

const categoryIcons: Record<CraftCategory, typeof Shield> = { medical: Stethoscope, weapon: Shield, technical: Wrench };
const categoryColors: Record<CraftCategory, string> = { medical: '#ef4444', weapon: '#55c271', technical: '#38bdf8' };

export default function Crafts() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | CraftCategory>('all');
  const [selected, setSelected] = useState<Record<string, number>>({});

  const filtered = useMemo(() => craftItems.filter(item =>
    (category === 'all' || item.category === category) && item.name.toLowerCase().includes(query.trim().toLowerCase())
  ), [category, query]);
  const selectedItems = craftItems.filter(item => selected[item.id]);
  const totalMaterials = selectedItems.reduce((sum, item) => sum + item.materials * (selected[item.id] || 0), 0);
  const totalWeight = selectedItems.reduce((sum, item) => sum + item.weightKg * (selected[item.id] || 0), 0);

  const changeQuantity = (item: CraftItem, delta: number) => {
    setSelected(current => {
      const next = Math.max(0, Math.min(999, (current[item.id] || 0) + delta));
      const copy = { ...current };
      if (next) copy[item.id] = next; else delete copy[item.id];
      return copy;
    });
  };
  const setQuantity = (item: CraftItem, value: string) => {
    const next = Math.max(0, Math.min(999, Number(value) || 0));
    setSelected(current => {
      const copy = { ...current };
      if (next) copy[item.id] = next; else delete copy[item.id];
      return copy;
    });
  };

  return (
    <PageTransition className="catalog-page">
      <div className="page-heading">
        <p className="eyebrow">КАТАЛОГ ГИБДД</p>
        <h1>Крафты фракции</h1>
        <p>Предметы, доступные сотрудникам ГИБДД на сервере Россия Онлайн. Соберите список и сразу посчитайте материалы.</p>
      </div>

      <div className="toolbar">
        <label className="catalog-search"><Search size={18} aria-hidden="true" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Поиск предметов..." aria-label="Поиск предметов" /></label>
        <div className="segmented" role="tablist" aria-label="Категория крафтов">
          <button className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')} role="tab" aria-selected={category === 'all'}>Все</button>
          {(Object.keys(craftCategoryLabels) as CraftCategory[]).map(key => { const Icon = categoryIcons[key]; return <button key={key} className={category === key ? 'active' : ''} onClick={() => setCategory(key)} role="tab" aria-selected={category === key}><Icon size={16} style={{ color: categoryColors[key] }} /><span className="hidden sm:inline">{craftCategoryLabels[key]}</span></button>; })}
        </div>
      </div>

      <div className="category-tabs">
        <button className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')}>Все предметы</button>
        {(Object.keys(craftCategoryLabels) as CraftCategory[]).map(key => <button key={key} className={category === key ? 'active' : ''} onClick={() => setCategory(key)}>{craftCategoryLabels[key]}</button>)}
      </div>

      <div className="craft-layout">
        <div className="craft-list">
          <div className="result-count">{filtered.length} предметов</div>
          <div className="craft-grid">
            {filtered.map(item => {
              const quantity = selected[item.id] || 0;
              const Icon = categoryIcons[item.category];
              return <article className={`craft-card ${quantity ? 'selected' : ''}`} key={item.id}>
                <div className="craft-card-title"><span>{item.name}</span>{quantity > 0 && <span className="quantity-badge">×{quantity}</span>}</div>
                <div className="craft-image-wrap"><span className="craft-fallback" aria-hidden="true">{item.name.slice(0, 1)}</span><img src={item.image} alt={item.name} loading="lazy" onError={event => { event.currentTarget.style.display = 'none'; }} /></div>
                <div className="craft-meta"><span style={{ color: categoryColors[item.category] }}><Icon size={15} /> {item.materials}</span><span><Package size={14} /> {item.weightKg.toFixed(3)} кг</span></div>
                {quantity ? <div className="quantity-control"><button onClick={() => changeQuantity(item, -1)} aria-label={`Уменьшить ${item.name}`}><Minus size={16} /></button><input type="number" min="1" max="999" value={quantity} onChange={event => setQuantity(item, event.target.value)} aria-label={`Количество ${item.name}`} /><button onClick={() => changeQuantity(item, 1)} aria-label={`Увеличить ${item.name}`}><Plus size={16} /></button></div> : <button className="add-craft" onClick={() => changeQuantity(item, 1)}><Plus size={16} /> В калькулятор</button>}
              </article>;
            })}
          </div>
        </div>

        <aside className={`craft-calculator ${selectedItems.length ? 'has-items' : ''}`} aria-label="Калькулятор крафта">
          <div className="calculator-heading"><div><p className="eyebrow">ИНСТРУМЕНТ</p><h2><Calculator size={18} /> Калькулятор</h2></div>{selectedItems.length > 0 && <button className="icon-button" onClick={() => setSelected({})} title="Очистить калькулятор" aria-label="Очистить калькулятор"><X size={17} /></button>}</div>
          {selectedItems.length ? <>
            <div className="calculator-items">{selectedItems.map(item => <div className="calculator-item" key={item.id}><span>{item.name}</span><strong>×{selected[item.id]}</strong></div>)}</div>
            <div className="calculator-total"><span>Материалы</span><strong>{totalMaterials.toLocaleString('ru-RU')}</strong><span>Вес</span><strong>{totalWeight.toFixed(3)} кг</strong></div>
          </> : <div className="calculator-empty"><Calculator size={24} /><p>Добавьте предметы в список, чтобы увидеть итог.</p></div>}
        </aside>
      </div>
    </PageTransition>
  );
}
