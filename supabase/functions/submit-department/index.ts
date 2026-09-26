// Заявка в отдел: Discord-вход обязателен, Discord ID берётся из авторизованной сессии.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { withSubmissionCooldown } from '../_shared/submissionCooldown.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Route = { webhookSecret: string; threadId: string; notificationRoleId: string };
const DEFAULT_ROUTE: Route = {
  webhookSecret: 'DISCORD_DEPARTMENT_WEBHOOK_URL',
  threadId: '1540874839471165520',
  notificationRoleId: '1540269592927019038',
};
const ROUTES: Record<string, Route> = {
  mb: { webhookSecret: 'DISCORD_DEPARTMENT_MB_WEBHOOK_URL', threadId: '1542235723921498184', notificationRoleId: '1542235140611379260' },
  sdb: { webhookSecret: 'DISCORD_DEPARTMENT_SDB_WEBHOOK_URL', threadId: '1540875016298565723', notificationRoleId: '1540268801193672755' },
  uku: { webhookSecret: 'DISCORD_DEPARTMENT_UKU_WEBHOOK_URL', threadId: '1540875076554203296', notificationRoleId: '1540268884987478096' },
  ugk: { webhookSecret: 'DISCORD_DEPARTMENT_UGK_WEBHOOK_URL', threadId: '1540874785364377610', notificationRoleId: '1540269700443799583' },
  uor: { webhookSecret: 'DISCORD_DEPARTMENT_UOR_WEBHOOK_URL', threadId: '1540874929795240080', notificationRoleId: '1540268999718342656' },
  dps: { webhookSecret: 'DISCORD_DEPARTMENT_DPS_WEBHOOK_URL', threadId: '1542223019639046144', notificationRoleId: '1540268712282562610' },
};
const DEPARTMENTS: Record<string, string> = {
  ugk: 'УГК | Управление грузового контроля',
  usb: 'УСБ | Управление собственной безопасности',
  mb: 'МБ | Мотоциклетный Батальон',
  uor: 'УОР | Управление оперативного розыска',
  sdb: 'СДБ | Специальный дорожный батальон',
  uku: 'УКУ | Учебно-кадровое управление',
  dps: 'ДПС | Дорожно-патрульная служба',
  ukm: 'УКМ | Управление по контролю магистралей',
  academy: 'Академия',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function getWebhookUrl(raw: string | undefined): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && url.hostname === 'discord.com' && !url.port && !url.username &&
      !url.password && !url.search && !url.hash &&
      /^\/api\/webhooks\/\d{17,20}\/[\w.-]+$/.test(url.pathname) ? url : null;
  } catch { return null; }
}

Deno.serve(withSubmissionCooldown(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json(401, { error: 'Для отправки заявки войдите через Discord' });

  const identity = user.identities?.find((item) => item.provider === 'discord');
  const identityData = (identity?.identity_data || {}) as Record<string, unknown>;
  const metadata = (user.user_metadata || {}) as Record<string, unknown>;
  const discordId = identityData.sub;
  if (typeof discordId !== 'string' || !/^\d{17,20}$/.test(discordId)) {
    return json(403, { error: 'Не удалось получить Discord ID. Войдите через Discord ещё раз.' });
  }

  let rawBody: unknown;
  try { rawBody = await req.json(); } catch { return json(400, { error: 'Некорректные данные формы' }); }
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return json(400, { error: 'Некорректные данные формы' });
  }
  const body = rawBody as Record<string, unknown>;
  const readText = (key: string) => typeof body[key] === 'string' ? body[key].trim() : '';
  const fullNameStatic = readText('fullNameStatic');
  const currentRank = readText('currentRank');
  const sourceDepartment = readText('sourceDepartment');
  const targetDepartment = readText('targetDepartment');

  if (!fullNameStatic || !currentRank || !sourceDepartment || !targetDepartment) {
    return json(400, { error: 'Заполните все обязательные поля' });
  }
  if (fullNameStatic.length > 100) return json(400, { error: 'Слишком длинное имя или StaticID' });
  if (!/^(?:[1-9]|1[0-5])$/.test(currentRank)) {
    return json(400, { error: 'Ранг должен быть числом от 1 до 15' });
  }
  if (!Object.prototype.hasOwnProperty.call(DEPARTMENTS, sourceDepartment) ||
    !Object.prototype.hasOwnProperty.call(DEPARTMENTS, targetDepartment) ||
    sourceDepartment === targetDepartment) {
    return json(400, { error: 'Выберите разные отделы из списка' });
  }

  const route = ROUTES[targetDepartment] ?? DEFAULT_ROUTE;
  const webhook = getWebhookUrl(Deno.env.get(route.webhookSecret));
  if (!webhook) return json(503, { error: 'Отправка заявок в отдел временно не настроена' });
  try {
    const lookup = await fetch(webhook);
    if (!lookup.ok || typeof (await lookup.json()).channel_id !== 'string') {
      console.error('Discord department webhook lookup failed', lookup.status);
      return json(503, { error: 'Вебхук заявок в отдел недоступен' });
    }
  } catch (error) {
    console.error('Discord department webhook lookup failed', error);
    return json(503, { error: 'Вебхук заявок в отдел недоступен' });
  }

  const discordName = String(
    identityData.username || identityData.global_name || metadata.user_name ||
    metadata.preferred_username || metadata.full_name || metadata.name || 'неизвестно',
  ).slice(0, 80);
  const dateStr = new Date().toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).replace(',', '');
  const destination = new URL(webhook);
  destination.searchParams.set('wait', 'true');
  destination.searchParams.set('thread_id', route.threadId);

  try {
    const response = await fetch(destination, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: '📋 Заявка в отдел | Заявка от <@' + discordId + '>\n<@&' + route.notificationRoleId + '>',
        embeds: [{
          title: 'Заявка в отдел',
          color: 3840255,
          fields: [
            { name: 'Имя Фамилия | StaticID', value: fullNameStatic },
            { name: 'Ваш текущий ранг', value: currentRank },
            { name: 'Из какого отдела переводитесь?', value: DEPARTMENTS[sourceDepartment] },
            { name: 'Выберите отдел', value: DEPARTMENTS[targetDepartment] },
            { name: 'Discord ID', value: discordId },
          ],
          footer: { text: 'Отправил ДС ' + discordName + ' • ' + dateStr },
          timestamp: new Date().toISOString(),
        }],
        allowed_mentions: { parse: [], roles: [route.notificationRoleId], users: [discordId] },
      }),
    });
    if (!response.ok) {
      console.error('Discord department webhook error', response.status);
      return json(502, { error: 'Discord ответил ' + response.status });
    }
  } catch (error) {
    console.error('Discord department webhook request failed', error);
    return json(502, { error: 'Не удалось отправить заявку в Discord. Попробуйте позже.' });
  }
  return json(200, { ok: true });
}, cors));
