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
  const nowStr = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');

  // 3. Клик по кнопке
  if (interaction.type === 3) {
    const customId = interaction.data?.custom_id;
    const embed = interaction.message?.embeds?.[0] || {};

    if (customId === 'approve') {
      // Компактная карточка по ТЗ: блоки по смыслу, 2×2 inline-поля
      const f = (n: string) => ((embed.fields || []).find((x: { name?: string }) => x.name === n)?.value) || '—';
      const dateStr = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');
      const approved = {
        title: '✅ Заявление одобрено',
        color: 3066993, // зелёный
        fields: [
          { name: '👤 Заявитель', value: f('👤 Заявитель') },
          { name: 'Ник / статик', value: f('Ник / статик'), inline: true },
          { name: 'Текущее звание', value: f('Текущее звание'), inline: true },
          { name: 'Новое звание', value: f('Новое звание'), inline: true },
          { name: 'Набрано баллов', value: f('Набрано баллов'), inline: true },
          { name: '📎 Доказательства', value: f('📎 Доказательства') },
          { name: '✅ Одобрил', value: whoTag },
        ],
        footer: { text: `Начальник ГИБДД • ${dateStr}` },
        timestamp: new Date().toISOString(),
      };

      const whoId = interaction.member?.user?.id;

      // После одобрения модератор выбирает, куда направить карточку.
      // ID одобрившего зашит в custom_id, чтобы другой пользователь не мог выбрать канал.
      return json(200, {
        type: 7,
        data: {
          embeds: [approved],
          components: [
            {
              type: 1,
              components: [{ type: 2, style: 2, label: `Одобрено: ${who}`, custom_id: 'approved_done', disabled: true }],
            },
            {
              type: 1,
              components: [
                { type: 2, style: 1, label: 'Отправить в кадровый аудит', custom_id: `route-audit:${whoId}` },
                { type: 2, style: 1, label: 'Отправить в запросы на повышение', custom_id: `route-promotion:${whoId}` },
              ],
            },
          ],
        },
      });
    }

    if (customId?.startsWith('route-audit:') || customId?.startsWith('route-promotion:')) {
      const [route, approverId] = customId.split(':');
      const clickerId = interaction.member?.user?.id;
      if (!clickerId || clickerId !== approverId) {
        return json(200, {
          type: 4,
          data: { content: 'Выбрать канал может только сотрудник, который одобрил заявление.', flags: 64 },
        });
      }

      const botToken = Deno.env.get('DISCORD_BOT_TOKEN');
      const auditChannel = '1477623590093328568';
      const promotionChannel = Deno.env.get('DISCORD_PROMOTION_REQUESTS_CHANNEL_ID') || '';
      const targetChannel = route === 'route-audit' ? auditChannel : promotionChannel;
      if (!botToken || !targetChannel) {
        return json(200, { type: 4, data: { content: 'Канал назначения не настроен.', flags: 64 } });
      }

      const promotedId =
        (interaction.message?.content?.match(/<@(\d+)>/) || [])[1] ||
        ((embed.fields || []).find((x: { name?: string }) => x.name === '👤 Заявитель')?.value || '').match(/<@(\d+)>/)?.[1];
      if (!promotedId) {
        return json(200, { type: 4, data: { content: 'Не удалось определить автора заявления.', flags: 64 } });
      }

      let destinationEmbed = {
        title: embed.title,
        description: embed.description,
        color: embed.color,
        fields: embed.fields,
        footer: embed.footer,
        timestamp: embed.timestamp,
      };
      let destinationContent = `<@${promotedId}>`;

      if (route === 'route-audit') {
        let promotedNick = '';
        try {
          const memberRes = await fetch(`https://discord.com/api/v10/guilds/${interaction.guild_id}/members/${promotedId}`, {
            headers: { Authorization: `Bot ${botToken}` },
          });
          if (memberRes.ok) {
            const member = await memberRes.json();
            promotedNick = member.nick || member.user?.username || '';
          }
        } catch (error) {
          console.error('Member lookup failed', error);
        }

        const fieldVal = (name: string) =>
          ((embed.fields || []).find((x: { name?: string }) => x.name === name)?.value) || '—';
        const tick = String.fromCharCode(96);
        destinationEmbed = {
          title: '📕 Отчет о повышении сотрудника',
          description: `> Причина повышения: <#${interaction.channel_id}>\n> Повышен'а с ранга ${tick}${fieldVal('Текущее звание')}${tick} на ${tick}${fieldVal('Новое звание')}${tick} ранг`,
          fields: [
            { name: "Повышен'а :", value: `<@${promotedId}>`, inline: true },
            { name: 'Имя Фамилия :', value: promotedNick || '—', inline: true },
            { name: 'Discord ID :', value: String(promotedId), inline: true },
            { name: 'Повышает :', value: `<@${clickerId}>`, inline: true },
            { name: 'Имя Фамилия :', value: who, inline: true },
            { name: 'Discord ID :', value: String(clickerId), inline: true },
          ],
          footer: { text: `Дата: ${nowStr}` },
          timestamp: new Date().toISOString(),
        };
        destinationContent = `<@${clickerId}> повышает <@${promotedId}>`;
      }

      try {
        const postRes = await fetch(`https://discord.com/api/v10/channels/${targetChannel}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: destinationContent,
            embeds: [destinationEmbed],
            allowed_mentions: { parse: [], users: [clickerId, promotedId] },
          }),
        });
        if (!postRes.ok) {
          console.error('Promotion routing failed', postRes.status, await postRes.text());
          return json(200, { type: 4, data: { content: 'Не удалось отправить карточку в выбранный канал.', flags: 64 } });
        }
      } catch (error) {
        console.error('Promotion routing error', error);
        return json(200, { type: 4, data: { content: 'Не удалось отправить карточку в выбранный канал.', flags: 64 } });
      }

      const destinationLabel = route === 'route-audit' ? 'Кадровый аудит' : 'Запросы на повышение';
      return json(200, {
        type: 7,
        data: {
          components: [{
            type: 1,
            components: [
              { type: 2, style: 2, label: `Одобрено: ${who}`, custom_id: 'approved_done', disabled: true },
              { type: 2, style: 2, label: `Отправлено: ${destinationLabel}`, custom_id: 'routed_done', disabled: true },
            ],
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

    // ══ ВОССТАНОВЛЕНИЕ СОТРУДНИКА ══

    if (customId === 'restore-accept') {
      // Сначала — выбор ранга через Select Menu (нельзя принять без выбора)
      return json(200, {
        type: 7,
        data: {
          components: [{
            type: 1,
            components: [{
              type: 3, // select menu
              custom_id: 'restore-rank',
              placeholder: 'На какой ранг восстановить сотрудника?',
              min_values: 1,
              max_values: 1,
              options: Array.from({ length: 15 }, (_, i) => ({ label: `${i + 1} ранг`, value: String(i + 1) })),
            }],
          }],
        },
      });
    }

    if (customId === 'restore-rank') {
      const rank = interaction.data?.values?.[0];
      if (!rank) return json(400, { error: 'no rank' });
      const embed = interaction.message?.embeds?.[0] || {};
      // Заявитель — из тега в тексте исходного сообщения
      const applicantTag = (interaction.message?.content?.match(/<@(\d+)>/) || [])[0] || '—';
      const approved = {
        title: '✅ Восстановление одобрено',
        color: 3066993, // зелёный
        fields: [
          { name: 'Сотрудник', value: applicantTag },
          { name: 'Восстановлен на ранг', value: `${rank} ранг` },
          { name: 'Принял', value: whoTag },
        ],
        footer: { text: `Дата: ${nowStr}` },
        timestamp: new Date().toISOString(),
      };
      // Кнопки убраны — повторная обработка невозможна
      return json(200, { type: 7, data: { embeds: [approved], components: [] } });
    }

    if (customId === 'restore-reject') {
      // Та же механика отказа, что и в повышении — модалка с обязательной причиной
      return json(200, {
        type: 9,
        data: {
          title: 'Причина отказа',
          custom_id: 'restore-reject-modal',
          components: [{
            type: 1,
            components: [{
              type: 4,
              custom_id: 'reason',
              label: 'Причина отказа',
              style: 2,
              required: true,
              placeholder: 'Например: недостаточно доказательств, срок ещё не вышел...',
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

  // Отправлена модалка отказа по восстановлению
  if (interaction.type === 5 && interaction.data?.custom_id === 'restore-reject-modal') {
    const reason = interaction.data.components?.[0]?.components?.[0]?.value || 'Без причины';
    const embed = interaction.message?.embeds?.[0] || {};
    const rejected = {
      ...embed, // исходные данные заявки сохраняются
      title: 'В восстановлении отказано',
      color: 12597547, // приглушённый тёмно-красный
      fields: [
        ...(embed.fields || []),
        { name: 'Причина отказа', value: reason },
        { name: 'Отказал', value: whoTag, inline: true },
      ],
      footer: { text: `Дата: ${nowStr}` },
      timestamp: new Date().toISOString(),
    };
    // И на месте кнопок — серая плашка (как в системе повышений)
    const reasonBtn = reason.length > 60 ? reason.slice(0, 60) + '…' : reason;
    return json(200, {
      type: 7,
      data: {
        embeds: [rejected],
        components: [{
          type: 1,
          components: [{
            type: 2,
            style: 2,
            label: `❌ Отказано: ${reasonBtn}`,
            custom_id: 'restore_rejected_reason',
            disabled: true,
          }],
        }],
      },
    });
  }

  return json(400, { error: 'unknown interaction' });
});
