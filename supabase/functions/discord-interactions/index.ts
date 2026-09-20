// Edge Function: обработчик кнопок Discord (Interactions Endpoint).
// Discord шлёт сюда нажатия «Одобрить»/«Отклонить» и отправку модалки с причиной.
// JWT тут НЕТ — запросы идут от Discord; подлинность проверяем подписью Ed25519.
import nacl from 'https://esm.sh/tweetnacl@1.0.3';

const PUB_KEY = Deno.env.get('DISCORD_PUBLIC_KEY') || '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-signature-ed25519, x-signature-timestamp',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  // 1. Проверка подписи Discord — чужой запрос не пройдёт
  const rawBody = await req.text();
  const sig = req.headers.get('X-Signature-Ed25519') || '';
  const ts = req.headers.get('X-Signature-Timestamp') || '';
  let valid = false;
  try {
    valid = nacl.sign.detached.verify(
      new TextEncoder().encode(ts + rawBody),
      hexToBytes(sig),
      hexToBytes(PUB_KEY),
    );
  } catch { valid = false; }
  if (!valid) return json(401, { error: 'bad signature' });

  const interaction = JSON.parse(rawBody);

  // 2. PING → PONG (Discord проверяет эндпоинт при сохранении URL в портале)
  if (interaction.type === 1) return json(200, { type: 1 });

  // Ник на СЕРВЕРЕ (не глобальный ник Discord) — для плашек
  const who = interaction.member?.nick || interaction.member?.user?.username || 'модератор';
  // Тег модератора — для полей «Одобрил»/«Отклонил»
  const whoTag = interaction.member?.user?.id ? `<@${interaction.member.user.id}>` : who;

  // 3. Клик по кнопке
  if (interaction.type === 3) {
    const customId = interaction.data?.custom_id;
    const embed = interaction.message?.embeds?.[0] || {};

    if (customId === 'approve') {
      const approved = {
        ...embed,
        title: 'Заявление одобрено',
        color: 3066993,
        fields: [...(embed.fields || []), { name: 'Одобрил', value: whoTag, inline: true }],
      };

      // ── Кадровый аудит: автоматический пост в канал кадрового аудита ──
      const botToken = Deno.env.get('DISCORD_BOT_TOKEN');
      const AUDIT_CHANNEL = '1477623590093328568';
      const whoId = interaction.member?.user?.id;
      // Кого повышают — берём из тега в исходном сообщении заявления
      const promotedId =
        (interaction.message?.content?.match(/<@(\d+)>/) || [])[1] ||
        ((embed.fields || []).find((f: { name?: string }) => f.name === 'Отправил')?.value || '').match(/<@(\d+)>/)?.[1];
      const fieldVal = (n: string) => ((embed.fields || []).find((f: { name?: string }) => f.name === n)?.value) || '';
      const currentRank = fieldVal('Текущее звание');
      const targetRank = fieldVal('Подаётся на звание');

      if (botToken && promotedId && whoId) {
        try {
          // Серверный ник повышенного (Имя Фамилия) — через API бота
          let promotedNick = '';
          const gm = await fetch(`https://discord.com/api/v10/guilds/${interaction.guild_id}/members/${promotedId}`, {
            headers: { Authorization: `Bot ${botToken}` },
          });
          if (gm.ok) { const gj = await gm.json(); promotedNick = gj.nick || gj.user?.username || ''; }

          const msgLink = `https://discord.com/channels/${interaction.guild_id}/${interaction.channel_id}/${interaction.message.id}`;
          const date = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');

          // Кадровый аудит как карточка-embed (как на образце): заголовок + поля
          const auditEmbed = {
            title: '📖 Отчет о повышении сотрудника',
            fields: [
              { name: 'Причина повышения', value: `${msgLink}\nПовышен'а с ранга ${currentRank} на ${targetRank} ранг` },
              { name: "Повышен'а", value: `<@${promotedId}>` },
              { name: 'Имя Фамилия', value: promotedNick || '—' },
              { name: 'Discord ID', value: String(promotedId) },
              { name: 'Повышает', value: `<@${whoId}>` },
              { name: 'Имя Фамилия', value: who },
              { name: 'Discord ID', value: String(whoId) },
            ],
            footer: { text: `Дата: ${date}` },
            timestamp: new Date().toISOString(),
          };

          const auditRes = await fetch(`https://discord.com/api/v10/channels/${AUDIT_CHANNEL}/messages`, {
            method: 'POST',
            headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: `<@${whoId}> повышает <@${promotedId}>`,
              embeds: [auditEmbed],
            }),
          });
          if (!auditRes.ok) console.error('Audit post failed', auditRes.status, await auditRes.text());
        } catch (e) { console.error('Audit error', e); }
      }

      // content не передаём — остаётся исходный текст с тегом автора заявления;
      // на месте кнопок — серая плашка «Одобрено» (как и у отказа)
      return json(200, {
        type: 7,
        data: {
          embeds: [approved],
          components: [{
            type: 1,
            components: [{ type: 2, style: 2, label: `Одобрено: ${who}`, custom_id: 'approved_done', disabled: true }],
          }],
        },
      });
    }

    if (customId === 'reject') {
      // Модалка с обязательным полем причины
      return json(200, {
        type: 9,
        data: {
          title: 'Причина отказа',
          custom_id: 'reject-modal',
          components: [{
            type: 1,
            components: [{
              type: 4,
              custom_id: 'reason',
              label: 'Причина отказа',
              style: 2, // многострочное поле
              required: true,
              placeholder: 'Например: недостаточно баллов, не хватает доказательств...',
              max_length: 500,
            }],
          }],
        },
      });
    }
  }

  // 4. Отправлена модалка с причиной
  if (interaction.type === 5 && interaction.data?.custom_id === 'reject-modal') {
    const reason = interaction.data.components?.[0]?.components?.[0]?.value || 'Без причины';
    const embed = interaction.message?.embeds?.[0] || {};
    const rejected = {
      ...embed,
      title: 'Заявление отклонено',
      color: 12597547, // приглушённый тёмно-красный (#c0392b)
      fields: [
        ...(embed.fields || []),
        { name: 'Отклонил', value: whoTag, inline: true },
      ],
    };
    // На месте кнопок — серая неактивная плашка «Отклонено: причина» (кнопки в Discord живут только внизу)
    const reasonBtn = reason.length > 60 ? reason.slice(0, 60) + '…' : reason;
    return json(200, {
      type: 7,
      data: {
        embeds: [rejected],
        components: [{
          type: 1,
          components: [{
            type: 2,
            style: 2, // серая
            label: `❌ Отклонено: ${reasonBtn}`,
            custom_id: 'rejected_reason',
            disabled: true,
          }],
        }],
      },
    });
  }

  return json(400, { error: 'unknown interaction' });
});
