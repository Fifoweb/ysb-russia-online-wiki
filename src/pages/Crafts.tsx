import { useMemo, useState } from 'react';
import { Calculator, Download, Minus, Package, Plus, Search, Trash2, X } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import { craftCategoryLabels, craftItems, type CraftCategory, type CraftItem } from '../data/crafts';

const categoryColors: Record<CraftCategory, string> = { medical: '#ef4444', weapon: '#55c271', technical: '#38bdf8' };
const MAX_QUANTITY = 99_999;
const materialIcons: Record<CraftCategory, { viewBox: string; path: string }> = {
  medical: {
    viewBox: '0 0 16 16',
    path: 'M13.941,3.353H13.63V2.859a.217.217,0,0,0-.217-.217H12.2a.217.217,0,0,0-.217.217v.494H10.9V2.8A1.531,1.531,0,0,0,9.37,1.273H6.63A1.531,1.531,0,0,0,5.1,2.8v.551H4.022V2.859A.217.217,0,0,0,3.8,2.642H2.587a.217.217,0,0,0-.217.217v.494H2.059A2.059,2.059,0,0,0,0,5.412v7.257a2.059,2.059,0,0,0,2.059,2.059H13.941A2.059,2.059,0,0,0,16,12.668V5.412A2.059,2.059,0,0,0,13.941,3.353ZM5.971,2.8a.66.66,0,0,1,.659-.659H9.37a.66.66,0,0,1,.659.659v.551H5.971ZM8,12.748A3.708,3.708,0,1,1,11.708,9.04,3.708,3.708,0,0,1,8,12.748Zm2.784-2.8a.217.217,0,0,1-.217.218H9.131v1.436a.217.217,0,0,1-.217.217H7.087a.217.217,0,0,1-.217-.217V10.172H5.435a.217.217,0,0,1-.217-.217l0-1.827a.217.217,0,0,1,.217-.218H6.869V6.474a.217.217,0,0,1,.217-.217H8.913a.217.217,0,0,1,.217.217V7.908h1.434a.217.217,0,0,1,.217.217Z',
  },
  weapon: {
    viewBox: '0 0 16 16',
    path: 'M.184,13.883l1.462,1.731s.516.73.887.183,2.595-5.054,2.595-5.054.223-.368.379.289,1.44,3.837,1.44,3.837a.29.29,0,0,0,.427.07l1.168-.984s.315-.1-.011-.723S7,9.767,7,9.767,6.83,9.4,7.083,9.19s.58-.457.58-.457.146-.3.547.016a8.064,8.064,0,0,0,3.319,1.917,18.325,18.325,0,0,0,3.317.5s.379.014.432-.633.023-1.55.023-1.55.036-.432-.343-.444a5.255,5.255,0,0,1-1.832-.119,14.9,14.9,0,0,1-2.641-1.588.285.285,0,0,1-.021-.461L12.643,4.53s.327-.244.13-.478l-.3-.35L15.94.778,15.282,0,11.82,2.923l-.284-.257s-.253-.22-.467-.04S8.62,4.658,8.62,4.658s-.63-.666-1.1-.272L4.219,7.178a.63.63,0,0,0-.026.521c.1.352.274.6.1.749L3.2,9.367a.95.95,0,0,0-.223.723,1.786,1.786,0,0,1-.734,1.419c-.5.427-1.962,1.623-1.962,1.623A.537.537,0,0,0,.184,13.883Z',
  },
  technical: {
    viewBox: '0 0 18.3 16',
    path: 'M7.454.254,7.187,0,.761,4.171l.411.411c.159.159,3.922,3.887,6.894,3.887h.142l7.031-4.687H13.691C11.1,3.781,7.49.288,7.454.254ZM11.928,10.865,8.491,13.156H8.066c-1.99,0-4.169-1.358-5.683-2.53L.761,11.671l.411.411C1.331,12.24,5.093,16,8.066,16h.142l7.031-4.719H13.691A4.73,4.73,0,0,1,11.928,10.865ZM11.928,7.115,8.491,9.406H8.066c-1.99,0-4.169-1.358-5.683-2.53L.761,7.921l.411.411c.159.159,3.922,3.887,6.894,3.887h.142l7.031-4.687H13.691A4.73,4.73,0,0,1,11.928,7.115Z',
  },
};

function MaterialIcon({ category, size = 16 }: { category: CraftCategory; size?: number }) {
  const icon = materialIcons[category];
  return <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox={icon.viewBox} fill="currentColor"><path d={icon.path} /></svg>;
}

const loadExportImage = (src: string) => new Promise<HTMLImageElement | null>(resolve => {
  const image = new Image();
  const timeout = window.setTimeout(() => resolve(null), 1500);
  const finish = (result: HTMLImageElement | null) => { window.clearTimeout(timeout); resolve(result); };
  image.crossOrigin = 'anonymous';
  image.onload = () => finish(image);
  image.onerror = () => finish(null);
  image.src = src;
});

export default function Crafts() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | CraftCategory>('all');
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [isExporting, setIsExporting] = useState(false);

  const filtered = useMemo(() => craftItems.filter(item =>
    (category === 'all' || item.category === category) && item.name.toLowerCase().includes(query.trim().toLowerCase())
  ), [category, query]);
  const selectedItems = craftItems.filter(item => selected[item.id]);
  const totalItems = selectedItems.reduce((sum, item) => sum + (selected[item.id] || 0), 0);
  const totalWeight = selectedItems.reduce((sum, item) => sum + item.weightKg * (selected[item.id] || 0), 0);
  const materialTotals = useMemo(() => (Object.keys(craftCategoryLabels) as CraftCategory[]).reduce((totals, key) => {
    totals[key] = selectedItems
      .filter(item => item.category === key)
      .reduce((sum, item) => sum + item.materials * (selected[item.id] || 0), 0);
    return totals;
  }, {} as Record<CraftCategory, number>), [selectedItems, selected]);
  const totalMaterials = (Object.keys(materialTotals) as CraftCategory[]).reduce((sum, key) => sum + materialTotals[key], 0);

  const changeQuantity = (item: CraftItem, delta: number) => {
    setSelected(current => {
      const next = Math.max(0, Math.min(MAX_QUANTITY, (current[item.id] || 0) + delta));
      const copy = { ...current };
      if (next) copy[item.id] = next; else delete copy[item.id];
      return copy;
    });
  };
  const setQuantity = (item: CraftItem, value: string) => {
    const next = Math.max(0, Math.min(MAX_QUANTITY, Number(value) || 0));
    setSelected(current => {
      const copy = { ...current };
      if (next) copy[item.id] = next; else delete copy[item.id];
      return copy;
    });
  };

  const exportCalculator = async () => {
    if (!selectedItems.length || isExporting) return;

    setIsExporting(true);
    try {
      const scale = 2;
      const width = 760;
      const padding = 32;
      const itemHeight = 78;
      const height = 190 + selectedItems.length * itemHeight + 220;
      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.scale(scale, scale);
      context.fillStyle = '#151212';
      context.fillRect(0, 0, width, height);
      context.fillStyle = '#e9e1df';
      context.font = '800 24px Inter, Arial, sans-serif';
      context.fillText('Калькулятор крафта', padding, 45);
      context.fillStyle = '#968b87';
      context.font = '500 15px Inter, Arial, sans-serif';
      context.fillText(`${totalItems} шт.  ·  ${totalMaterials.toLocaleString('ru-RU')} мат.  ·  ${totalWeight.toFixed(2)} кг`, padding, 72);

      let y = 105;
      for (const item of selectedItems) {
        const quantity = selected[item.id] || 0;
        context.fillStyle = '#0e0c0c';
        context.fillRect(padding, y, width - padding * 2, 62);
        const loadedImage = Array.from(document.querySelectorAll<HTMLImageElement>('.calculator-item-image img')).find(candidate => candidate.getAttribute('src') === item.image && candidate.complete && candidate.naturalWidth > 0);
        const image = loadedImage || await loadExportImage(item.image);
        if (image) {
          const imageSize = 48;
          const ratio = Math.min(imageSize / image.naturalWidth, imageSize / image.naturalHeight);
          const imageWidth = image.naturalWidth * ratio;
          const imageHeight = image.naturalHeight * ratio;
          context.drawImage(image, padding + 10 + (imageSize - imageWidth) / 2, y + 7 + (imageSize - imageHeight) / 2, imageWidth, imageHeight);
        }
        context.fillStyle = '#eee7e5';
        context.font = '700 15px Inter, Arial, sans-serif';
        context.fillText(item.name, padding + 76, y + 36, width - padding * 2 - 76 - 120);
        context.fillStyle = '#9f9591';
      context.font = '500 14px Inter, Arial, sans-serif';
      context.textAlign = 'right';
      context.fillText(`×${quantity}`, width - padding - 10, y + 36);
      context.textAlign = 'left';
      y += itemHeight;
      }

      context.fillStyle = '#786e6b';
      context.font = '800 11px Inter, Arial, sans-serif';
      context.fillText('ИТОГО', padding, y + 5);
      y += 29;
      for (const key of Object.keys(craftCategoryLabels) as CraftCategory[]) {
        context.fillStyle = categoryColors[key];
        context.font = '600 14px Inter, Arial, sans-serif';
        context.fillText(`${craftCategoryLabels[key]} материалы`, padding, y);
        context.fillStyle = '#f0e9e7';
        context.font = '800 14px Inter, Arial, sans-serif';
        context.fillText(materialTotals[key].toLocaleString('ru-RU'), width - padding - 42, y);
        y += 28;
      }
      context.fillStyle = '#968b87';
      context.font = '600 14px Inter, Arial, sans-serif';
      context.fillText('Общий вес', padding, y);
      context.fillStyle = '#f0e9e7';
      context.font = '800 14px Inter, Arial, sans-serif';
      context.fillText(`${totalWeight.toFixed(2)} кг`, width - padding - 65, y);

      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) return;
      const link = document.createElement('a');
      const objectUrl = URL.createObjectURL(blob);
      link.download = `gibdd-krafty-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = objectUrl;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      window.setTimeout(() => { URL.revokeObjectURL(objectUrl); link.remove(); }, 30000);
    } finally {
      setIsExporting(false);
    }
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
          {(Object.keys(craftCategoryLabels) as CraftCategory[]).map(key => <button key={key} className={category === key ? 'active' : ''} onClick={() => setCategory(key)} role="tab" aria-selected={category === key}><MaterialIcon category={key} size={16} /><span className="hidden sm:inline">{craftCategoryLabels[key]}</span></button>)}
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
              return <article className={`craft-card ${quantity ? 'selected' : ''}`} key={item.id}>
                <div className="craft-card-title"><span>{item.name}</span>{quantity > 0 && <span className="quantity-badge">×{quantity}</span>}</div>
                <div className="craft-image-wrap"><span className="craft-fallback" aria-hidden="true"><Package size={24} /></span><img src={item.image} alt={item.name} loading="lazy" onError={event => { event.currentTarget.style.display = 'none'; event.currentTarget.parentElement?.classList.add('image-error'); }} /></div>
                <div className="craft-meta"><span style={{ color: categoryColors[item.category] }}><MaterialIcon category={item.category} size={15} /> {item.materials}</span><span><Package size={14} /> {item.weightKg.toFixed(3)} кг</span></div>
                {quantity ? <div className="quantity-control"><button onClick={() => changeQuantity(item, -1)} aria-label={`Уменьшить ${item.name}`}><Minus size={16} /></button><input type="number" min="1" max={MAX_QUANTITY} value={quantity} onChange={event => setQuantity(item, event.target.value)} aria-label={`Количество ${item.name}`} /><button onClick={() => changeQuantity(item, 1)} aria-label={`Увеличить ${item.name}`}><Plus size={16} /></button></div> : <button className="add-craft" onClick={() => changeQuantity(item, 1)}><Plus size={16} /> В калькулятор</button>}
              </article>;
            })}
          </div>
        </div>

        <aside className={`craft-calculator ${selectedItems.length ? 'has-items' : ''}`} aria-label="Калькулятор крафта">
          <div className="calculator-heading"><div><p className="eyebrow">ИНСТРУМЕНТ</p><h2><Calculator size={18} /> Калькулятор крафта</h2>{selectedItems.length > 0 && <p className="calculator-subtitle">{totalItems} шт. · {totalMaterials.toLocaleString('ru-RU')} мат. · {totalWeight.toFixed(2)} кг</p>}</div></div>
          {selectedItems.length ? <>
            <div className="calculator-items">{selectedItems.map(item => { const quantity = selected[item.id] || 0; return <div className="calculator-item" key={item.id}>
              <div className="calculator-item-main"><div className="calculator-item-image"><img src={item.image} alt="" loading="eager" onError={event => { event.currentTarget.style.display = 'none'; event.currentTarget.parentElement?.classList.add('image-error'); }} /><Package size={16} aria-hidden="true" /></div><strong>{item.name}</strong></div>
              <div className="calculator-item-controls"><button onClick={() => changeQuantity(item, -1)} aria-label={`Уменьшить ${item.name}`}><Minus size={15} /></button><input type="number" min="1" max={MAX_QUANTITY} value={quantity} onChange={event => setQuantity(item, event.target.value)} aria-label={`Количество ${item.name} в калькуляторе`} /><button onClick={() => changeQuantity(item, 1)} aria-label={`Увеличить ${item.name}`}><Plus size={15} /></button><button onClick={() => setQuantity(item, '0')} aria-label={`Удалить ${item.name}`}><X size={15} /></button></div>
            </div>; })}</div>
            <div className="calculator-summary" aria-live="polite"><div className="calculator-summary-title">ИТОГО</div>
              {(Object.keys(craftCategoryLabels) as CraftCategory[]).map(key => <div className="calculator-summary-row" key={key} style={{ color: categoryColors[key] }}><MaterialIcon category={key} size={16} /><span>{craftCategoryLabels[key]} материалы</span><strong>{materialTotals[key].toLocaleString('ru-RU')}</strong></div>)}
              <div className="calculator-summary-row calculator-weight"><Package size={16} /><span>Общий вес</span><strong>{totalWeight.toFixed(2)} кг</strong></div>
            </div>
            <div className="calculator-actions"><button className="calculator-export" onClick={exportCalculator} disabled={isExporting}><Download size={16} /> {isExporting ? 'Подготовка...' : 'Экспорт'}</button><button className="calculator-clear" onClick={() => setSelected({})}><Trash2 size={16} /> Очистить</button></div>
          </> : <div className="calculator-empty"><Calculator size={24} /><p>Добавьте предметы в список, чтобы увидеть итог.</p></div>}
        </aside>
      </div>
    </PageTransition>
  );
}
