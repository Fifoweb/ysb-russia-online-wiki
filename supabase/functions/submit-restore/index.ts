// Edge Function: приём «Заявки на восстановление сотрудника» с сайта и отправка в Discord webhook.
// JWT обязателен (шлюз Supabase проверяет сессию), здесь достаём пользователя для подписи.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Роли руководства, которые получают уведомление о новой заявке на восстановление.
const restoreNotificationRoleIds = ['1538937566273732637', '1540380882601251007'];

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return json(401, { error: 'Не авторизован' });

  let body: Record<string, string>;
  try { body = await req.json(); } catch { return json(400, { error: 'Bad JSON' }); }

  const fullNameStatic = (body.fullNameStatic || '').trim();
  const factionScreenshot = (body.factionScreenshot || '').trim(); // опционально (после ban/warn)
  const rankEvidence = (body.rankEvidence || '').trim();
  const dismissReason = (body.dismissReason || '').trim();
  const previousRank = (body.previousRank || '').trim();
  const discordContact = (body.discordContact || '').trim();

  if (!fullNameStatic || !rankEvidence || !dismissReason || !previousRank || !discordContact) {
    return json(400, { error: 'Заполните все обязательные поля' });
  }
  if (fullNameStatic.length > 100 || factionScreenshot.length > 300 || rankEvidence.length > 300 ||
    dismissReason.length > 500 || previousRank.length > 30 || discordContact.length > 60) {
    return json(400, { error: 'Слишком длинные поля' });
  }

  const rawWebhookUrl = Deno.env.get('DISCORD_RESTORE_WEBHOOK_URL');
  if (!rawWebhookUrl) return json(500, { error: 'Сервер не настроен' });

  let webhookUrl: URL;
  try {
    webhookUrl = new URL(rawWebhookUrl);
  } catch {
    return json(500, { error: 'Сервер не настроен' });
  }
  if (webhookUrl.protocol !== 'https:' || webhookUrl.hostname !== 'discord.com' ||
    !webhookUrl.pathname.startsWith('/api/webhooks/')) {
    return json(500, { error: 'Сервер не настроен' });
  }
  // wait=true заставляет Discord вернуть ошибку или созданное сообщение, а не только 204.
  webhookUrl.searchParams.set('wait', 'true');

  const meta = (user.user_metadata || {}) as Record<string, string | undefined>;
  const discordName = meta.full_name || meta.name || 'неизвестно';
  const identity = (user.identities || []).find((i: { provider?: string }) => i.provider === 'discord') as
    | { id?: string; identity_data?: { sub?: string } }
    | undefined;
  const rawDiscordId = identity?.identity_data?.sub || meta.sub || identity?.id || null;
  // Разрешаем пинг только настоящего Discord snowflake, полученного из OAuth-профиля.
  const discordId = rawDiscordId && /^\d{17,20}$/.test(rawDiscordId) ? rawDiscordId : null;
  const mention = discordId ? `<@${discordId}>` : discordName;
  const roleMentions = restoreNotificationRoleIds.map((roleId) => `<@&${roleId}>`).join(' ');

  const dateStr = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');

  const embed = {
    title: 'Восстановление',
    color: 440020, // бирюзово-голубой акцент сайта (#06b6d4)
    fields: [
      { name: 'Имя Фамилия | static', value: fullNameStatic },
      { name: 'Скриншот на одобренный запрос из дискорда гос.фракций (если после ban/warn)', value: factionScreenshot || '—' },
      { name: 'Доказательства пребывания на ранге', value: rankEvidence },
      { name: 'Причина увольнения', value: dismissReason },
      { name: 'Ранг до увольнения', value: previousRank },
      { name: 'Дискорд для связи', value: discordContact },
    ],
    footer: { text: `By ${discordName} • ${dateStr}` },
    timestamp: new Date().toISOString(),
  };

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: `${roleMentions}\n📋 Новая заявка на восстановление от ${mention}`,
      embeds: [embed],
      // Обычный webhook может упомянуть только автора заявки и конкретные роли руководства.
      allowed_mentions: {
        parse: [],
        users: discordId ? [discordId] : [],
        roles: restoreNotificationRoleIds,
      },
    }),
  });
  if (!res.ok) { const t = await res.text(); console.error('Discord error', res.status, t); return json(502, { error: `Discord ответил ${res.status}` }); }
  return json(200, { ok: true });
});
