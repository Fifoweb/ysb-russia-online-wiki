import { createClient } from 'jsr:@supabase/supabase-js@2';
import { withSubmissionCooldown } from '../_shared/submissionCooldown.ts';
import { achievementGoals, canonicalEvidenceLink, validateAchievementSubmission } from '../_shared/achievements.ts';
import { buildAchievementMessage } from '../_shared/achievementMessage.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json' },
});

Deno.serve(withSubmissionCooldown(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json(401, { error: 'Для отправки отчёта войдите через Discord.' });
  const identity = user.identities?.find(item => item.provider === 'discord')?.identity_data as Record<string, unknown> | undefined;
  const discordId = identity?.sub;
  if (typeof discordId !== 'string' || !/^\d{17,20}$/.test(discordId)) {
    return json(403, { error: 'Не удалось подтвердить Discord ID. Войдите через Discord ещё раз.' });
  }
  let raw: unknown;
  try { raw = await req.json(); } catch { return json(400, { error: 'Некорректные данные отчёта.' }); }
  const validated = validateAchievementSubmission(raw);
  if (!validated.value) return json(400, { error: validated.error });
  const body = validated.value;
  const goal = achievementGoals.find(item => item.id === body.achievementId)!;
  let webhook: URL;
  try {
    webhook = new URL(Deno.env.get('DISCORD_ACHIEVEMENTS_WEBHOOK_URL') ?? '');
    if (webhook.protocol !== 'https:' || webhook.hostname !== 'discord.com' || webhook.port || webhook.username ||
      webhook.password || webhook.search || webhook.hash || !/^\/api\/webhooks\/\d{17,20}\/[\w.-]+$/.test(webhook.pathname)) throw new Error();
  } catch { return json(503, { error: 'Отправка отчётов по ачивкам временно не настроена.' }); }
  const discordName = String(identity?.username || identity?.global_name || 'неизвестно').slice(0, 80);
  const keys = body.evidence.map(link => canonicalEvidenceLink(link)!);
  const fingerprintBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ ...body, requestId: undefined, evidence: keys })));
  const fingerprint = Array.from(new Uint8Array(fingerprintBytes), value => value.toString(16).padStart(2, '0')).join('');
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: reservation, error: reserveError } = await admin.rpc('reserve_achievement_report', {
    p_user_id: user.id, p_request_id: body.requestId, p_discord_id: discordId, p_discord_name: discordName,
    p_body: body, p_fingerprint: fingerprint, p_keys: keys,
  });
  if (reserveError || !reservation?.result) {
    console.error('Achievement reservation unavailable');
    return json(503, { error: 'Не удалось сохранить отчёт. Попробуйте позже.' });
  }
  if (reservation.result === 'sent') return json(200, { ok: true, alreadySent: true });
  if (reservation.result === 'duplicate') return json(409, { error: 'Эти доказательства, проверка склада за этот день или замер в это время уже отправлены на этой неделе.' });
  if (['sending', 'uncertain'].includes(reservation.result)) return json(409, {
    error: 'Этот отчёт уже отправляется или требует проверки доставки. Проверьте ветку Discord у куратора перед повторной подачей.',
  });
  if (reservation.result !== 'reserved') return json(400, { error: 'Данные отчёта изменились или началась новая неделя. Проверьте форму.' });

  const settle = async (status: string, messageId: string | null = null) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { data, error } = await admin.rpc('settle_achievement_report', {
          p_report_id: reservation.id, p_status: status, p_message_id: messageId,
        });
        if (!error && data === true) return true;
      } catch { /* A retry must not resend the Discord message. */ }
    }
    console.error('Achievement delivery status update unavailable');
    return false;
  };
  webhook.searchParams.set('wait', 'true');
  webhook.searchParams.set('thread_id', goal.threadId);
  const payload = buildAchievementMessage(body, discordId, discordName);
  const multipart = new FormData();
  multipart.set('payload_json', JSON.stringify(payload));
  multipart.set('files[0]', new Blob([body.evidence.map((link, index) => `${index + 1}. ${link}`).join('\n')],
    { type: 'text/plain;charset=utf-8' }), 'evidence.txt');
  let response: Response;
  try {
    response = await fetch(webhook, { method: 'POST', body: multipart, signal: AbortSignal.timeout(15_000) });
  } catch {
    await settle('uncertain');
    return json(502, { error: 'Discord не подтвердил доставку. Проверьте ветку у куратора: повторная отправка этого отчёта заблокирована для защиты от дублей.' });
  }
  if (!response.ok) {
    await settle('failed');
    console.error('Discord achievement delivery rejected', response.status);
    return json(502, { error: 'Discord временно не принял отчёт. Попробуйте позже.' });
  }
  let message: { id?: string; channel_id?: string };
  try { message = await response.json(); } catch { message = {}; }
  if (!message.id || !/^\d{17,20}$/.test(message.id) || message.channel_id !== goal.threadId) {
    await settle('uncertain');
    return json(502, { error: 'Не удалось подтвердить доставку в нужную ветку. Обратитесь к куратору перед повторной подачей.' });
  }
  const counted = await settle('sent', message.id);
  return json(counted ? 200 : 202, { ok: true, syncPending: !counted });
}, cors));
