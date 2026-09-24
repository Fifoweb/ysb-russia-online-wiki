import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const CHANNEL_ID = '1538937580421255239';
const GIBDD_ROLE_IDS = ['1540269592927019038', '1540267656370716693'];
const OTHER_ROLE_IDS = ['1538937566273732637'];
const FACTIONS: Record<string, string> = {
  gibdd: 'ГИБДД',
  mvd: 'МВД',
  fsb: 'ФСБ',
};
const MAX_AGE_MS = 48 * 60 * 60 * 1000;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function getWebhookUrl(raw: string | undefined) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && url.hostname === 'discord.com' && !url.port && !url.username && !url.password &&
      !url.search && !url.hash && /^\/api\/webhooks\/\d{17,20}\/[\w.-]+$/.test(url.pathname) ? url : null;
  } catch {
    return null;
  }
}

async function getWebhookTarget(raw: string | undefined) {
  const url = getWebhookUrl(raw);
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error('Employee complaint webhook lookup failed', response.status);
      return null;
    }
    const webhook = await response.json();
    return String(webhook.channel_id) === CHANNEL_ID && typeof webhook.guild_id === 'string' ? url : null;
  } catch {
    console.error('Employee complaint webhook lookup failed');
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json(401, { error: 'Для отправки жалобы войдите через Discord' });

  const identity = user.identities?.find((item) => item.provider === 'discord');
  const identityData = (identity?.identity_data || {}) as Record<string, unknown>;
  const metadata = (user.user_metadata || {}) as Record<string, unknown>;
  const discordId = identityData.sub;
  if (typeof discordId !== 'string' || !/^\d{17,20}$/.test(discordId)) {
    return json(403, { error: 'Не удалось получить Discord ID. Войдите через Discord ещё раз.' });
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return json(400, { error: 'Некорректные данные формы' });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return json(400, { error: 'Некорректные данные формы' });
  }
  const readText = (key: string) => typeof body[key] === 'string' ? body[key].trim() : '';
  const reporter = readText('reporterNicknameStatic');
  const offender = readText('offenderNicknameStatic');
  const faction = readText('faction');
  const otherFaction = readText('otherFaction');
  const description = readText('description');
  const evidence = readText('evidence');
  const incidentAt = readText('incidentAt');
  if (!reporter || !offender || !description || !evidence || !incidentAt ||
    !(Object.hasOwn(FACTIONS, faction) || faction === 'other') || (faction === 'other' && !otherFaction)) {
    return json(400, { error: 'Заполните все обязательные поля' });
  }
  if (reporter.length > 100 || offender.length > 100 || otherFaction.length > 80 ||
    description.length > 1024 || evidence.length > 1000) {
    return json(400, { error: 'Слишком длинные поля' });
  }

  // The time comes from the form, so enforce the 48-hour window again on the server.
  const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(incidentAt)
    ? Date.parse(incidentAt) : NaN;
  const age = Date.now() - timestamp;
  if (!Number.isFinite(timestamp) || age < -5 * 60 * 1000) {
    return json(400, { error: 'Укажите корректные дату и время происшествия' });
  }
  if (age > MAX_AGE_MS) {
    return json(422, { error: 'Прошло более 48 часов после происшествия. Жалоба отклонена.' });
  }

  const webhook = await getWebhookTarget(Deno.env.get('DISCORD_EMPLOYEE_COMPLAINT_WEBHOOK_URL'));
  if (!webhook) return json(500, { error: 'Вебхук жалоб на сотрудников не настроен для нужного канала' });
  const roleIds = faction === 'gibdd' ? GIBDD_ROLE_IDS : OTHER_ROLE_IDS;
  const discordName = String(
    identityData.username || identityData.global_name || metadata.user_name || metadata.preferred_username ||
    metadata.full_name || metadata.name || 'неизвестно',
  ).slice(0, 80);
  const formatDate = (date: Date) => date.toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).replace(',', '');
  const webhookUrl = new URL(webhook);
  webhookUrl.searchParams.set('wait', 'true');

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: '📋 Новая жалоба на сотрудника\n' + roleIds.map((id) => '<@&' + id + '>').join(' '),
        embeds: [{
          title: 'Жалоба на сотрудника',
          color: 4360181,
          fields: [
            { name: 'Никнейм и #статик заявителя', value: reporter },
            { name: 'Никнейм и/или #статик нарушителя', value: offender },
            { name: 'Фракция нарушителя', value: faction === 'other' ? otherFaction : FACTIONS[faction] },
            { name: 'Описание ситуации', value: description },
            { name: 'Дата и время происшествия (МСК)', value: formatDate(new Date(timestamp)) },
            { name: 'Доказательства нарушения', value: evidence },
            { name: 'Discord ID отправителя', value: discordId },
          ],
          footer: { text: 'Отправил ДС ' + discordName + ' • ' + formatDate(new Date()) },
          timestamp: new Date().toISOString(),
        }],
        allowed_mentions: { parse: [], roles: roleIds },
      }),
    });
    if (!response.ok) {
      console.error('Employee complaint webhook error', response.status);
      return json(502, { error: 'Discord ответил ' + response.status });
    }
  } catch {
    console.error('Employee complaint webhook request failed');
    return json(502, { error: 'Не удалось связаться с Discord. Попробуйте позже.' });
  }
  return json(200, { ok: true });
});
