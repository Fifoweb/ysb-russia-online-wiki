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

  // Имя модератора простым текстом — без тега (чтобы никого не дёргать)
  const who = interaction.member?.user?.username || 'модератор';

  // 3. Клик по кнопке
  if (interaction.type === 3) {
    const customId = interaction.data?.custom_id;
    const embed = interaction.message?.embeds?.[0] || {};

    if (customId === 'approve') {
      const approved = {
        ...embed,
        title: '✅ Заявление одобрено',
        color: 3066993, // зелёный
        fields: [...(embed.fields || []), { name: 'Одобрил', value: who, inline: true }],
      };
      // content не передаём — остаётся исходный текст с тегом автора заявления
      return json(200, {
        type: 7, // обновляем исходное сообщение; components: [] — кнопки исчезают
        data: { embeds: [approved], components: [] },
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
      title: '❌ Заявление отклонено',
      color: 15158332, // красный
      fields: [
        ...(embed.fields || []),
        { name: 'Отклонил', value: who, inline: true },
      ],
    };
    // На месте кнопок — серая неактивная плашка с причиной (кнопки в Discord живут только внизу)
    const reasonBtn = reason.length > 70 ? reason.slice(0, 70) + '…' : reason;
    return json(200, {
      type: 7,
      data: {
        embeds: [rejected],
        components: [{
          type: 1,
          components: [{
            type: 2,
            style: 2, // серая
            label: `❌ Причина: ${reasonBtn}`,
            custom_id: 'rejected_reason',
            disabled: true,
          }],
        }],
      },
    });
  }

  return json(400, { error: 'unknown interaction' });
});
