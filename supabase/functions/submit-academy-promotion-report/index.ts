import { createClient } from 'jsr:@supabase/supabase-js@2';
import { withSubmissionCooldown } from '../_shared/submissionCooldown.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const WEBHOOK_ID = '1553922705936617472';
const CHANNEL_ID = '1538937581432078451';
const NOTIFICATION_ROLE_ID = '1540267213578043434';
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function webhookUrl(raw: string | undefined): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && url.hostname === 'discord.com' && !url.port &&
      !url.username && !url.password && !url.search && !url.hash &&
      new RegExp(`^/api/webhooks/${WEBHOOK_ID}/[\\w.-]+$`).test(url.pathname) ? url : null;
  } catch { return null; }
}

function evidenceUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim() || value.length > 500) return null;
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      ['imgur.com', 'fotora.ru', 'yapx.ru'].some(domain => host === domain || host.endsWith(`.${domain}`))
      ? url.href : null;
  } catch { return null; }
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
  const nickStatic = typeof body.nickStatic === 'string' ? body.nickStatic.trim() : '';
  const rankTransition = body.rankTransition;
  if (!nickStatic || nickStatic.length > 100) return json(400, { error: 'Укажите никнейм и #статик (до 100 символов)' });
  if (rankTransition !== '1-2' && rankTransition !== '2-3') {
    return json(400, { error: 'Выберите повышение с 1 на 2 или с 2 на 3' });
  }
  if (!body.evidence || typeof body.evidence !== 'object' || Array.isArray(body.evidence)) {
    return json(400, { error: 'Добавьте доказательства выполнения заданий' });
  }
  const evidence = body.evidence as Record<string, unknown>;
  const required = rankTransition === '1-2'
    ? ['governmentId', 'exam', 'practice', 'stateFractionRole']
    : ['exam', 'practice'];
  const links = Object.fromEntries(required.map(key => [key, evidenceUrl(evidence[key])]));
  if (required.some(key => !links[key])) {
    return json(400, { error: 'Приложите ко всем заданиям ссылки HTTPS на Imgur, Fotora или Япикс' });
  }

  const webhook = webhookUrl(Deno.env.get('DISCORD_ACADEMY_PROMOTION_WEBHOOK_URL'));
  if (!webhook) return json(503, { error: 'Вебхук отчётов Академии не настроен' });
  try {
    const targetResponse = await fetch(webhook);
    if (!targetResponse.ok) {
      console.error('Academy promotion webhook lookup failed', targetResponse.status);
      return json(503, { error: 'Не удалось проверить канал отчётов Академии' });
    }
    const target = await targetResponse.json();
    if (String(target.id) !== WEBHOOK_ID || String(target.channel_id) !== CHANNEL_ID) {
      return json(503, { error: 'Вебхук Академии привязан не к ожидаемому каналу' });
    }
  } catch { return json(503, { error: 'Не удалось проверить канал отчётов Академии' }); }

  const discordName = String(identityData.username || identityData.global_name || metadata.user_name || metadata.full_name || 'неизвестно').slice(0, 80);
  const dateStr = new Date().toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).replace(',', '');
  const fields = rankTransition === '1-2' ? [
    { name: 'Удостоверение в Правительстве', value: links.governmentId },
    { name: 'Экзамен: строевая, субординация, радиообмен, устав', value: links.exam },
    { name: 'Практика: трафик-стоп, статьи, штраф', value: links.practice },
    { name: 'Роль State Fraction', value: links.stateFractionRole },
  ] : [
    { name: 'Экзамен по КоАП, УК и УПК', value: links.exam },
    { name: 'Практика по УПК', value: links.practice },
  ];
  const embed = {
    title: rankTransition === '1-2'
      ? 'Отчёт Академии · Рядовой (1) → Младший сержант (2)'
      : 'Отчёт Академии · Младший сержант (2) → Сержант (3)',
    color: 3447003,
    fields: [
      { name: 'Ваш никнейм и #статик', value: nickStatic },
      ...fields,
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
        content: `📤 Новый отчёт Академии · ${rankTransition}\nЗаявка от <@${discordId}> · <@&${NOTIFICATION_ROLE_ID}>`,
        embeds: [embed],
        allowed_mentions: { parse: [], roles: [NOTIFICATION_ROLE_ID], users: [discordId] },
      }),
    });
  } catch { return json(502, { error: 'Discord временно недоступен' }); }
  if (!response.ok) {
    console.error('Academy promotion webhook send failed', response.status);
    return json(502, { error: `Discord ответил ${response.status}` });
  }
  return json(200, { ok: true });
}, cors));
