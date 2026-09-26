// Edge Function: приём заявки на отработку выговора и отправка в Discord-ветку через webhook.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { withSubmissionCooldown } from '../_shared/submissionCooldown.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const THREAD_ID = '1540883697161732147';
const NOTIFICATION_ROLE_IDS = ['1540269592927019038', '1540267656370716693'];

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

async function getWebhook(raw: string | undefined) {
  const url = getWebhookUrl(raw);
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error('Discord reprimand-work webhook lookup failed', response.status);
      return null;
    }
    const webhook = await response.json();
    return typeof webhook.channel_id === 'string' ? { url } : null;
  } catch (error) {
    console.error('Discord reprimand-work webhook lookup failed', error);
    return null;
  }
}

Deno.serve(withSubmissionCooldown(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json(401, { error: 'Для отправки заявки войдите через Discord' });

  const identity = user.identities?.find((item) => item.provider === 'discord');
  const identityData = (identity?.identity_data || {}) as Record<string, unknown>;
  const metadata = (user.user_metadata || {}) as Record<string, unknown>;
  const discordId = identityData.sub;
  if (typeof discordId !== 'string' || !/^\d{17,20}$/.test(discordId)) {
    return json(403, { error: 'Не удалось получить Discord ID. Войдите через Discord ещё раз.' });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: 'Некорректные данные формы' }); }
  const readText = (key: string) => typeof body[key] === 'string' ? body[key].trim() : '';
  const nick = readText('nick');
  const reprimandScreenshot = readText('reprimandScreenshot');
  const action = readText('action');
  const evidence = readText('evidence');

  if (!nick || !reprimandScreenshot || !action || !evidence) {
    return json(400, { error: 'Заполните все обязательные поля' });
  }
  if (nick.length > 100 || reprimandScreenshot.length > 300 || action.length > 1000 || evidence.length > 1000) {
    return json(400, { error: 'Слишком длинные поля' });
  }
  try {
    const screenshotUrl = new URL(reprimandScreenshot);
    if (!['http:', 'https:'].includes(screenshotUrl.protocol)) throw new Error('Unsupported protocol');
  } catch {
    return json(400, { error: 'Укажите корректную ссылку на скрин личного дела' });
  }

  const target = await getWebhook(Deno.env.get('DISCORD_REPRIMAND_WORK_WEBHOOK_URL'));
  if (!target) return json(500, { error: 'Вебхук отработки выговора не настроен' });

  const discordName = String(
    identityData.username || identityData.global_name || metadata.user_name || metadata.preferred_username ||
    metadata.full_name || metadata.name || 'неизвестно',
  ).slice(0, 80);
  const dateStr = new Date().toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).replace(',', '');
  const roleMentions = NOTIFICATION_ROLE_IDS.map((id) => `<@&${id}>`).join(' ');
  const webhookUrl = new URL(target.url);
  webhookUrl.searchParams.set('wait', 'true');
  webhookUrl.searchParams.set('thread_id', THREAD_ID);

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: `🛠️ Новая заявка на отработку выговора\n${roleMentions}`,
      embeds: [{
        title: 'Отработка выговора',
        color: 13912832,
        fields: [
          { name: 'Ваш никнейм | статик', value: nick },
          { name: 'Скрин вашего личного дела (планшета) с выданным выговором', value: `[Открыть скриншот](${reprimandScreenshot})` },
          { name: 'Каким действием отрабатываете выговор', value: action },
          { name: 'Доказательства отработки (видеозапись / скрин)', value: evidence },
          { name: 'Discord ID', value: discordId },
        ],
        footer: { text: `Отправил ДС ${discordName} • ${dateStr}` },
        timestamp: new Date().toISOString(),
      }],
      allowed_mentions: { parse: [], roles: NOTIFICATION_ROLE_IDS },
    }),
  });
  if (!response.ok) {
    const details = await response.text();
    console.error('Discord reprimand-work webhook error', response.status, details);
    return json(502, { error: `Discord ответил ${response.status}` });
  }
  return json(200, { ok: true });
}, cors));
