// Edge Function: приём «Заявления на повышение» с сайта и отправка в Discord-канал.
// Сессия пользователя проверяется шлюзом Supabase (JWT обязателен),
// здесь дополнительно достаём пользователя для подписи в сообщении.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  // Проверка, что вызов делает вошедший пользователь
  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return json(401, { error: 'Не авторизован' });

  // Поля формы
  let body: Record<string, string>;
  try { body = await req.json(); } catch { return json(400, { error: 'Bad JSON' }); }

  const nick = (body.nick || '').trim();
  const currentRank = (body.currentRank || '').trim();
  const targetRank = (body.targetRank || '').trim();
  const points = (body.points || '').trim();
  const evidence = (body.evidence || '').trim();

  if (!nick || !currentRank || !targetRank || !points || !evidence) {
    return json(400, { error: 'Заполните все поля' });
  }
  if (nick.length > 100 || currentRank.length > 60 || targetRank.length > 60 || points.length > 20 || evidence.length > 1000) {
    return json(400, { error: 'Слишком длинные поля' });
  }

  const botToken = Deno.env.get('DISCORD_BOT_TOKEN');
  const channelId = Deno.env.get('DISCORD_CHANNEL_ID');
  if (!botToken || !channelId) return json(500, { error: 'Сервер не настроен' });

  // ── v2: сюда позже добавится проверка роли Discord (checkRole(user) → 403) ──

  const meta = (user.user_metadata || {}) as Record<string, string | undefined>;
  const discordName = meta.full_name || meta.name || 'неизвестно';
  // Discord snowflake ID пользователя — для настоящего тега <@id>
  const identity = (user.identities || []).find((i: { provider?: string }) => i.provider === 'discord') as
    | { id?: string; identity_data?: { sub?: string } }
    | undefined;
  const discordId = identity?.identity_data?.sub || meta.sub || identity?.id || null;
  const mention = discordId ? `<@${discordId}>` : discordName;

  const embed = {
    author: { name: 'Начальник ГИБДД' },
    title: '📤 Заявление на повышение',
    color: 10824234, // фиолетовый акцент сайта (#a855f7)
    fields: [
      { name: 'Отправил', value: mention, inline: true },
      { name: 'Ник и статик', value: nick, inline: true },
      { name: 'Текущее звание', value: currentRank, inline: true },
      { name: 'Подаётся на звание', value: targetRank, inline: true },
      { name: 'Набрано баллов', value: points, inline: true },
      { name: 'Доказательства', value: evidence.slice(0, 1000) },
    ],
    timestamp: new Date().toISOString(),
  };

  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: `📤 Новое заявление на повышение от ${mention}`, // тег в тексте = реальное упоминание
      embeds: [embed],
    }),
  });
  if (!res.ok) { const t = await res.text(); console.error('Discord error', res.status, t); return json(502, { error: 'Discord ответил ' + res.status + ': ' + t.slice(0, 200) }); }
  return json(200, { ok: true });
});
