export type CraftCategory = 'medical' | 'weapon' | 'technical';

export interface CraftItem {
  id: string;
  name: string;
  category: CraftCategory;
  materials: number;
  weightKg: number;
  image: string;
  sourcePath: string;
}

const cdn = 'https://cdn.majestic-files.net/public/master/static/img/inventory/items/';
const localCraftIds = new Set(['124', '168', '169', '170', '252', '5002', '5004', '5005', '5006', '5009', '5011', '5012', '5016', '5017', '5018', '5019', '5500', '5502', '5504', '5506', '5508']);

export const craftCategoryLabels: Record<CraftCategory, string> = {
  medical: 'Медицинские',
  weapon: 'Оружейные',
  technical: 'Технические',
};

const item = (id: string, name: string, category: CraftCategory, materials: number, weightKg: number, type: string, imageId = id): CraftItem => ({
  id, name, category, materials, weightKg, image: localCraftIds.has(id) ? `${import.meta.env.BASE_URL}crafts/${id}.png` : `${cdn}${['168', '169', '170', '5002', '5004', '5005', '5006', '5009', '5011', '5012', '5016', '5017', '5018', '5019', '5028', '5500', '5502', '5504', '5506', '5508', '334', '347', '456', '5000'].includes(imageId) ? 'ro/' : ''}${imageId}.webp`,
  sourcePath: `/ru/items/${type}/${id}`,
});

export const craftItems: CraftItem[] = [
  item('124', 'Противовирусная вакцина', 'medical', 1, 0.004, 'medical'),
  item('168', 'Азитромицин', 'medical', 10, 0.005, 'medical'),
  item('169', 'Активированный уголь', 'medical', 10, 0.005, 'medical'),
  item('170', 'Парацетамол', 'medical', 1, 0.005, 'medical'),
  item('252', 'Эпинефрин', 'medical', 10, 0.15, 'medical'),
  item('281', 'Дефибриллятор', 'medical', 400, 0.5, 'medical'),
  item('5002', 'АПС «Стечкин»', 'weapon', 70, 0.8, 'ammunition'),
  item('5004', 'Сайга-12К', 'weapon', 200, 3.5, 'ammunition'),
  item('5005', 'АК-12', 'weapon', 180, 3, 'ammunition'),
  item('5006', 'АКС-74У', 'weapon', 100, 3, 'ammunition'),
  item('5009', 'Пистолет Макарова (ПМ)', 'weapon', 40, 0.8, 'ammunition'),
  item('5011', 'ПП-91 «Кедр»', 'weapon', 70, 1.5, 'ammunition'),
  item('5012', 'СВ-98', 'weapon', 10000, 4.5, 'ammunition'),
  item('5016', 'АС «Вал»', 'weapon', 200, 3, 'ammunition'),
  item('5017', 'ПП-2000', 'weapon', 80, 1.8, 'ammunition'),
  item('5018', 'СВД', 'weapon', 10000, 4.5, 'ammunition'),
  item('5019', 'АН-94 «Абакан»', 'weapon', 170, 3, 'ammunition'),
  item('5028', 'МПЛ', 'weapon', 60, 0.8, 'ammunition'),
  item('5500', 'Пистолетный патрон', 'weapon', 1, 0.006, 'ammunition'),
  item('5502', 'Патрон для ПП', 'weapon', 5, 0.009, 'ammunition'),
  item('5504', 'Патрон для дробовика', 'weapon', 1, 0.04, 'ammunition'),
  item('5506', 'Патрон для лёгкого автомата', 'weapon', 7, 0.012, 'ammunition'),
  item('5508', 'Патрон для тяжёлого автомата', 'weapon', 10, 0.01, 'ammunition'),
  item('92', 'Болгарка', 'technical', 2000, 3.5, 'tool'),
  item('112', 'Наручники', 'technical', 2, 0.35, 'ammunition'),
  item('216', 'Полицейская дубинка', 'technical', 5, 0.75, 'ammunition'),
  item('244', 'Тазер', 'technical', 5, 0.22, 'ammunition'),
  item('334', 'ИРП «Искра»', 'technical', 5, 0.6, 'food'),
  item('347', 'Тяжелый бронежилет служебный', 'technical', 30, 4, 'ammunition'),
  item('456', 'Легкий бронежилет служебный', 'technical', 15, 2, 'ammunition'),
  item('833', 'Камера контроля скорости', 'technical', 100, 5, 'tool'),
  item('834', 'Радар измерения скорости', 'technical', 150, 0.7, 'tool'),
  item('1006', 'Электрическая дубинка', 'technical', 10, 0.58, 'ammunition'),
  item('5000', 'Жезл ДПС', 'technical', 10, 0.5, 'ammunition'),
];
