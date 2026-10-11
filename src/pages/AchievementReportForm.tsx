import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, ExternalLink, Link2, Send, ShieldCheck, Trophy } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import FormLoader from '../components/FormLoader';
import ApplicationCooldownBanner from '../components/ApplicationCooldownBanner';
import ApplicationSubmitHint from '../components/ApplicationSubmitHint';
import { useAuth } from '../lib/auth';
import { invokeApplication, useApplicationCooldown } from '../lib/applicationCooldown';
import { getFunctionErrorMessage } from '../lib/functionError';
import { achievementDepartments, achievementGoals, achievementPublicationRules, achievementWeekStart,
  moscowDate, parseAchievementEvidence, validateAchievementSubmission } from '../data/achievements';

const inputClass = 'mt-2 w-full px-4 py-3 text-sm outline-none';
const blankForm = () => ({ fullName: '', staticId: '', department: '', achievementId: '', quantity: '',
  workDate: moscowDate(), workTime: '', evidenceText: '', rulesAccepted: false });

export default function AchievementReportForm({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { user, loading, enabled, signInWithDiscord } = useAuth();
  const [form, setForm] = useState(blankForm);
  const [state, setState] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  const [error, setError] = useState('');
  const [syncPending, setSyncPending] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const requestId = useRef<string | null>(null);
  const remainingSeconds = useApplicationCooldown(user?.id);
  const goal = achievementGoals.find(item => item.id === form.achievementId);
  const evidence = useMemo(() => parseAchievementEvidence(form.evidenceText), [form.evidenceText]);
  const discordId = user?.identities?.find(item => item.provider === 'discord')?.identity_data?.sub;
  const payload = { fullName: form.fullName, staticId: form.staticId, department: form.department,
    achievementId: form.achievementId, quantity: Number(form.quantity), workDate: form.workDate,
    workTime: form.workTime, evidence: evidence.links, rulesAccepted: form.rulesAccepted };
  const incompleteReason = !form.quantity ? 'Укажите количество выполненного.' : evidence.error || validateAchievementSubmission({
    ...payload, requestId: '00000000-0000-4000-8000-000000000001',
  }, now).error;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 10_000);
    return () => window.clearInterval(timer);
  }, []);
  const update = <K extends keyof typeof form>(key: K, value: typeof form[K]) => {
    setForm(current => ({ ...current, [key]: value,
      ...(key === 'achievementId' ? { quantity: value === 'warehouse' ? '1' : '' } : {}) }));
    requestId.current = null;
    if (state === 'error') { setState('idle'); setError(''); }
  };
  const signIn = async () => {
    try { sessionStorage.setItem('achievement-report-return', String(Date.now())); } catch { /* Direct link still works. */ }
    await signInWithDiscord();
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || state === 'sending' || remainingSeconds > 0 || incompleteReason) return;
    requestId.current ??= crypto.randomUUID();
    const checked = validateAchievementSubmission({ ...payload, requestId: requestId.current });
    if (checked.error || !checked.value) { setError(checked.error || 'Проверьте данные.'); setState('error'); return; }
    setState('sending'); setError('');
    try {
      const result = await invokeApplication('submit-achievement-report', { body: { ...checked.value } }, user.id);
      if (result.error) {
        setError(await getFunctionErrorMessage(result.error, 'Не удалось отправить отчёт. Попробуйте позже.'));
        setState('error'); return;
      }
      setSyncPending(result.data?.syncPending === true);
      setState('ok');
    } catch { setError('Сервис временно недоступен. Попробуйте позже.'); setState('error'); }
  };

  return <PageTransition className="wiki-content application-panel achievement-report">
    <div className="glass rounded-2xl mb-6 application-heading">
      <span className="application-heading-icon" aria-hidden="true"><Trophy size={26} /></span>
      <div><p className="eyebrow">ГИБДД · АЧИВКИ ФРАКЦИИ</p><h2 className="!mt-0 !mb-2">Отчёт о выполнении ачивки</h2><p className="!m-0 text-sm text-slate-300">Укажите свой вклад и приложите доказательства. Отчёт попадёт в нужную ветку Discord.</p></div>
    </div>
    {user && <ApplicationCooldownBanner seconds={remainingSeconds} />}
    {loading ? <FormLoader /> : !user ? <section className="glass rounded-2xl border border-sky-300/20 text-center">
      <ShieldCheck size={32} className="mx-auto mb-4 text-sky-300" aria-hidden="true" />
      <p className="text-slate-200 text-sm mb-5">{enabled ? 'Для подачи отчёта войдите через Discord.' : 'Сервис авторизации временно недоступен.'}</p>
      {enabled && <button type="button" onClick={() => void signIn()} className="primary-button mx-auto">Войти через Discord <ArrowRight size={16} /></button>}
    </section> : state === 'ok' ? <section className="glass rounded-2xl border border-emerald-400/25 text-center" role="status">
      <CheckCircle2 size={34} className="mx-auto mb-4 text-emerald-300" aria-hidden="true" />
      <h3 className="text-emerald-200">Отчёт отправлен в Discord</h3>
      <p>{syncPending ? 'Доставка подтверждена, но обновление счётчика требует проверки у администратора. Не отправляйте этот отчёт повторно.' : 'Ваш вклад учтён на дашборде. Публичные счётчики обновляются в течение минуты.'}</p>
      <div className="flex flex-wrap justify-center gap-3"><button type="button" className="primary-button" onClick={() => onNavigate('/achievements')}>Открыть дашборд <ArrowRight size={16} /></button>
        <button type="button" className="secondary-button" onClick={() => { setForm(blankForm()); requestId.current = null; setState('idle'); setError(''); }}>Новый отчёт</button></div>
    </section> : <section className="glass rounded-2xl border border-sky-300/15">
      <form onSubmit={submit} className="space-y-6">
        <div><p className="eyebrow mb-2">01 · ДАННЫЕ СОТРУДНИКА</p><div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <label htmlFor="achievement-name"><span>Имя и фамилия <span className="text-rose-300">*</span></span><input id="achievement-name" required maxLength={100} value={form.fullName} onChange={event => update('fullName', event.target.value)} placeholder="Иван Иванов" className={inputClass} /></label>
          <label htmlFor="achievement-static"><span>StaticID <span className="text-rose-300">*</span></span><input id="achievement-static" required maxLength={10} inputMode="numeric" pattern="[0-9]{1,10}" value={form.staticId} onChange={event => update('staticId', event.target.value)} placeholder="75463" className={inputClass} /></label>
        </div><label htmlFor="achievement-department" className="block mt-5"><span>Ваш отдел <span className="text-rose-300">*</span></span><select id="achievement-department" required value={form.department} onChange={event => update('department', event.target.value)} className={inputClass}><option value="">Выберите отдел</option>{achievementDepartments.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label></div>

        <div className="border-t border-sky-300/15 pt-6"><p className="eyebrow mb-2">02 · ВЫПОЛНЕННАЯ РАБОТА</p>
          <label htmlFor="achievement-goal" className="block"><span>Ачивка <span className="text-rose-300">*</span></span><select id="achievement-goal" required value={form.achievementId} onChange={event => update('achievementId', event.target.value)} className={inputClass}><option value="">Выберите ачивку</option>{achievementGoals.map(item => <option key={item.id} value={item.id}>{item.description}</option>)}</select></label>
          {goal && <div className="achievement-form-context"><span aria-hidden="true">{goal.emoji}</span><p>{goal.metric === 'average' ? 'Укажите один замер онлайна. Дашборд рассчитает среднее всех замеров недели; повтор в ту же минуту не учитывается.' : goal.metric === 'distinct-days' ? 'Один отчёт — одна проверка склада. Для цели нужны три разных дня; повтор за тот же день не учитывается.' : 'Укажите только работу из этого отчёта. Она прибавится к общему прогрессу недели.'}</p></div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-5"><label htmlFor="achievement-quantity" className="sm:col-span-2"><span>{goal?.quantityLabel || 'Количество выполненного'} <span className="text-rose-300">*</span></span><input id="achievement-quantity" type="number" required min={goal?.metric === 'average' ? 0 : 1} max={99999} step={1} readOnly={goal?.metric === 'distinct-days'} value={form.quantity} onChange={event => update('quantity', event.target.value)} placeholder="Например: 12" className={inputClass} /></label>
            <label htmlFor="achievement-date"><span>Дата выполнения · МСК <span className="text-rose-300">*</span></span><input id="achievement-date" type="date" required min={achievementWeekStart(now)} max={moscowDate(now)} value={form.workDate} onChange={event => update('workDate', event.target.value)} className={inputClass} /></label>
            <label htmlFor="achievement-time"><span>{goal?.metric === 'average' ? 'Время замера' : 'Время выполнения'} · МСК <span className="text-rose-300">*</span></span><input id="achievement-time" type="time" required value={form.workTime} onChange={event => update('workTime', event.target.value)} className={inputClass} /></label>
          </div>
        </div>

        <div className="border-t border-sky-300/15 pt-6"><p className="eyebrow mb-2">03 · ДОКАЗАТЕЛЬСТВА</p>
          <label htmlFor="achievement-evidence" className="block"><span>Ссылки на скриншоты, видео или сообщения Discord <span className="text-rose-300">*</span></span><textarea id="achievement-evidence" required rows={6} maxLength={10000} value={form.evidenceText} onChange={event => update('evidenceText', event.target.value)} className={`${inputClass} resize-y`} placeholder={'https://allwebs.ru/…\nhttps://discord.com/channels/…'} aria-describedby="achievement-evidence-help" /></label>
          <div id="achievement-evidence-help" className="achievement-evidence-help"><span><Link2 size={14} /> {evidence.links.length} / 50 ссылок</span><span>Каждая ссылка с новой строки. Можно вставить весь список сразу.</span></div>
          <p className="achievement-host-note">Для загрузки скриншотов рекомендуем <a href="https://allwebs.ru/?lang=en" target="_blank" rel="noopener noreferrer">Allwebs <ExternalLink size={12} /></a>. Подойдут и другие хостинги.</p>
          <p className="application-note">Первые ссылки появятся в карточке Discord, полный список — в приложенном текстовом файле.</p>
        </div>

        <details className="achievement-rules achievement-form-rules" open><summary>Правила публикации</summary><ul>{achievementPublicationRules.map(rule => <li key={rule}>{rule}</li>)}</ul></details>
        <label className="achievement-rules-checkbox"><input type="checkbox" checked={form.rulesAccepted} onChange={event => update('rulesAccepted', event.target.checked)} required /><span>Подтверждаю: HUD, дата и время видны, доказательства не использованы повторно.</span></label>
        <div className="border-t border-sky-300/15 pt-5"><label htmlFor="achievement-discord" className="block"><span>Discord ID <span className="font-normal text-slate-400">(автоматически)</span></span><input id="achievement-discord" readOnly value={typeof discordId === 'string' ? discordId : 'Будет добавлен при отправке'} className={inputClass} /></label><p className="application-note">В Discord вы будете упомянуты. Ник и ID доступны кураторам; публичный дашборд показывает только сводные числа.</p></div>
        {state === 'error' && <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p>}
        <ApplicationSubmitHint reason={incompleteReason} remainingSeconds={remainingSeconds} sending={state === 'sending'} />
        <button type="submit" disabled={Boolean(incompleteReason) || state === 'sending' || remainingSeconds > 0} className="primary-button w-full justify-center !py-3.5">{state === 'sending' ? 'Отправка…' : 'Отправить отчёт'}{state !== 'sending' && <Send size={17} aria-hidden="true" />}</button>
      </form>
    </section>}
  </PageTransition>;
}
