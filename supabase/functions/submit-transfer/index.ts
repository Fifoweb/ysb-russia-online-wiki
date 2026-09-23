// Edge Function: приём заявки на перевод в ГИБДД и отправка в Discord webhook.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const transferNotificationRoleIds = ['1538937566282252319', '1538937566273732637'];

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const isValidDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

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

  const identity = (user.identities || []).find((item: { provider?: string }) => item.provider === 'discord') as
    | { identity_data?: { sub?: string } }
    | undefined;
  const discordId = identity?.identity_data?.sub;
  if (!discordId || !/^\d{17,20}$/.test(discordId)) {
    return json(403, { error: 'Для отправки войдите через Discord' });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: 'Некорректные данные формы' }); }
  const readText = (key: string) => typeof body[key] === 'string' ? body[key].trim() : '';

  const fullNameStatic = readText('fullNameStatic');
  const sourceFaction = readText('sourceFaction');
  const joinDate = readText('joinDate');
  const personalFileScreenshot = readText('personalFileScreenshot');
  const currentRank = readText('currentRank');
  const discordContact = readText('discordContact');

  if (!fullNameStatic || !sourceFaction || !joinDate || !personalFileScreenshot || !currentRank || !discordContact) {
    return json(400, { error: 'Заполните все обязательные поля' });
  }
  if (fullNameStatic.length > 100 || sourceFaction.length > 100 || personalFileScreenshot.length > 300 ||
    currentRank.length > 2 || discordContact.length > 60) {
    return json(400, { error: 'Слишком длинные поля' });
  }
  if (!isValidDate(joinDate)) return json(400, { error: 'Укажите корректную дату вступления' });
  if (!isHttpUrl(personalFileScreenshot)) return json(400, { error: 'Укажите корректную ссылку на скриншот' });
  if (!/^(?:[1-9]|1[0-5])$/.test(currentRank)) return json(400, { error: 'Ранг должен быть от 1 до 15' });

  const rawWebhookUrl = Deno.env.get('DISCORD_TRANSFER_WEBHOOK_URL');
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
  webhookUrl.searchParams.set('wait', 'true');

  const metadata = (user.user_metadata || {}) as Record<string, string | undefined>;
  const discordName = metadata.full_name || metadata.name || 'неизвестно';
  const dateStr = new Date().toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).replace(',', '');
  const roleMentions = transferNotificationRoleIds.map((roleId) => `<@&${roleId}>`).join(' ');

  const embed = {
    title: 'Перевод в ГИБДД',
    color: 3447003,
    fields: [
      { name: 'Имя Фамилия | StaticID', value: fullNameStatic },
      { name: 'Фракция, из которой переводится', value: sourceFaction },
      { name: 'Дата вступления во фракцию', value: joinDate.split('-').reverse().join('.') },
      { name: 'Скриншот личного дела из планшета', value: personalFileScreenshot },
      { name: 'Ранг', value: currentRank, inline: true },
      { name: 'Discord для связи', value: discordContact, inline: true },
    ],
    footer: { text: `By ${discordName} • ${dateStr}` },
    timestamp: new Date().toISOString(),
  };

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: `${roleMentions}\n📋 Новая заявка на перевод в ГИБДД от <@${discordId}>`,
      embeds: [embed],
      allowed_mentions: {
        parse: [],
        users: [discordId],
        roles: transferNotificationRoleIds,
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error('Discord error', res.status, text);
    return json(502, { error: `Discord ответил ${res.status}` });
  }
  return json(200, { ok: true });
});
