// Edge Function: приём «Заявления на увольнение» с сайта и отправка в Discord-канал.
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
  const department = (body.department || '').trim();
  const currentRank = (body.currentRank || '').trim();
  const recordScreenshot = (body.recordScreenshot || '').trim();

  if (!fullNameStatic || !department || !currentRank || !recordScreenshot) {
    return json(400, { error: 'Заполните все поля' });
  }
  if (fullNameStatic.length > 100 || department.length > 60 || currentRank.length > 20 || recordScreenshot.length > 300) {
    return json(400, { error: 'Слишком длинные поля' });
  }
  if (!/^(?:[1-9]|1[0-5])$/.test(currentRank)) {
    return json(400, { error: 'Ранг должен быть числом от 1 до 15' });
  }

  let screenshotUrl: URL;
  try {
    screenshotUrl = new URL(recordScreenshot);
    if (!['http:', 'https:'].includes(screenshotUrl.protocol)) throw new Error('Unsupported protocol');
  } catch {
    return json(400, { error: 'Некорректная ссылка на скриншот' });
  }

  const botToken = Deno.env.get('DISCORD_BOT_TOKEN');
  const channelId = Deno.env.get('DISCORD_RESIGN_CHANNEL_ID');
  if (!botToken || !channelId) return json(500, { error: 'Сервер не настроен' });

  const meta = (user.user_metadata || {}) as Record<string, string | undefined>;
  const discordName = meta.full_name || meta.name || 'неизвестно';
  const identity = (user.identities || []).find((i: { provider?: string }) => i.provider === 'discord') as
    | { id?: string; identity_data?: { sub?: string } }
    | undefined;
  const discordId = identity?.identity_data?.sub || meta.sub || identity?.id || null;
  if (!discordId) {
    return json(403, { error: 'Для использования формы нужен Discord-аккаунт с ролью «Верифицированный».' });
  }

  const roleCheck = await checkVerifiedRole(botToken, channelId, discordId);
  if (roleCheck !== 'allowed') {
    return json(roleCheck === 'denied' ? 403 : 503, {
      error: roleCheck === 'denied'
        ? 'Для использования формы нужна роль «Верифицированный».'
        : 'Не удалось проверить роль в Discord. Попробуйте позже.',
    });
  }

  const mention = '<@' + discordId + '>';

  const dateStr = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');

  const embed = {
    title: '📄 Заявление на увольнение',
    color: 13912832, // тёмно-оранжевая полоса (#d35400)
    fields: [
      { name: '👤 Сотрудник', value: mention },
      { name: 'Имя Фамилия | Статик', value: fullNameStatic, inline: true },
      { name: 'Отдел', value: department, inline: true },
      { name: 'Текущий ранг', value: String.fromCharCode(96) + currentRank + String.fromCharCode(96) }, // inline-code рамка Discord
      { name: '📎 Скриншот личного дела', value: '[Открыть скриншот](' + screenshotUrl.href + ')' },
    ],
    footer: { text: 'Отправил: ' + discordName + ' • ' + dateStr },
    timestamp: new Date().toISOString(),
  };

  const res = await fetch('https://discord.com/api/v10/channels/' + channelId + '/messages', {
    method: 'POST',
    headers: { Authorization: 'Bot ' + botToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: '📄 Новое заявление на увольнение от ' + mention,
      embeds: [embed],
      allowed_mentions: discordId ? { parse: [], users: [discordId] } : { parse: [] },
    }),
  });
  if (!res.ok) { const t = await res.text(); console.error('Discord error', res.status, t); return json(502, { error: 'Discord ответил ' + res.status }); }
  return json(200, { ok: true });
});
