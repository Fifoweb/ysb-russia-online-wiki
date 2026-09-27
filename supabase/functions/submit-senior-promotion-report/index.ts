import { createClient } from 'jsr:@supabase/supabase-js@2';
import { withSubmissionCooldown } from '../_shared/submissionCooldown.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const WEBHOOK_ID = '1553880310158983198';
const CHANNEL_ID = '1538937578835935397';
const ROLE_IDS: Record<string, string> = {
  senior: '1538937566273732632',
  usb: '1540269592927019038',
  uku: '1540268884987478096',
  uor: '1540268999718342656',
  sdb: '1540268801193672755',
  mb: '1542235140611379260',
  ugk: '1540269700443799583',
  dps: '1540268712282562610',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function parseWebhook(raw: string | undefined): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && url.hostname === 'discord.com' && !url.port &&
      !url.username && !url.password && !url.search && !url.hash &&
      new RegExp(`^/api/webhooks/${WEBHOOK_ID}/[\\w.-]+$`).test(url.pathname) ? url : null;
  } catch { return null; }
}

type Member = { nick?: string | null; user?: { id?: string; username?: string; global_name?: string | null; discriminator?: string } };

async function resolveMember(guildId: string, name: string, botToken: string): Promise<{ id?: string; error?: string }> {
  const headers = { Authorization: `Bot ${botToken}` };
  const byId = /^\d{17,20}$/.test(name);
  const endpoint = byId
    ? `https://discord.com/api/v10/guilds/${guildId}/members/${name}`
    : `https://discord.com/api/v10/guilds/${guildId}/members/search?query=${encodeURIComponent(name)}&limit=1000`;
  let response: Response;
  try { response = await fetch(endpoint, { headers }); }
  catch { return { error: 'Discord недоступен для поиска сотрудников. Попробуйте позже.' }; }
  if (response.status === 404 && byId) return { error: `Discord ID ${name} не найден на сервере.` };
  if (!response.ok) {
    console.error('Discord member lookup failed', response.status);
    return { error: 'Не удалось проверить Discord-ники. Попробуйте позже.' };
  }
  let members: Member[];
  try {
    const data: unknown = await response.json();
    members = byId ? [data as Member] : Array.isArray(data) ? data as Member[] : [];
  } catch { return { error: 'Не удалось прочитать ответ Discord.' }; }
  if (!byId && members.length === 1000) {
    return { error: 'Слишком много совпадений по нику. Укажите Discord ID человека.' };
  }

  const normalized = name.toLowerCase();
  const exact = members.filter(member => {
    const user = member.user;
    const names = [member.nick, user?.username, user?.global_name,
      user?.discriminator && user.discriminator !== '0' ? `${user.username}#${user.discriminator}` : null];
    return byId ? user?.id === name : names.some(value => value?.toLowerCase() === normalized);
  });
  const ids = [...new Set(exact.map(member => member.user?.id).filter((id): id is string => typeof id === 'string'))];
  if (ids.length === 0) return { error: `Ник «${name}» не найден на сервере. Проверьте точное написание или укажите Discord ID.` };
  if (ids.length > 1) return { error: `Ник «${name}» совпадает у нескольких людей. Укажите Discord ID.` };
  return { id: ids[0] };
}

Deno.serve(withSubmissionCooldown(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json(401, { error: 'Войдите через Discord' });
  const identity = user.identities?.find(item => item.provider === 'discord');
  const identityData = (identity?.identity_data || {}) as Record<string, unknown>;
  const metadata = (user.user_metadata || {}) as Record<string, unknown>;
  const discordId = identityData.sub;
  if (typeof discordId !== 'string' || !/^\d{17,20}$/.test(discordId)) {
    return json(403, { error: 'Не удалось получить Discord ID. Войдите через Discord ещё раз.' });
  }

  let rawBody: unknown;
  try { rawBody = await req.json(); } catch { return json(400, { error: 'Некорректные данные формы' }); }
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) return json(400, { error: 'Некорректные данные формы' });
  const body = rawBody as Record<string, unknown>;
  const readText = (key: string) => typeof body[key] === 'string' ? body[key].trim() : '';
  const nickStatic = readText('nickStatic');
  const rankTransition = readText('rankTransition');
  const evidence = readText('evidence');
  const mentionTarget = readText('mentionTarget');
  if (!nickStatic || !rankTransition || !evidence) return json(400, { error: 'Заполните все обязательные поля' });
  if (nickStatic.length > 100 || evidence.length > 1000) return json(400, { error: 'Слишком длинные поля' });
  const rankMatch = rankTransition.match(/^([1-9]|1[0-5])-([1-9]|1[0-5])$/);
  if (!rankMatch || Number(rankMatch[1]) >= Number(rankMatch[2])) {
    return json(400, { error: 'Укажите повышение в формате 1-2, ранги от 1 до 15' });
  }
  if (mentionTarget !== 'people' && !Object.prototype.hasOwnProperty.call(ROLE_IDS, mentionTarget)) {
    return json(400, { error: 'Выберите, кого отметить, из списка' });
  }
  if (!Array.isArray(body.people) || body.people.length > 5 ||
    body.people.some(value => typeof value !== 'string' || value.length > 80)) {
    return json(400, { error: 'Укажите не более пяти Discord-ников, по одному в строке' });
  }
  const names = mentionTarget === 'people'
    ? [...new Set((body.people as string[]).map(value => value.trim()).filter(Boolean))]
    : [];
  if (names.some(name => name.length < 2)) return json(400, { error: 'Укажите Discord-ник полностью или Discord ID' });

  const webhook = parseWebhook(Deno.env.get('DISCORD_SENIOR_PROMOTION_WEBHOOK_URL'));
  if (!webhook) return json(503, { error: 'Вебхук отчётов старшего состава не настроен' });
  let guildId: string;
  try {
    const targetResponse = await fetch(webhook);
    if (!targetResponse.ok) {
      console.error('Senior promotion webhook lookup failed', targetResponse.status);
      return json(503, { error: 'Не удалось проверить канал для отчётов' });
    }
    const target = await targetResponse.json();
    if (typeof target.guild_id !== 'string' || String(target.channel_id) !== CHANNEL_ID || String(target.id) !== WEBHOOK_ID) {
      return json(503, { error: 'Вебхук отчётов привязан не к ожидаемому каналу' });
    }
    guildId = target.guild_id;
  } catch { return json(503, { error: 'Не удалось проверить канал для отчётов' }); }

  const userIds: string[] = [];
  if (names.length) {
    const botToken = Deno.env.get('DISCORD_BOT_TOKEN');
    if (!botToken) return json(503, { error: 'Поиск людей по Discord-нику сейчас недоступен' });
    for (const name of names) {
      const result = await resolveMember(guildId, name, botToken);
      if (!result.id) return json(422, { error: result.error || 'Не удалось найти сотрудника' });
      if (!userIds.includes(result.id)) userIds.push(result.id);
    }
  }
  const roleIds = userIds.length ? [] : [ROLE_IDS[mentionTarget === 'people' ? 'senior' : mentionTarget]];
  const mentions = userIds.length ? userIds.map(id => `<@${id}>`) : roleIds.map(id => `<@&${id}>`);
  const discordName = String(identityData.username || identityData.global_name || metadata.user_name || metadata.full_name || 'неизвестно').slice(0, 80);
  const dateStr = new Date().toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).replace(',', '');
  const embed = {
    title: 'Отчёт на повышение · старший состав',
    color: 3447003,
    fields: [
      { name: 'Ваш никнейм и #статик', value: nickStatic },
      { name: 'С какого ранга на какой', value: rankTransition },
      { name: 'Доказательства проделанной работы', value: evidence },
      { name: 'Кого отметить', value: mentions.join(' ') },
      { name: 'Discord ID', value: discordId },
    ],
    footer: { text: `Отправил ДС ${discordName} • ${dateStr}` },
    timestamp: new Date().toISOString(),
  };
  const url = new URL(webhook);
  url.searchParams.set('wait', 'true');
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `📤 Новый отчёт на повышение · старший состав\n${mentions.join(' ')}`,
        embeds: [embed],
        allowed_mentions: { parse: [], roles: roleIds, users: userIds },
      }),
    });
  } catch { return json(502, { error: 'Discord временно недоступен' }); }
  if (!response.ok) {
    console.error('Senior promotion webhook send failed', response.status);
    return json(502, { error: `Discord ответил ${response.status}` });
  }
  return json(200, { ok: true });
}, cors));
