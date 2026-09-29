import { createClient } from 'jsr:@supabase/supabase-js@2';
import { withSubmissionCooldown } from '../_shared/submissionCooldown.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const TARGETS = {
  academy: { webhookId: '1553922705936617472', channelId: '1538937581432078451', roleId: '1540267213578043434', secret: 'DISCORD_ACADEMY_PROMOTION_WEBHOOK_URL' },
  uku: { webhookId: '1554442409205563452', channelId: '1538937582400966689', roleId: '1540268884987478096', secret: 'DISCORD_UKU_PROMOTION_WEBHOOK_URL' },
} as const;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function webhookUrl(raw: string | undefined, webhookId: string): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && url.hostname === 'discord.com' && !url.port &&
      !url.username && !url.password && !url.search && !url.hash &&
      new RegExp(`^/api/webhooks/${webhookId}/[\\w.-]+$`).test(url.pathname) ? url : null;
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
  if (!nickStatic || nickStatic.length > 100) return json(400, { error: 'Укажите никнейм и #статик (до 100 символов)' });
  const department = body.department === undefined ? 'academy' : body.department;
  if (department !== 'academy' && department !== 'uku') return json(400, { error: 'Выберите подразделение из списка' });
  const targetConfig = TARGETS[department];
  let title: string;
  let rankLabel: string;
  let fields: { name: string; value: string }[];
  if (department === 'uku') {
    const { fromRank, toRank } = body;
    const workEvidence = typeof body.evidence === 'string' ? body.evidence.trim() : '';
    if (typeof fromRank !== 'number' || typeof toRank !== 'number' ||
      !Number.isInteger(fromRank) || !Number.isInteger(toRank) ||
      fromRank < 1 || toRank > 15 || fromRank >= toRank) {
      return json(400, { error: 'Укажите повышение: ранги от 1 до 15, целевой ранг выше исходного' });
    }
    if (!workEvidence || workEvidence.length > 1000) return json(400, { error: 'Добавьте доказательства проделанной работы (до 1000 символов)' });
    rankLabel = `${fromRank} → ${toRank}`;
    title = `Отчёт на повышение · УКУ · ${rankLabel}`;
    fields = [
      { name: '🎖️ С какого ранга', value: String(fromRank) },
      { name: '📈 На какой ранг', value: String(toRank) },
      { name: '📎 Доказательства проделанной работы', value: workEvidence },
    ];
  } else {
    const rankTransition = body.rankTransition;
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
    rankLabel = rankTransition;
    title = rankTransition === '1-2'
      ? 'Отчёт Академии · Рядовой (1) → Младший сержант (2)'
      : 'Отчёт Академии · Младший сержант (2) → Сержант (3)';
    fields = rankTransition === '1-2' ? [
      { name: '🪪 Удостоверение в Правительстве', value: links.governmentId! },
      { name: '📚 Экзамен: строевая, субординация, радиообмен, устав', value: links.exam! },
      { name: '🚓 Практика: трафик-стоп, статьи, штраф', value: links.practice! },
      { name: '🛡️ Роль State Fraction', value: links.stateFractionRole! },
    ] : [
      { name: '📚 Экзамен по КоАП, УК и УПК', value: links.exam! },
      { name: '🚓 Практика по УПК', value: links.practice! },
    ];
  }

  const webhook = webhookUrl(Deno.env.get(targetConfig.secret), targetConfig.webhookId);
  if (!webhook) return json(503, { error: `Вебхук отчётов ${department === 'uku' ? 'УКУ' : 'Академии'} не настроен` });
  try {
    const targetResponse = await fetch(webhook);
    if (!targetResponse.ok) {
      console.error('Promotion report webhook lookup failed', targetResponse.status);
      return json(503, { error: 'Не удалось проверить канал отчётов' });
    }
    const target = await targetResponse.json();
    if (String(target.id) !== targetConfig.webhookId || String(target.channel_id) !== targetConfig.channelId) {
      return json(503, { error: 'Вебхук привязан не к ожидаемому каналу' });
    }
  } catch { return json(503, { error: 'Не удалось проверить канал отчётов' }); }

  const discordName = String(identityData.username || identityData.global_name || metadata.user_name || metadata.full_name || 'неизвестно').slice(0, 80);
  const dateStr = new Date().toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).replace(',', '');
  const embed = {
    title,
    color: 3447003,
    fields: [
      { name: '👤 Ваш никнейм и #статик', value: nickStatic },
      ...(department === 'uku' ? [{ name: '💬 Ник Discord', value: discordName }] : []),
      ...fields,
      { name: '🆔 Discord ID', value: discordId },
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
        content: `📤 Новый отчёт ${department === 'uku' ? 'УКУ' : 'Академии'} · ${rankLabel}\nЗаявка от <@${discordId}> · <@&${targetConfig.roleId}>`,
        embeds: [embed],
        allowed_mentions: { parse: [], roles: [targetConfig.roleId], users: [discordId] },
      }),
    });
  } catch { return json(502, { error: 'Discord временно недоступен' }); }
  if (!response.ok) {
    console.error('Promotion report webhook send failed', response.status);
    return json(502, { error: `Discord ответил ${response.status}` });
  }
  return json(200, { ok: true });
}, cors));
