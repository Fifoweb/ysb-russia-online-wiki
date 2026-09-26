import { createClient } from 'jsr:@supabase/supabase-js@2';
import { withSubmissionCooldown } from '../_shared/submissionCooldown.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const CHANNEL_ID = '1543107340016812144';
const NOTIFICATION_ROLE_IDS = ['1538937566273732637', '1540269592927019038'];
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

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

async function sendWebhookMessage(target: { url: URL }, content: string, embeds: unknown[], roleIds: string[]) {
  const url = new URL(target.url);
  url.searchParams.set('wait', 'true');
  return await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, embeds, allowed_mentions: { parse: [], roles: roleIds } }),
  });
}

Deno.serve(withSubmissionCooldown(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json(401, { error: 'Войдите через Discord' });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: 'Некорректные данные формы' }); }
  const readText = (key: string) => typeof body[key] === 'string' ? body[key].trim() : '';
  const offender = readText('offender');
  const description = readText('description');
  const evidence = readText('evidence');
  const contactDiscord = readText('contactDiscord');
  if (!offender || !description || !contactDiscord) return json(400, { error: 'Заполните обязательные поля' });
  if (offender.length > 100 || description.length > 1024 || evidence.length > 1000 || contactDiscord.length > 100) {
    return json(400, { error: 'Слишком длинные поля' });
  }

  const identity = user.identities?.find((item) => item.provider === 'discord');
  const identityData = (identity?.identity_data || {}) as Record<string, unknown>;
  const metadata = (user.user_metadata || {}) as Record<string, unknown>;
  const discordId = identityData.sub;
  const discordName = String(identityData.username || identityData.global_name || metadata.user_name || metadata.preferred_username || metadata.full_name || metadata.name || 'неизвестно').slice(0, 80);
  if (typeof discordId !== 'string' || !/^\d{17,20}$/.test(discordId)) {
    return json(403, { error: 'Не удалось получить Discord ID. Войдите через Discord ещё раз.' });
  }

  const target = await getWebhookTarget(Deno.env.get('DISCORD_COMPLAINT_WEBHOOK_URL'), CHANNEL_ID);
  if (!target) return json(500, { error: 'Вебхук жалоб не настроен для нужного канала' });
  const dateStr = new Date().toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).replace(',', '');
  const embed = {
    title: 'Анонимная жалоба',
    color: 15158332,
    fields: [
      { name: 'Никнейм / Статик нарушителя', value: offender },
      { name: 'Описание ситуации', value: description },
      { name: 'Доказательства', value: evidence || 'Не приложены' },
      { name: 'Discord для связи', value: contactDiscord },
      { name: 'Discord ID', value: discordId, inline: true },
    ],
    footer: { text: `Отправил ДС ${discordName} • ${dateStr}` },
    timestamp: new Date().toISOString(),
  };
  const response = await sendWebhookMessage(
    target,
    `🕵️ Новая анонимная жалоба\n${NOTIFICATION_ROLE_IDS.map((id) => `<@&${id}>`).join(' ')}`,
    [embed],
    NOTIFICATION_ROLE_IDS,
  );
  if (!response.ok) {
    console.error('Discord complaint webhook error', response.status, await response.text());
    return json(502, { error: `Discord ответил ${response.status}` });
  }
  return json(200, { ok: true });
}, cors));
