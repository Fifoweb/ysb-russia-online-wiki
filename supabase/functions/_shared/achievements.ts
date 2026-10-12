export const ACHIEVEMENT_TIME_ZONE = 'Europe/Moscow';
export const MAX_EVIDENCE_LINKS = 50;
export const MAX_EVIDENCE_CHARACTERS = 10_000;

export const achievementDepartments = [
  { id: 'academy', label: 'Академия' },
  { id: 'gu', label: 'ГУ ГИБДД' },
  { id: 'usb', label: 'УСБ | Управление собственной безопасности' },
  { id: 'uku', label: 'УКУ | Учебно-кадровое управление' },
  { id: 'uor', label: 'УОР | Управление оперативного розыска' },
  { id: 'sdb', label: 'СДБ | Специальный дорожный батальон' },
  { id: 'mb', label: 'МБ | Мотоциклетный Батальон' },
  { id: 'ugk', label: 'УГК | Управление грузового контроля' },
  { id: 'dps', label: 'ДПС | Дорожно-патрульная служба' },
  { id: 'udo', label: 'УДО | Управление Дорожных Ситуаций' },
  { id: 'ukm', label: 'УКМ | Управление по контролю магистралей' },
] as const;

export const achievementGoals = [
  { id: 'academy-graduates', title: 'Выпуск из академии', description: 'Выпустить из академии 40 человек', target: 40, unit: 'чел.', quantityLabel: 'Сколько человек выпустили?', metric: 'sum', emoji: '🎓', threadId: '1556660053572853913' },
  { id: 'discipline', title: 'Контроль дисциплины', description: 'Выявить и пресечь 30 дисциплинарных нарушений', target: 30, unit: 'нарушений', quantityLabel: 'Сколько нарушений выявили и пресекли?', metric: 'sum', emoji: '🛡️', threadId: '1556659874602033153' },
  { id: 'joint-exercises', title: 'Совместные учения', description: 'Провести 2 совместных учения с Армией', target: 2, unit: 'учений', quantityLabel: 'Сколько учений провели?', metric: 'sum', emoji: '🤝', threadId: '1556659983603474482' },
  { id: 'detainees', title: 'Передача задержанных', description: 'Задержать 30 человек и передать МВД / ФСБ', target: 30, unit: 'чел.', quantityLabel: 'Сколько задержанных передали МВД / ФСБ?', metric: 'sum', emoji: '🚔', threadId: '1556659948249808987' },
  { id: 'escorts', title: 'Сопровождение поставок', description: 'Сопроводить 5 поставок от Армии', target: 5, unit: 'поставок', quantityLabel: 'Сколько поставок сопроводили?', metric: 'sum', emoji: '🚚', threadId: '1556659909557362868' },
  { id: 'average-online', title: 'Средний онлайн', description: 'Добиться среднего онлайна 100 человек', target: 100, unit: 'чел.', quantityLabel: 'Сколько сотрудников было онлайн в момент замера?', metric: 'average', emoji: '📊', threadId: '1556660085638307911' },
  { id: 'recruitment', title: 'Приём во фракцию', description: 'Принять 50 человек во фракцию', target: 50, unit: 'чел.', quantityLabel: 'Сколько человек приняли?', metric: 'sum', emoji: '👥', threadId: '1556659813889478716' },
  { id: 'warehouse', title: 'Проверка склада', description: 'Проверить и почистить склад 3 раза в разные дни', target: 3, unit: 'дня', quantityLabel: 'Одна проверка за выбранный день', metric: 'distinct-days', emoji: '📦', threadId: '1556660019661901874' },
  { id: 'fines', title: 'Выписанные штрафы', description: 'Выписать 200 штрафов', target: 200, unit: 'штрафов', quantityLabel: 'Сколько штрафов выписали?', metric: 'sum', emoji: '🧾', threadId: '1556659843400470598' },
] as const;

export type AchievementId = typeof achievementGoals[number]['id'];
export type AchievementDepartment = typeof achievementDepartments[number]['id'];

export function moscowDate(now = new Date()): string {
  return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function achievementWeekStart(now = new Date()): string {
  const date = new Date(moscowDate(now) + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}

export function addAchievementDays(date: string, days: number): string {
  const value = new Date(date + 'T00:00:00Z');
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function canonicalEvidenceLink(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !url.hostname.includes('.') || /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[)/i.test(url.hostname) ||
      /\/api\/webhooks\//i.test(url.pathname)) return null;
    url.hash = '';
    if (['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname)) url.search = '';
    return url.href;
  } catch { return null; }
}

export function parseAchievementEvidence(text: string): { links: string[]; error?: string } {
  const links = text.trim().split(/\s+/).filter(Boolean);
  if (!links.length) return { links, error: 'Добавьте хотя бы одну ссылку на доказательства.' };
  if (links.length > MAX_EVIDENCE_LINKS || text.length > MAX_EVIDENCE_CHARACTERS) {
    return { links, error: 'Не более 50 ссылок и 10 000 символов за один отчёт.' };
  }
  const canonical = links.map(canonicalEvidenceLink);
  if (links.some(link => link.length > 800) || canonical.some(link => !link || link.length > 1000)) {
    return { links, error: 'Укажите полные HTTPS-ссылки, каждую с новой строки. Ссылка — до 800 символов.' };
  }
  if (new Set(canonical).size !== links.length) return { links, error: 'Удалите повторяющиеся ссылки из отчёта.' };
  return { links };
}

export interface AchievementSubmission {
  requestId: string;
  fullName: string;
  staticId: string;
  department: AchievementDepartment;
  achievementId: AchievementId;
  quantity: number;
  workDate: string;
  workTime: string;
  evidence: string[];
  rulesAccepted: true;
}

export function validateAchievementSubmission(raw: unknown, now = new Date()):
  { value?: AchievementSubmission; error?: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'Некорректные данные отчёта.' };
  const body = raw as Record<string, unknown>;
  const week = achievementWeekStart(now);
  if (now.getTime() < new Date(week + 'T00:01:00+03:00').getTime()) {
    return { error: 'Новая неделя началась. Отчёты принимаются с понедельника 00:01 МСК.' };
  }
  const text = (key: string) => typeof body[key] === 'string' ? body[key].trim() : '';
  const fullName = text('fullName');
  const staticId = text('staticId');
  const department = text('department');
  const achievementId = text('achievementId');
  const goal = achievementGoals.find(item => item.id === achievementId);
  if (!goal || !achievementDepartments.some(item => item.id === department)) return { error: 'Выберите ачивку и отдел из списка.' };
  if (fullName.length < 3 || fullName.length > 100 || /[\x00-\x1f]/.test(fullName)) return { error: 'Укажите имя и фамилию, от 3 до 100 символов.' };
  if (!/^\d{1,10}$/.test(staticId)) return { error: 'StaticID должен содержать от 1 до 10 цифр.' };
  const quantity = body.quantity;
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < (goal.metric === 'average' ? 0 : 1) ||
    quantity > 99_999 || (goal.metric === 'distinct-days' && quantity !== 1)) return { error: 'Укажите корректное количество. Проверка склада — одна за день.' };
  const workDate = text('workDate');
  const parsed = new Date(workDate + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate) || !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== workDate || workDate < achievementWeekStart(now) || workDate > moscowDate(now)) {
    return { error: 'Дата выполнения должна быть в текущей неделе, не позже сегодняшнего дня по Москве.' };
  }
  const workTime = text('workTime');
  const workAt = new Date(`${workDate}T${workTime}:00+03:00`).getTime();
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(workTime) ||
    workAt > now.getTime() || workAt < new Date(week + 'T00:01:00+03:00').getTime()) {
    return { error: 'Время выполнения — с понедельника 00:01 МСК текущей недели, не позже текущего времени.' };
  }
  if (!Array.isArray(body.evidence) || body.evidence.some(value => typeof value !== 'string')) return { error: 'Добавьте ссылки на доказательства.' };
  const evidenceResult = parseAchievementEvidence(body.evidence.join('\n'));
  if (evidenceResult.error) return { error: evidenceResult.error };
  if (body.rulesAccepted !== true) return { error: 'Подтвердите соблюдение правил публикации.' };
  const requestId = text('requestId');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) return { error: 'Обновите форму и повторите отправку.' };
  return { value: { requestId, fullName, staticId, department: department as AchievementDepartment,
    achievementId: goal.id, quantity, workDate, workTime,
    evidence: evidenceResult.links, rulesAccepted: true } };
}
