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

type RoleCheck = 'allowed' | 'denied' | 'unavailable';

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
    const guildId = channel.guild_id;
    if (!guildId) {
      console.error('Discord channel has no guild ID', channelId);
      return 'unavailable';
    }

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
  const discordName = meta.full_name || meta.name || 'неизвестно';
  const identity = (user.identities || []).find((i: { provider?: string }) => i.provider === 'discord') as
    | { id?: string; identity_data?: { sub?: string } }
    | undefined;
  const discordId = identity?.identity_data?.sub || meta.sub || identity?.id || null;
  if (!discordId) {
    return json(403, { error: 'Для использования формы нужен Discord-аккаунт с ролью «Верифицированный».' });
  }
  const mention = `<@${discordId}>`;

  if ((body.type || '').trim() === 'appeal') {
    const nick = (body.nick || '').trim();
    const reason = (body.reason || '').trim();
    const evidence = (body.evidence || '').trim();
    const reprimandScreenshot = (body.reprimandScreenshot || '').trim();

    if (!reason || !evidence) {
      return json(400, { error: 'Заполните обязательные поля обжалования' });
    }
    if (nick.length > 100 || reason.length > 1000 || evidence.length > 1000 || reprimandScreenshot.length > 300) {
      return json(400, { error: 'Слишком длинные поля' });
    }

    let screenshotLink = '—';
    if (reprimandScreenshot) {
      try {
        const screenshotUrl = new URL(reprimandScreenshot);
        if (!['http:', 'https:'].includes(screenshotUrl.protocol)) throw new Error('Unsupported protocol');
        screenshotLink = `[Открыть скриншот](${screenshotUrl.href})`;
      } catch {
        return json(400, { error: 'Некорректная ссылка на скриншот' });
      }
    }

    const botToken = Deno.env.get('DISCORD_BOT_TOKEN');
    const channelId = '1477623588478517268';
    if (!botToken) return json(500, { error: 'Сервер не настроен' });

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
      title: '⚖️ Обжалование выговора',
      color: 13912832,
      fields: [
        { name: '👤 Заявитель', value: mention },
        { name: 'Никнейм | статик', value: nick || '—', inline: true },
        { name: 'Почему нужно обжаловать выговор', value: reason },
        { name: '📎 Доказательства', value: evidence },
        { name: '📱 Скрин с планшета', value: screenshotLink },
      ],
      footer: { text: `Отправил: ${discordName} • ${dateStr}` },
      timestamp: new Date().toISOString(),
    };

    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `⚖️ Новое обжалование выговора от ${mention}`,
        embeds: [embed],
        components: [{
          type: 1,
          components: [
            { type: 2, style: 3, label: 'Одобрить', custom_id: 'appeal-approve' },
            { type: 2, style: 4, label: 'Отклонить', custom_id: 'appeal-reject' },
          ],
        }],
        allowed_mentions: discordId ? { parse: [], users: [discordId] } : { parse: [] },
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
    footer: { text: `Начальник ГИБДД • ${dateStr}` },
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
