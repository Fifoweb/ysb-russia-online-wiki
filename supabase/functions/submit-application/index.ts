// Edge Function: приём «Заявления на повышение» с сайта и отправка в Discord-канал.
// Сессия пользователя проверяется шлюзом Supabase (JWT обязателен),
// здесь дополнительно достаём пользователя для подписи в сообщении.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const VERIFIED_ROLE_ID = '1502062507706155158';
const APPEAL_CHANNEL_ID = '1552410932448206968';
const APPEAL_NOTIFICATION_ROLE_IDS = ['1540269592927019038', '1540267656370716693'];

type RoleCheck = 'allowed' | 'denied' | 'unavailable';

function getWebhookUrl(raw: string | undefined) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && url.hostname === 'discord.com' && !url.port && !url.username && !url.password &&
      !url.search && !url.hash && /^\/api\/webhooks\/\d{17,20}\/[\w.-]+$/.test(url.pathname) ? url : null;
  } catch { return null; }
}

async function getWebhookTarget(raw: string | undefined, expectedChannelId: string) {
  const url = getWebhookUrl(raw);
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) { console.error('Discord webhook lookup failed', response.status); return null; }
    const webhook = await response.json();
    return String(webhook.channel_id) === expectedChannelId && typeof webhook.guild_id === 'string'
      ? { url, guildId: webhook.guild_id } : null;
  } catch (error) { console.error('Discord webhook lookup failed', error); return null; }
}

async function checkVerifiedRoleInGuild(botToken: string, guildId: string, discordId: string): Promise<RoleCheck> {
  try {
    const memberRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${discordId}`, {
      headers: { Authorization: `Bot ${botToken}` },
    });
    if (memberRes.status === 404) return 'denied';
    if (!memberRes.ok) {
      console.error('Discord member lookup failed', memberRes.status);
      return 'unavailable';
    }

    const member = await memberRes.json();
    return Array.isArray(member.roles) && member.roles.includes(VERIFIED_ROLE_ID) ? 'allowed' : 'denied';
  } catch (error) {
    console.error('Discord role lookup failed', error);
    return 'unavailable';
  }
}

async function checkVerifiedRole(botToken: string, channelId: string, discordId: string): Promise<RoleCheck> {
  try {
    // Канал уже доступен боту для отправки заявления, поэтому через него узнаём сервер Discord.
    const channelRes = await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
      headers: { Authorization: `Bot ${botToken}` },
    });
    if (!channelRes.ok) {
      console.error('Discord channel lookup failed', channelRes.status);
      return 'unavailable';
    }

    const channel = await channelRes.json();
    if (typeof channel.guild_id !== 'string') {
      console.error('Discord channel has no guild ID', channelId);
      return 'unavailable';
    }
    return checkVerifiedRoleInGuild(botToken, channel.guild_id, discordId);
  } catch (error) {
    console.error('Discord channel lookup failed', error);
    return 'unavailable';
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  // Проверка, что вызов делает вошедший пользователь
  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return json(401, { error: 'Не авторизован' });

  // Поля формы
  let body: Record<string, string>;
  try { body = await req.json(); } catch { return json(400, { error: 'Bad JSON' }); }

  const meta = (user.user_metadata || {}) as Record<string, string | undefined>;
  const identity = (user.identities || []).find((i: { provider?: string }) => i.provider === 'discord') as
    | { id?: string; identity_data?: Record<string, unknown> & { sub?: string } }
    | undefined;
  const identityData = identity?.identity_data || {};
  const discordName = String(identityData.username || identityData.global_name || meta.user_name || meta.preferred_username || meta.full_name || meta.name || 'неизвестно').slice(0, 80);
  const discordId = identityData.sub || meta.sub || identity?.id || null;
  if (!discordId) {
    return json(403, { error: 'Для использования формы нужен Discord-аккаунт с ролью «Верифицированный».' });
  }
  const mention = `<@${discordId}>`;

  if ((body.type || '').trim() === 'appeal') {
    const nick = (body.nick || '').trim();
    const reason = (body.reason || '').trim();
    const evidence = (body.evidence || '').trim();

    if (!reason || !evidence) {
      return json(400, { error: 'Заполните обязательные поля обжалования' });
    }
    if (nick.length > 100 || reason.length > 1000 || evidence.length > 1000) {
      return json(400, { error: 'Слишком длинные поля' });
    }

    const botToken = Deno.env.get('DISCORD_BOT_TOKEN');
    const target = await getWebhookTarget(Deno.env.get('DISCORD_APPEAL_WEBHOOK_URL'), APPEAL_CHANNEL_ID);
    if (!botToken || !target) return json(500, { error: 'Сервер не настроен' });

    const roleCheck = await checkVerifiedRoleInGuild(botToken, target.guildId, discordId);
    if (roleCheck !== 'allowed') {
      return json(roleCheck === 'denied' ? 403 : 503, {
        error: roleCheck === 'denied'
          ? 'Для использования формы нужна роль «Верифицированный».'
          : 'Не удалось проверить роль в Discord. Попробуйте позже.',
      });
    }

    const dateStr = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');
    const embed = {
      title: '⚖️ Обжалование выговора',
      color: 13912832,
      fields: [
        { name: 'Ваш никнейм | статик', value: nick || '—' },
        { name: 'Почему вам должны обжаловать выговор', value: reason },
        { name: 'Доказательства подтверждащие ваши слова (если таковые допустимы)', value: evidence },
      ],
      footer: { text: `Отправил ДС ${discordName} • ${dateStr}` },
      timestamp: new Date().toISOString(),
    };

    const webhookUrl = new URL(target.url);
    webhookUrl.searchParams.set('wait', 'true');
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `⚖️ Новое обжалование выговора от ${mention}\n${APPEAL_NOTIFICATION_ROLE_IDS.map((id) => `<@&${id}>`).join(' ')}`,
        embeds: [embed],
        components: [{
          type: 1,
          components: [
            { type: 2, style: 3, label: 'Одобрить', custom_id: 'appeal-approve' },
            { type: 2, style: 4, label: 'Отклонить', custom_id: 'appeal-reject' },
          ],
        }],
        allowed_mentions: { parse: [], users: [discordId], roles: APPEAL_NOTIFICATION_ROLE_IDS },
      }),
    });
    if (!res.ok) { const t = await res.text(); console.error('Discord appeal error', res.status, t); return json(502, { error: 'Discord ответил ' + res.status }); }
    return json(200, { ok: true });
  }

  const nick = (body.nick || '').trim();
  const currentRank = (body.currentRank || '').trim();
  const targetRank = (body.targetRank || '').trim();
  const points = (body.points || '').trim();
  const evidence = (body.evidence || '').trim();

  if (!nick || !currentRank || !targetRank || !points || !evidence) {
    return json(400, { error: 'Заполните все поля' });
  }
  if (nick.length > 100 || currentRank.length > 60 || targetRank.length > 60 || points.length > 20 || evidence.length > 1000) {
    return json(400, { error: 'Слишком длинные поля' });
  }

  const botToken = Deno.env.get('DISCORD_BOT_TOKEN');
  const channelId = Deno.env.get('DISCORD_CHANNEL_ID');
  if (!botToken || !channelId) return json(500, { error: 'Сервер не настроен' });

  const roleCheck = await checkVerifiedRole(botToken, channelId, discordId);
  if (roleCheck !== 'allowed') {
    return json(roleCheck === 'denied' ? 403 : 503, {
      error: roleCheck === 'denied'
        ? 'Для использования формы нужна роль «Верифицированный».'
        : 'Не удалось проверить роль в Discord. Попробуйте позже.',
    });
  }

  const dateStr = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');
  const embed = {
    title: '📤 Заявление на повышение',
    color: 440020, // бирюзово-голубой акцент сайта (#06b6d4)
    fields: [
      { name: '👤 Заявитель', value: mention },
      { name: 'Ник / статик', value: nick, inline: true },
      { name: 'Текущее звание', value: currentRank, inline: true },
      { name: 'Новое звание', value: targetRank, inline: true },
      { name: 'Набрано баллов', value: points, inline: true },
      { name: '📎 Доказательства', value: evidence.slice(0, 1000) },
    ],
    footer: { text: `Отправил ДС ${discordName} • ${dateStr}` },
    timestamp: new Date().toISOString(),
  };

  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: `📤 Новое заявление на повышение от ${mention}`, // тег в тексте = реальное упоминание
      embeds: [embed],
      // Кнопки под заявлением — клики обрабатывает функция discord-interactions
      components: [{
        type: 1, // action row
        components: [
          { type: 2, style: 3, label: 'Одобрить', custom_id: 'approve' }, // зелёная
          { type: 2, style: 4, label: 'Отклонить', custom_id: 'reject' }, // красная
        ],
      }],
    }),
  });
  if (!res.ok) { const t = await res.text(); console.error('Discord error', res.status, t); return json(502, { error: 'Discord ответил ' + res.status + ': ' + t.slice(0, 200) }); }
  return json(200, { ok: true });
});
