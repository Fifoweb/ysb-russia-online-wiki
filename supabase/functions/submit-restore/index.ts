// Edge Function: приём «Заявки на восстановление сотрудника» с сайта и отправка в Discord-канал.
// JWT обязателен (шлюз Supabase проверяет сессию), здесь достаём пользователя для подписи.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

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
  const factionScreenshot = (body.factionScreenshot || '').trim(); // опционально (после ban/warn)
  const rankEvidence = (body.rankEvidence || '').trim();
  const dismissReason = (body.dismissReason || '').trim();
  const previousRank = (body.previousRank || '').trim();
  const discordContact = (body.discordContact || '').trim();

  if (!fullNameStatic || !rankEvidence || !dismissReason || !previousRank || !discordContact) {
    return json(400, { error: 'Заполните все обязательные поля' });
  }
  if (fullNameStatic.length > 100 || factionScreenshot.length > 300 || rankEvidence.length > 300 ||
    dismissReason.length > 500 || previousRank.length > 30 || discordContact.length > 60) {
    return json(400, { error: 'Слишком длинные поля' });
  }

  const botToken = Deno.env.get('DISCORD_BOT_TOKEN');
  const channelId = Deno.env.get('DISCORD_RESTORE_CHANNEL_ID');
  if (!botToken || !channelId) return json(500, { error: 'Сервер не настроен' });

  const meta = (user.user_metadata || {}) as Record<string, string | undefined>;
  const discordName = meta.full_name || meta.name || 'неизвестно';
  const identity = (user.identities || []).find((i: { provider?: string }) => i.provider === 'discord') as
    | { id?: string; identity_data?: { sub?: string } }
    | undefined;
  const discordId = identity?.identity_data?.sub || meta.sub || identity?.id || null;
  const mention = discordId ? `<@${discordId}>` : discordName;

  const dateStr = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');

  const embed = {
    title: 'Восстановление',
    color: 440020, // бирюзово-голубой акцент сайта (#06b6d4)
    fields: [
      { name: 'Имя Фамилия | static', value: fullNameStatic },
      { name: 'Скриншот на одобренный запрос из дискорда гос.фракций (если после ban/warn)', value: factionScreenshot || '—' },
      { name: 'Доказательства пребывания на ранге', value: rankEvidence },
      { name: 'Причина увольнения', value: dismissReason },
      { name: 'Ранг до увольнения', value: previousRank },
      { name: 'Дискорд для связи', value: discordContact },
    ],
    footer: { text: `By ${discordName} • ${dateStr}` },
    timestamp: new Date().toISOString(),
  };

  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: `📋 Новая заявка на восстановление от ${mention}`,
      embeds: [embed],
      components: [{
        type: 1,
        components: [
          { type: 2, style: 3, label: 'Принять', custom_id: 'restore-accept', emoji: { name: '✅' } },
          { type: 2, style: 4, label: 'Отказать', custom_id: 'restore-reject', emoji: { name: '❌' } },
        ],
      }],
    }),
  });
  if (!res.ok) { const t = await res.text(); console.error('Discord error', res.status, t); return json(502, { error: `Discord ответил ${res.status}` }); }
  return json(200, { ok: true });
});
