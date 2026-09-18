import { useState, useEffect } from 'react';
import PageTransition from '../components/PageTransition';
import DocumentEditor from '../components/DocumentEditor';
import { allDocs, DocConfig } from '../data/docConfigs';
import { consumeDocOpen } from '../lib/docOpen';

const formCodes = [
  { code: 'КР-01', name: 'Карточка регистрации обращения', desc: 'Фиксация жалобы или сигнала, присвоение входящего номера.', section: 'Приём' },
  { code: 'УВ-01', name: 'Уведомление о принятии обращения', desc: 'Подтверждение заявителю, что материал зарегистрирован и принят.', section: 'Приём' },
  { code: 'УВ-02', name: 'Уведомление о направлении по подведомственности', desc: 'Когда лицо/событие не относится к компетенции УСБ ГИБДД.', section: 'Приём' },
  { code: 'ОТВ-01', name: 'Ответ на жалобу', desc: 'Итог: удовлетворение, частичное удовлетворение или отказ.', section: 'Приём' },
  { code: 'ОТВ-02', name: 'Ответ на запрос о деятельности сотрудника', desc: 'Форма для предусмотренных Уставом ответов на запросы.', section: 'Приём' },
  { code: 'СП-01', name: 'Сопроводительное письмо', desc: 'Передача материалов руководству, МВД, прокуратуре.', section: 'Приём' },
  { code: 'РП-01', name: 'Рапорт о выявлении нарушения', desc: 'Фиксация самостоятельно выявленного события.', section: 'Рапорты' },
  { code: 'РП-02', name: 'Рапорт о начале служебной проверки', desc: 'Принятие материала в работу УСБ.', section: 'Рапорты' },
  { code: 'РП-03', name: 'Рапорт о результатах проверки', desc: 'Доклад руководству по завершённому материалу.', section: 'Рапорты' },
  { code: 'РП-04', name: 'Рапорт о передаче материалов', desc: 'Для сотрудников иных структур / вне компетенции.', section: 'Рапорты' },
  { code: 'СЗ-01', name: 'Служебная записка', desc: 'Краткая внутренняя информация, предложение или вопрос.', section: 'Переписка' },
  { code: 'ЗП-01', name: 'Служебный запрос', desc: 'Истребование сведений у подразделения / организации.', section: 'Переписка' },
  { code: 'ТР-01', name: 'Служебное требование УСБ', desc: 'Обязательное требование в пределах полномочий УСБ.', section: 'Переписка' },
  { code: 'ПРЧ-01', name: 'Служебное поручение / распоряжение', desc: 'Для уполномоченного руководителя.', section: 'Переписка' },
  { code: 'ПРК-01', name: 'Приказ начальника УСБ', desc: 'Управленческая форма; только для руководства.', section: 'Переписка' },
  { code: 'СПР-01', name: 'План служебной проверки', desc: 'Предмет, вопросы, мероприятия, материалы и исполнители.', section: 'Проверка' },
  { code: 'ТР-02', name: 'Требование о предоставлении документов', desc: 'Реализация п. 4.3 Устава ГИБДД.', section: 'Проверка' },
  { code: 'ТР-03', name: 'Требование о письменном объяснении', desc: 'Получение позиции проверяемого сотрудника.', section: 'Проверка' },
  { code: 'ОБ-01', name: 'Письменное объяснение сотрудника', desc: 'Унифицированная форма пояснений.', section: 'Проверка' },
  { code: 'АКТ-01', name: 'Акт об отказе от объяснения', desc: 'Фиксация отказа / уклонения.', section: 'Акты' },
  { code: 'АКТ-02', name: 'Акт неисполнения требования УСБ', desc: 'Фиксация непредоставления документов.', section: 'Акты' },
  { code: 'АКТ-03', name: 'Акт просмотра видеозаписи', desc: 'Фиксация хронологии и наблюдаемых действий.', section: 'Акты' },
  { code: 'АКТ-04', name: 'Акт проверки служебного транспорта', desc: 'Осмотр салона / багажника в рамках полномочий.', section: 'Акты' },
  { code: 'АКТ-05', name: 'Акт проверки документов / личного дела', desc: 'Фиксация документальной проверки.', section: 'Акты' },
  { code: 'АКТ-06', name: 'Акт личного обыска сотрудника', desc: 'Только в пределах п. 5.4.1 Устава.', section: 'Акты' },
  { code: 'АКТ-07', name: 'Акт проверки на состояние опьянения', desc: 'Фиксация проверки, предусмотренной Уставом.', section: 'Акты' },
  { code: 'РД-01', name: 'Реестр доказательств', desc: 'Учёт видео, скриншотов, объяснений и материалов.', section: 'Доказательства' },
  { code: 'ОП-01', name: 'Опись материалов проверки', desc: 'Формирование завершённого дела.', section: 'Доказательства' },
  { code: 'ЗКЛ-01', name: 'Заключение по результатам проверки', desc: 'Факты → доказательства → нормы → вывод.', section: 'Итог' },
  { code: 'СПР-02', name: 'Справка о результатах проверки', desc: 'Краткая версия выводов для руководства.', section: 'Итог' },
  { code: 'ПРД-01', name: 'Представление / рекомендации об устранении нарушений', desc: 'Профилактические и организационные меры.', section: 'Дисциплина' },
  { code: 'ПРД-02', name: 'Представление о применении взыскания', desc: 'Мотивированное предложение уполномоченному лицу.', section: 'Дисциплина' },
  { code: 'УВ-03', name: 'Уведомление о применённом взыскании', desc: 'Ознакомление сотрудника с решением.', section: 'Дисциплина' },
  { code: 'РШ-01', name: 'Решение об аннулировании / снятии взыскания', desc: 'Для уполномоченного руководства.', section: 'Дисциплина' },
  { code: 'РШ-02', name: 'Решение по обжалованию взыскания', desc: 'Ответ УСБ на письменное обжалование.', section: 'Дисциплина' },
  { code: 'ЛО-01', name: 'Лист ознакомления', desc: 'Подпись сотрудника о получении / ознакомлении.', section: 'Дисциплина' },
  { code: 'РШ-03', name: 'Решение о направлении на переаттестацию', desc: 'Только при наличии оснований по Уставу.', section: 'Дисциплина' },
  { code: 'ПЛ-01', name: 'План профилактического мероприятия', desc: 'Проверка знаний, дисциплины, документов.', section: 'Профилактика' },
  { code: 'РП-05', name: 'Отчёт о профилактическом мероприятии', desc: 'Итоги построения / контрольной работы.', section: 'Профилактика' },
  { code: 'СПР-03', name: 'Справка по контрольной проверке подразделения', desc: 'Системные нарушения и рекомендации.', section: 'Профилактика' },
  { code: 'ЖР-01', name: 'Журнал жалоб и обращений', desc: 'Единый входящий учёт.', section: 'Журналы' },
  { code: 'ЖР-02', name: 'Журнал служебных проверок', desc: 'Статусы, исполнители, сроки, результаты.', section: 'Журналы' },
  { code: 'ЖР-03', name: 'Журнал дисциплинарных взысканий', desc: 'Контроль вида, даты, доказательств, обжалований.', section: 'Журналы' },
  { code: 'ЖР-04', name: 'Журнал служебных требований', desc: 'Контроль исполнения требований УСБ.', section: 'Журналы' },
];

const f1Fields = [
  { field: 'Дата и время', desc: 'Точное время начала смены и каждого значимого действия.' },
  { field: 'Исполнитель', desc: 'ФИО, должность, звание сотрудника, ведущего лист.' },
  { field: 'Наставник / руководитель', desc: 'Кто контролирует работу и утверждает результаты этапа.' },
  { field: 'Задача на смену', desc: 'Конкретное поручение от руководителя.' },
  { field: 'Проверка комплекта', desc: 'Документы наряда, работоспособность средств, доступ к системам.' },
];

const f2Fields = [
  { field: 'Вопрос проверки', desc: 'Что именно устанавливается: факт, время, участник, умысел.' },
  { field: 'Действие', desc: 'Конкректное мероприятие: запрос, осмотр, опрос, изъятие.' },
  { field: 'Правовое основание', desc: 'Пункт Устава или иного НПА, разрешающий данное действие.' },
  { field: 'Исполнитель', desc: 'Кто выполняет, в какой срок, кому докладывает.' },
  { field: 'Срок', desc: 'Контрольная дата. Просрочка — основание для продления.' },
  { field: 'Результат', desc: 'Что получено: документ, объяснение, видео, акт.' },
];

const f5Checklist = [
  'Все листы дела пронумерованы и подшиты.',
  'ЗКЛ-01 подписан, датирован, содержит все обязательные разделы.',
  'ПРД-02 согласован (при наличии) и зарегистрирован.',
  'ОП-01 соответствует фактическому составу дела.',
  'СП-01 / РП-04 оформлены для передачи.',
  'ОТВ-01 направлен заявителю в установленный срок.',
  'Все электронные копии сохранены в разрешённом хранилище.',
  'Незавершённые запросы и сроки переданы сменщику под подпись.',
  'Оружие, снаряжение, транспорт проверены и сданы.',
  'Рапорт о завершении смены (РП-03) сдан руководителю.',
];

const sources = [
  { abbr: 'Устав', full: 'Устав ГИБДД России Онлайн', desc: 'Базовый нормативный акт: структура, полномочия, права и обязанности.' },
  { abbr: 'Кодекс этики', full: 'Кодекс профессиональной этики сотрудника ГИБДД', desc: 'Нормы поведения, беспристрастность, конфиденциальность.' },
  { abbr: 'Закон о полиции', full: 'ФЗ «О полиции» (игровая редакция)', desc: 'Общие принципы, применение силы, спецсредств и оружия.' },
  { abbr: 'Закон о госслужбе', full: 'ФЗ «О государственной гражданской службе» (игровая редакция)', desc: 'Поступление, аттестация, ограничения, увольнение.' },
  { abbr: 'УПК', full: 'Уголовно-процессуальный кодекс (игровая редакция)', desc: 'Возбуждение и расследование уголовных дел.' },
  { abbr: 'КоАП', full: 'Кодекс об административных правонарушениях (игровая редакция)', desc: 'Составы, подведомственность, сроки давности.' },
  { abbr: 'УК', full: 'Уголовный кодекс (игровая редакция)', desc: 'Преступления: должностные, против личности, правосудия.' },
  { abbr: 'ПДД', full: 'Правила дорожного движения (игровая редакция)', desc: 'Обязанности водителей, знаки, разметка, сигналы.' },
  { abbr: 'ЗБ РО', full: 'Законодательная база Russia Online', desc: 'Игровые нормы: региональные особенности, инструкции.' },
];

export default function Appendix() {
  const [selectedDoc, setSelectedDoc] = useState<DocConfig | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedDoc) setSelectedDoc(null);
        else if (editorOpen) setEditorOpen(false);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [selectedDoc, editorOpen]);

  const openLatin = (latin: string) => {
    const doc = allDocs.find(d => d.code === latin);
    if (doc) setSelectedDoc(doc);
  };

  const openDoc = (code: string) => {
    const latin = code
      .replace('СПР', 'SPR').replace('ПРЧ', 'PRCH').replace('ПРК', 'PRK').replace('ПРД', 'PRD')
      .replace('ОТВ', 'OTV').replace('АКТ', 'AKT').replace('ЗКЛ', 'ZKL').replace('КР', 'KR')
      .replace('УВ', 'UV').replace('СП', 'SP').replace('РП', 'RP').replace('СЗ', 'SZ')
      .replace('ЗП', 'ZP').replace('ТР', 'TR').replace('ОБ', 'OB').replace('РД', 'RD')
      .replace('ОП', 'OP').replace('РШ', 'RSH').replace('ЛО', 'LO')
      .replace('ПЛ', 'PL').replace('ЖР', 'ZHR');
    openLatin(latin);
  };

  // Open a document requested from the global search (survives page navigation timing)
  useEffect(() => {
    const tryOpen = () => { const c = consumeDocOpen(); if (c) openLatin(c); };
    tryOpen();
    window.addEventListener('doc-open-request', tryOpen);
    return () => window.removeEventListener('doc-open-request', tryOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PageTransition className="wiki-content">
      <div className="glass rounded-2xl p-8 border border-purple-500/10 mb-8">
        <h2 className="!mt-0 !mb-2">📎 Приложения и формы</h2>
        <p className="text-sm text-gray-500">Справочные материалы: альбом форм, рабочие листы, источники курса</p>
      </div>

      {/* V2 редактор */}
      <section className="glass rounded-2xl p-8 border border-cyan-500/20 mb-6 bg-cyan-500/[0.02]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="!mt-0 !mb-1">🚀 Конструктор документов V2</h2>
            <p className="text-sm text-gray-400">Динамический редактор: секции, подписанты, закладки</p>
          </div>
          <button onClick={() => setEditorOpen(true)}
            className="px-5 py-3 rounded-xl bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/30 transition-all font-mono text-sm flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Открыть редактор
          </button>
        </div>
        <p className="text-xs text-gray-500">Добавляйте и удаляйте секции, подписантов, закладки. Скачайте готовый PNG.</p>
      </section>

      {/* Альбом форм */}
      <section className="glass rounded-2xl p-8 border border-purple-500/10 mb-6">
        <h2 className="!mt-0">📋 Альбом служебных документов</h2>
        <p className="mb-2">Полный перечень из <strong>44 форм</strong>, применяемых в работе УСБ. <span className="text-purple-300">Кликните на код — откроется редактируемый бланк.</span></p>
        <p className="text-xs text-gray-500 mb-4">Заполните поля и скачайте готовый PNG с белым фоном.</p>
        <div className="overflow-x-auto">
          <table>
            <thead><tr><th>Код</th><th>Наименование</th><th>Назначение</th><th>Этап</th></tr></thead>
            <tbody>
              {formCodes.map(f => (
                <tr key={f.code}>
                  <td className="font-mono whitespace-nowrap">
                    <button
                      onClick={() => openDoc(f.code)}
                      className="text-cyan-300 hover:text-cyan-100 hover:underline decoration-cyan-400/30 underline-offset-2 font-bold cursor-pointer transition-colors"
                      title={`Открыть ${f.code} — ${f.name}`}
                    >
                      {f.code} ✎
                    </button>
                  </td>
                  <td className="whitespace-nowrap">{f.name}</td>
                  <td className="text-gray-400 text-xs leading-relaxed">{f.desc}</td>
                  <td className="whitespace-nowrap text-xs">
                    <span className="bg-purple-500/10 text-purple-300 px-2 py-0.5 rounded-full">{f.section}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Ф1 */}
      <section className="glass rounded-2xl p-8 border border-purple-500/10 mb-6">
        <h2 className="!mt-0">Ф1 · Старт смены и первый приём</h2>
        <p>Рабочий лист заполняется <strong>в начале каждой смены</strong>.</p>
        <table>
          <thead><tr><th>Поле</th><th>Что указать</th></tr></thead>
          <tbody>
            {f1Fields.map(f => (
              <tr key={f.field}><td className="font-semibold whitespace-nowrap">{f.field}</td><td className="text-gray-400 text-xs">{f.desc}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Ф2 */}
      <section className="glass rounded-2xl p-8 border border-purple-500/10 mb-6">
        <h2 className="!mt-0">Ф2 · План и реестр материалов</h2>
        <table>
          <thead><tr><th>Поле</th><th>Что указать</th></tr></thead>
          <tbody>
            {f2Fields.map(f => (
              <tr key={f.field}><td className="font-semibold whitespace-nowrap">{f.field}</td><td className="text-gray-400 text-xs">{f.desc}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Ф5 */}
      <section className="glass rounded-2xl p-8 border border-purple-500/10 mb-6">
        <h2 className="!mt-0">Ф5 · Финальная проверка и передача смены</h2>
        <p>Чек-лист <strong>перед уходом со смены</strong>:</p>
        <ul>{f5Checklist.map((item, i) => (<li key={i}>{item}</li>))}</ul>
      </section>

      {/* Негласная работа */}
      <section className="glass rounded-2xl p-8 border border-purple-500/10 mb-6">
        <h2 className="!mt-0">🕵️ Негласная работа: границы</h2>
        <ul>
          <li>Негласная работа требует отдельного разрешения руководства</li>
          <li>Не может нарушать права граждан и сотрудников</li>
          <li>Результаты фиксируются отдельно от открытых материалов</li>
          <li>При рассекречивании — отдельный акт с основанием</li>
        </ul>
        <blockquote>Нахождение в УСБ само по себе не означает работу под прикрытием.</blockquote>
      </section>

      {/* Источники */}
      <section className="glass rounded-2xl p-8 border border-purple-500/10 mb-6">
        <h2 className="!mt-0">📜 Источники курса</h2>
        <table>
          <thead><tr><th>Аббр.</th><th>Полное название</th><th>Содержание</th></tr></thead>
          <tbody>
            {sources.map(s => (
              <tr key={s.abbr}><td className="font-mono font-bold whitespace-nowrap">{s.abbr}</td><td className="whitespace-nowrap">{s.full}</td><td className="text-gray-400 text-xs">{s.desc}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="glass rounded-2xl p-8 border border-purple-500/10 mb-6">
        <h2 className="!mt-0">📌 Важные напоминания</h2>
        <div className="highlight-box"><ul>
          <li>ГИБДД и МВД на проекте — разные фракции. УСБ ГИБДД не получает власти над МВД.</li>
          <li>Курс не является описанием реальных ведомственных инструкций.</li>
          <li>Строгость, нейтральность, документирование и контроль сроков — служебный стиль.</li>
        </ul></div>
      </section>

      {selectedDoc && <DocumentEditor doc={selectedDoc} onClose={() => setSelectedDoc(null)} />}
      {editorOpen && <DocumentEditor doc={null} onClose={() => setEditorOpen(false)} />}
    </PageTransition>
  );
}