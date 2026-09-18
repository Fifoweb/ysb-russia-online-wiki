// Telegram bot for USB GIBDD Wiki
// Uses polling to receive messages and respond with document info

// SECURITY: token comes from the environment, never from source code.
// Run: $env:TELEGRAM_BOT_TOKEN="..." ; npm run bot
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  console.error('[TG] TELEGRAM_BOT_TOKEN is not set. Set it and restart the bot.');
  process.exit(1);
}
const API = `https://api.telegram.org/bot${TOKEN}`;

// SECURITY: escape user-controlled text before embedding it into HTML messages
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// SECURITY: simple per-chat cooldown against command flooding / spam bots
const COOLDOWN_MS = 1500;
const lastCmdAt = new Map<number, number>();
function isFlooding(chatId: number): boolean {
  const now = Date.now();
  const last = lastCmdAt.get(chatId) || 0;
  if (now - last < COOLDOWN_MS) return true;
  lastCmdAt.set(chatId, now);
  return false;
}

interface DocInfo {
  code: string;
  title: string;
  section: string;
}

// Known documents
const docs: DocInfo[] = [
  { code: 'КР-01', title: 'Карточка регистрации обращения', section: 'Приём' },
  { code: 'УВ-01', title: 'Уведомление о принятии обращения', section: 'Приём' },
  { code: 'УВ-02', title: 'Уведомление о направлении', section: 'Приём' },
  { code: 'ОТВ-01', title: 'Ответ на жалобу', section: 'Приём' },
  { code: 'ОТВ-02', title: 'Ответ на запрос', section: 'Приём' },
  { code: 'СП-01', title: 'Сопроводительное письмо', section: 'Приём' },
  { code: 'РП-01', title: 'Рапорт о выявлении нарушения', section: 'Рапорты' },
  { code: 'РП-02', title: 'Рапорт о начале проверки', section: 'Рапорты' },
  { code: 'РП-03', title: 'Рапорт о результатах проверки', section: 'Рапорты' },
  { code: 'РП-04', title: 'Рапорт о передаче материалов', section: 'Рапорты' },
  { code: 'СЗ-01', title: 'Служебная записка', section: 'Переписка' },
  { code: 'ЗП-01', title: 'Служебный запрос', section: 'Переписка' },
  { code: 'ТР-01', title: 'Служебное требование УСБ', section: 'Переписка' },
  { code: 'ПРЧ-01', title: 'Служебное поручение', section: 'Переписка' },
  { code: 'ПРК-01', title: 'Приказ начальника УСБ', section: 'Переписка' },
  { code: 'СПР-01', title: 'План служебной проверки', section: 'Проверка' },
  { code: 'ТР-02', title: 'Требование о предоставлении документов', section: 'Проверка' },
  { code: 'ТР-03', title: 'Требование о письменном объяснении', section: 'Проверка' },
  { code: 'ОБ-01', title: 'Письменное объяснение', section: 'Проверка' },
  { code: 'АКТ-01', title: 'Акт об отказе от объяснения', section: 'Акты' },
  { code: 'АКТ-02', title: 'Акт неисполнения требования', section: 'Акты' },
  { code: 'АКТ-03', title: 'Акт просмотра видеозаписи', section: 'Акты' },
  { code: 'АКТ-04', title: 'Акт проверки транспорта', section: 'Акты' },
  { code: 'АКТ-05', title: 'Акт проверки документов', section: 'Акты' },
  { code: 'АКТ-06', title: 'Акт личного обыска', section: 'Акты' },
  { code: 'АКТ-07', title: 'Акт проверки на опьянение', section: 'Акты' },
  { code: 'РД-01', title: 'Реестр доказательств', section: 'Доказательства' },
  { code: 'ОП-01', title: 'Опись материалов', section: 'Доказательства' },
  { code: 'ЗКЛ-01', title: 'Заключение проверки', section: 'Итог' },
  { code: 'СПР-02', title: 'Справка о результатах', section: 'Итог' },
  { code: 'ПРД-01', title: 'Представление об устранении нарушений', section: 'Дисциплина' },
  { code: 'ПРД-02', title: 'Представление о взыскании', section: 'Дисциплина' },
  { code: 'УВ-03', title: 'Уведомление о взыскании', section: 'Дисциплина' },
  { code: 'РШ-01', title: 'Решение об аннулировании взыскания', section: 'Дисциплина' },
  { code: 'РШ-02', title: 'Решение по обжалованию', section: 'Дисциплина' },
  { code: 'ЛО-01', title: 'Лист ознакомления', section: 'Дисциплина' },
  { code: 'РШ-03', title: 'Решение о переаттестации', section: 'Дисциплина' },
  { code: 'ПЛ-01', title: 'План профилактического мероприятия', section: 'Профилактика' },
  { code: 'РП-05', title: 'Отчёт о мероприятии', section: 'Профилактика' },
  { code: 'СПР-03', title: 'Справка по проверке подразделения', section: 'Профилактика' },
  { code: 'ЖР-01', title: 'Журнал жалоб и обращений', section: 'Журналы' },
  { code: 'ЖР-02', title: 'Журнал служебных проверок', section: 'Журналы' },
  { code: 'ЖР-03', title: 'Журнал дисциплинарных взысканий', section: 'Журналы' },
  { code: 'ЖР-04', title: 'Журнал служебных требований', section: 'Журналы' },
];

let lastUpdateId = 0;

async function sendMessage(chatId: number, text: string) {
  await fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

async function handleCommand(chatId: number, text: string) {
  const cmd = text.trim().toLowerCase();
  
  if (cmd === '/start') {
    await sendMessage(chatId, '🛡️ <b>УСБ ГИБДД Wiki Bot</b>\n\n' +
      'Команды:\n' +
      '/doc КР-01 — информация о документе\n' +
      '/list — список всех документов\n' +
      '/search запрос — поиск по документам\n' +
      '/help — помощь');
    return;
  }

  if (cmd === '/list') {
    const groups: Record<string, string[]> = {};
    docs.forEach(d => {
      if (!groups[d.section]) groups[d.section] = [];
      groups[d.section].push(`<code>${d.code}</code> — ${d.title}`);
    });
    let out = '<b>📋 Все документы УСБ ГИБДД:</b>\n\n';
    for (const [section, items] of Object.entries(groups)) {
      out += `<b>${section}</b>\n${items.join('\n')}\n\n`;
    }
    if (out.length > 4000) out = out.slice(0, 4000) + '...\n\nПолный список на сайте';
    await sendMessage(chatId, out);
    return;
  }

  if (cmd.startsWith('/doc ')) {
    const code = cmd.slice(5).trim().toUpperCase();
    // SECURITY: strict format check — prevents injection of arbitrary markup/content
    if (!/^[А-ЯЁ0-9-]{1,12}$/.test(code)) {
      await sendMessage(chatId, '❌ Неверный формат кода. Пример: /doc КР-01');
      return;
    }
    const doc = docs.find(d => d.code === code);
    if (doc) {
      await sendMessage(chatId, `<b>${doc.code}</b> — ${doc.title}\n📂 Раздел: ${doc.section}\n\n🔗 Открыть на сайте: http://localhost:5173/appendix`);
    } else {
      await sendMessage(chatId, `❌ Документ "${esc(code)}" не найден. Используйте /list для просмотра всех кодов.`);
    }
    return;
  }

  if (cmd.startsWith('/search ')) {
    const q = cmd.slice(8).toLowerCase().trim();
    // SECURITY: limit query length, escape before echoing into HTML message
    if (q.length > 60) {
      await sendMessage(chatId, '❌ Слишком длинный запрос (макс. 60 символов).');
      return;
    }
    const found = docs.filter(d =>
      d.code.toLowerCase().includes(q) ||
      d.title.toLowerCase().includes(q) ||
      d.section.toLowerCase().includes(q)
    ).slice(0, 10);
    if (found.length > 0) {
      await sendMessage(chatId, `<b>🔍 Результаты поиска "${esc(q)}":</b>\n\n` +
        found.map(d => `<code>${d.code}</code> — ${d.title} (${d.section})`).join('\n'));
    } else {
      await sendMessage(chatId, `❌ Ничего не найдено по запросу "${esc(q)}".`);
    }
    return;
  }

  if (cmd === '/help') {
    await sendMessage(chatId, '🛡️ <b>УСБ ГИБДД Wiki Bot</b>\n\n' +
      'Доступные команды:\n' +
      '/start — приветствие\n' +
      '/doc [КОД] — информация о документе\n' +
      '/list — все документы\n' +
      '/search [запрос] — поиск\n' +
      '/help — эта справка');
    return;
  }

  // Unknown command or message — show help
  await sendMessage(chatId, 'Неизвестная команда. Используйте /help для списка команд.');
}

async function poll() {
  try {
    const res = await fetch(`${API}/getUpdates?offset=${lastUpdateId + 1}&timeout=10`);
    const data = await res.json() as { ok: boolean; result: Array<{ update_id: number; message?: { chat: { id: number }; text?: string } }> };
    if (!data.ok) return;
    for (const upd of data.result) {
      lastUpdateId = upd.update_id;
      const msg = upd.message;
      if (msg?.text) {
        if (isFlooding(msg.chat.id)) continue; // silently drop flood
        console.log(`[TG] ${msg.chat.id}: ${msg.text}`);
        await handleCommand(msg.chat.id, msg.text);
      }
    }
  } catch (e) {
    console.error('[TG] Poll error:', e);
  }
}

console.log('[TG] Bot started. Polling...');
setInterval(poll, 2000);
poll();

export {};