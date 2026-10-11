import { achievementDepartments, achievementGoals, type AchievementSubmission } from './achievements.ts';

export function buildAchievementMessage(body: AchievementSubmission, discordId: string, discordName: string, now = new Date()) {
  const goal = achievementGoals.find(item => item.id === body.achievementId)!;
  const department = achievementDepartments.find(item => item.id === body.department)!;
  const escape = (text: string) => text.replace(/[\\*_`~|<>]/g, '\\$&');
  const date = now.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit',
    year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');
  const fields = [
    { name: '👤 Имя и фамилия', value: escape(body.fullName) },
    { name: '🔢 StaticID', value: body.staticId },
    { name: '🏢 Отдел', value: department.label },
    { name: `${goal.emoji} Ачивка`, value: goal.description },
    { name: goal.metric === 'average' ? '📊 Замер онлайна' : '✅ Выполнено в этом отчёте', value: `${body.quantity} ${goal.unit}` },
    { name: '📅 Дата выполнения · МСК', value: body.workDate.split('-').reverse().join('.') + (body.workTime ? ` в ${body.workTime}` : '') },
    ...body.evidence.slice(0, 3).map((link, index) => ({ name: `🔗 Доказательство ${index + 1}`, value: `<${new URL(link).href.replaceAll('>', '%3E')}>` })),
    { name: '📎 Все доказательства', value: `${body.evidence.length} ссылок. Полный список — в приложенном файле evidence.txt.` },
    { name: '🆔 Discord ID', value: discordId },
  ];
  return {
    content: `🏆 Отчёт по ачивке | Заявка от <@${discordId}>`,
    embeds: [{ title: '🏆 Отчёт о выполнении ачивки', color: 3840255, fields,
      footer: { text: `Отправил ДС ${discordName.slice(0, 80)} • ${date}` }, timestamp: now.toISOString() }],
    allowed_mentions: { parse: [], users: [discordId] },
    attachments: [{ id: 0, filename: 'evidence.txt', description: 'Полный список доказательств к отчёту' }],
  };
}
