import { achievementDepartments, achievementGoals, type AchievementSubmission } from './achievements.ts';

type Field = { name: string; value: string; inline?: false };

// Discord limits: 1024 chars/field, 25 fields/embed and 6000 embed chars/message.
// Keep a safety margin for the title, footer and subsequent Discord API changes.
const MAX_FIELD_LENGTH = 1000;
const MAX_EMBED_LENGTH = 5400;
const MAX_FIELDS = 24;

export function buildAchievementMessages(body: AchievementSubmission, discordId: string, discordName: string, now = new Date()) {
  const goal = achievementGoals.find(item => item.id === body.achievementId)!;
  const department = achievementDepartments.find(item => item.id === body.department)!;
  const escape = (value: string) => value.replace(/[\*_`~|<>]/g, '\\$&');
  const date = now.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit',
    year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');
  const title = '🏆 Отчёт о выполнении ачивки';
  const footer = `Отправил ДС ${discordName.slice(0, 80)} • ${date}`;
  const identity: Field = { name: '🆔 Discord ID', value: discordId };
  const common: Field[] = [
    { name: '👤 Имя и фамилия', value: escape(body.fullName) },
    { name: '🔢 StaticID', value: body.staticId },
    { name: '🏢 Отдел', value: department.label },
    { name: `${goal.emoji} Ачивка`, value: goal.description },
    { name: goal.metric === 'average' ? '📊 Замер онлайна' : '✅ Выполнено в этом отчёте', value: `${body.quantity} ${goal.unit}` },
    { name: '📅 Дата выполнения · МСК', value: body.workDate.split('-').reverse().join('.') + (body.workTime ? ` в ${body.workTime}` : '') },
  ];

  // Split into vertical lists within Discord's 1024-character field limit.
  // Never truncate evidence: large submissions continue in a separate message
  // in the SAME Discord thread, rather than appearing above the embed in a file.
  const lists: Field[] = [];
  let links: string[] = [];
  let groupLength = 0;
  const flushLinks = () => {
    if (!links.length) return;
    lists.push({ name: lists.length ? `🔗 Доказательства · продолжение ${lists.length + 1}` : '🔗 Доказательства',
      value: links.join('\n'), inline: false });
    links = [];
    groupLength = 0;
  };
  for (const raw of body.evidence) {
    const line = `<${new URL(raw).href.replaceAll('>', '%3E')}>`;
    if (groupLength + line.length + (links.length ? 1 : 0) > MAX_FIELD_LENGTH) flushLinks();
    links.push(line);
    groupLength += line.length + (links.length > 1 ? 1 : 0);
  }
  flushLinks();

  const batches: Field[][] = [];
  let current = [...common];
  let currentSize = title.length + footer.length + current.reduce((sum, f) => sum + f.name.length + f.value.length, 0);
  for (const field of lists) {
    const amount = field.name.length + field.value.length;
    if (current.length >= MAX_FIELDS - 1 || currentSize + amount + identity.name.length + identity.value.length > MAX_EMBED_LENGTH) {
      batches.push(current);
      current = [];
      currentSize = 80;
    }
    current.push(field);
    currentSize += amount;
  }
  if (current.length) batches.push(current);
  batches[0].push(identity);

  return batches.map((fields, index) => ({
    content: index ? `📎 Продолжение доказательств к отчёту (${index + 1}/${batches.length})` : `🏆 Отчёт по ачивке | Заявка от <@${discordId}>`,
    embeds: [{ title: index ? `📎 Доказательства · часть ${index + 1}/${batches.length}` : title,
      color: 3840255, fields,
      ...(index ? {} : { footer: { text: footer }, timestamp: now.toISOString() }) }],
    allowed_mentions: { parse: [] as string[], users: index ? [] : [discordId] },
  }));
}

export function buildAchievementMessage(body: AchievementSubmission, discordId: string, discordName: string, now = new Date()) {
  return buildAchievementMessages(body, discordId, discordName, now)[0];
}
