// Edge Function: accepts a resignation request and sends it through a Discord webhook.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const CHANNEL_ID = '1540827327674712195';
const VERIFIED_ROLE_ID = '1538937566156300351';
const NOTIFICATION_ROLE_IDS = ['1538937566273732632'];
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type RoleCheck = 'allowed' | 'denied' | 'authorization-needed' | 'unavailable';

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

async function checkDiscordRole(discordId: string, accessToken: string, guildId: string, roleId: string): Promise<RoleCheck> {
  if (!accessToken || accessToken.length > 4096) return 'authorization-needed';
  try {
    const headers = { Authorization: `Bearer ${accessToken}` };
    const userResponse = await fetch('https://discord.com/api/v10/users/@me', { headers });
    if (userResponse.status === 401 || userResponse.status === 403) return 'authorization-needed';
    if (!userResponse.ok) return 'unavailable';
    if ((await userResponse.json()).id !== discordId) return 'denied';
    const memberResponse = await fetch(`https://discord.com/api/v10/users/@me/guilds/${guildId}/member`, { headers });
    if (memberResponse.status === 401 || memberResponse.status === 403) return 'authorization-needed';
    if (memberResponse.status === 404) return 'denied';
    if (!memberResponse.ok) return 'unavailable';
    const member = await memberResponse.json();
    return Array.isArray(member.roles) && member.roles.includes(roleId) ? 'allowed' : 'denied';
  } catch (error) { console.error('Discord role lookup failed', error); return 'unavailable'; }
}

async function sendWebhookMessage(target: { url: URL }, content: string, embeds: unknown[], roleIds: string[]) {
  const url = new URL(target.url);
  url.searchParams.set('wait', 'true');
  return await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, embeds, allowed_mentions: { parse: [], roles: roleIds } }),
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json(401, { error: 'Не авторизован' });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: 'Некорректные данные формы' }); }
  const readText = (key: string) => typeof body[key] === 'string' ? body[key].trim() : '';
  const fullNameStatic = readText('fullNameStatic');
  const department = readText('department');
  const currentRank = readText('currentRank');
  const recordScreenshot = readText('recordScreenshot');

  if (!fullNameStatic || !department || !currentRank || !recordScreenshot) return json(400, { error: 'Заполните все поля' });
  if (fullNameStatic.length > 100 || department.length > 60 || currentRank.length > 2 || recordScreenshot.length > 300) {
    return json(400, { error: 'Слишком длинные поля' });
  }
  if (!/^(?:[1-9]|1[0-5])$/.test(currentRank)) return json(400, { error: 'Ранг должен быть числом от 1 до 15' });
  let screenshotUrl: URL;
  try {
    screenshotUrl = new URL(recordScreenshot);
    if (!['http:', 'https:'].includes(screenshotUrl.protocol)) throw new Error('Unsupported protocol');
  } catch {
    return json(400, { error: 'Некорректная ссылка на скриншот' });
  }

  const identity = user.identities?.find((item) => item.provider === 'discord');
  const identityData = (identity?.identity_data || {}) as Record<string, unknown>;
  const metadata = (user.user_metadata || {}) as Record<string, unknown>;
  const discordId = identityData.sub;
  const discordName = String(identityData.username || identityData.global_name || metadata.user_name || metadata.preferred_username || metadata.full_name || metadata.name || 'неизвестно').slice(0, 80);
  if (typeof discordId !== 'string' || !/^\d{17,20}$/.test(discordId)) {
    return json(403, { error: 'Для отправки войдите через Discord' });
  }

  const target = await getWebhookTarget(Deno.env.get('DISCORD_RESIGN_WEBHOOK_URL'), CHANNEL_ID);
  if (!target) return json(500, { error: 'Вебхук увольнений не настроен для нужного канала' });
  const roleCheck = await checkDiscordRole(discordId, readText('discordAccessToken'), target.guildId, VERIFIED_ROLE_ID);
  if (roleCheck !== 'allowed') {
    if (roleCheck === 'denied') return json(403, { error: 'Для использования формы нужна роль «Верифицированный».' });
    if (roleCheck === 'authorization-needed') return json(401, { error: 'Повторно войдите через Discord и разрешите доступ к сведениям о членстве на сервере.' });
    return json(503, { error: 'Не удалось проверить роль в Discord. Попробуйте позже.' });
  }

  const dateStr = new Date().toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).replace(',', '');
  const embed = {
    title: 'Заявление на увольнение',
    color: 13912832,
    fields: [
      { name: 'Имя Фамилия | Статик', value: fullNameStatic, inline: true },
      { name: 'Отдел', value: department, inline: true },
      { name: 'Текущий ранг', value: currentRank, inline: true },
      { name: 'Скриншот личного дела', value: `[Открыть скриншот](${screenshotUrl.href})` },
      { name: 'Discord ID', value: discordId, inline: true },
    ],
    footer: { text: `Отправил ДС ${discordName} • ${dateStr}` },
    timestamp: new Date().toISOString(),
  };
  const response = await sendWebhookMessage(
    target,
    `📄 Новое заявление на увольнение\n${NOTIFICATION_ROLE_IDS.map((id) => `<@&${id}>`).join(' ')}`,
    [embed],
    NOTIFICATION_ROLE_IDS,
  );
  if (!response.ok) {
    console.error('Discord resignation webhook error', response.status, await response.text());
    return json(502, { error: `Discord ответил ${response.status}` });
  }
  return json(200, { ok: true });
});
