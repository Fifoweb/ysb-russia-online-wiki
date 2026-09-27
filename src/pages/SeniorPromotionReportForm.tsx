import { useState } from 'react';
import { ArrowRight, CheckCircle2, Plus, Send, ShieldCheck, Trash2, TrendingUp } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import FormLoader from '../components/FormLoader';
import ApplicationCooldownBanner from '../components/ApplicationCooldownBanner';
import ApplicationSubmitHint from '../components/ApplicationSubmitHint';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { getFunctionErrorMessage } from '../lib/functionError';
import { invokeApplication, useApplicationCooldown } from '../lib/applicationCooldown';

type State = 'idle' | 'sending' | 'ok' | 'error';
const initialForm = { nickStatic: '', rankTransition: '', evidence: '', mentionTarget: 'senior' };
const inputClass = 'mt-2 w-full px-4 py-3 text-sm outline-none';
const targets = [
  { value: 'senior', label: 'Старший состав' },
  { value: 'usb', label: 'Руководство УСБ' },
  { value: 'uku', label: 'Руководство УКУ' },
  { value: 'uor', label: 'Руководство УОР' },
  { value: 'sdb', label: 'Руководство СДБ' },
  { value: 'mb', label: 'Руководство МБ' },
  { value: 'ugk', label: 'Руководство УГК' },
  { value: 'dps', label: 'Руководство ДПС' },
  { value: 'people', label: 'Конкретные люди по Discord-нику' },
];

export default function SeniorPromotionReportForm() {
  const { user, loading, signInWithDiscord } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [people, setPeople] = useState(['']);
  const [state, setState] = useState<State>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const remainingSeconds = useApplicationCooldown(user?.id);
  const discordId = (user?.identities?.find(identity => identity.provider === 'discord')?.identity_data as Record<string, unknown> | null)?.sub;

  const rankMatch = form.rankTransition.trim().match(/^(?:[1-9]|1[0-5])-(?:[1-9]|1[0-5])$/);
  const [fromRank, toRank] = rankMatch ? form.rankTransition.trim().split('-').map(Number) : [0, 0];
  const rankValid = Boolean(rankMatch) && fromRank < toRank;
  const incompleteReason = [
    !form.nickStatic.trim() && 'Укажите никнейм и #статик.',
    !form.rankTransition.trim() ? 'Укажите ранги в формате 1-2.' : !rankValid && 'Укажите повышение в формате 1-2 (ранги от 1 до 15).',
    !form.evidence.trim() && 'Добавьте доказательства проделанной работы.',
    form.mentionTarget === 'people' && people.some(value => value.trim() && value.trim().length < 2) && 'Укажите Discord-ник полностью или Discord ID.',
  ].find(Boolean) || undefined;

  const set = (key: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(current => ({ ...current, [key]: event.target.value }));

  const submit = async () => {
    if (!supabase || !user || state === 'sending' || remainingSeconds > 0 || incompleteReason) return;
    setState('sending');
    setErrorMessage('');
    try {
      const { error } = await invokeApplication('submit-senior-promotion-report', {
        body: { ...form, people: form.mentionTarget === 'people' ? people.map(value => value.trim()).filter(Boolean) : [] },
      }, user.id);
      if (error) {
        setErrorMessage(await getFunctionErrorMessage(error, 'Не удалось отправить отчёт. Проверьте данные и попробуйте ещё раз.'));
        setState('error');
        return;
      }
      setState('ok');
    } catch {
      setErrorMessage('Сервис временно недоступен. Попробуйте позже.');
      setState('error');
    }
  };

  return (
    <PageTransition className="wiki-content application-panel">
      <div className="glass rounded-2xl mb-6 application-heading">
        <span className="application-heading-icon" aria-hidden="true"><TrendingUp size={26} /></span>
        <div>
          <p className="eyebrow">КАДРОВЫЕ ЗАЯВКИ · СТАРШИЙ СОСТАВ</p>
          <h2 className="!mt-0 !mb-2">Отчёт на повышение старшего состава</h2>
          <p className="!m-0 text-sm text-slate-300">Укажите ранги, приложите доказательства и выберите, кого отметить при рассмотрении.</p>
        </div>
      </div>

      {user && <ApplicationCooldownBanner seconds={remainingSeconds} />}
      {loading ? <FormLoader /> : !user ? (
        <section className="glass rounded-2xl border border-sky-300/20 text-center">
          <ShieldCheck size={32} className="mx-auto mb-4 text-sky-300" aria-hidden="true" />
          <p className="text-slate-200 text-sm mb-5">Войдите через Discord, чтобы отправить отчёт.</p>
          <button type="button" onClick={() => signInWithDiscord()} className="primary-button mx-auto">
            Войти через Discord <ArrowRight size={16} aria-hidden="true" />
          </button>
        </section>
      ) : state === 'ok' ? (
        <section className="glass rounded-2xl border border-emerald-400/25 text-center" role="status">
          <CheckCircle2 size={34} className="mx-auto mb-4 text-emerald-300" aria-hidden="true" />
          <p className="text-emerald-200 text-base font-semibold mb-5">Отчёт на повышение отправлен</p>
          <button type="button" onClick={() => { setForm(initialForm); setPeople(['']); setState('idle'); }} className="secondary-button mx-auto">
            Заполнить новый отчёт
          </button>
        </section>
      ) : (
        <section className="glass rounded-2xl border border-sky-300/15">
          <div className="space-y-6">
            <div>
              <p className="eyebrow mb-2">01 · СОТРУДНИК И ПОВЫШЕНИЕ</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <label className="block">
                  <span>Ваш никнейм и #статик <span className="text-rose-300">*</span></span>
                  <input value={form.nickStatic} onChange={set('nickStatic')} maxLength={100} placeholder="Никнейм | #12345" className={inputClass} />
                </label>
                <label className="block">
                  <span>С какого ранга на какой <span className="text-rose-300">*</span></span>
                  <input value={form.rankTransition} onChange={set('rankTransition')} maxLength={5} inputMode="text" placeholder="1-2" className={inputClass} />
                </label>
              </div>
            </div>
            <div className="border-t border-sky-300/15 pt-6">
              <p className="eyebrow mb-2">02 · ПРОДЕЛАННАЯ РАБОТА</p>
              <label className="block">
                <span>Доказательства проделанной работы <span className="text-rose-300">*</span></span>
                <textarea value={form.evidence} onChange={set('evidence')} maxLength={1000} rows={4}
                  placeholder="Добавьте ссылки на скриншоты, сообщения или описание работы" className={`${inputClass} resize-y`} />
              </label>
            </div>
            <div className="border-t border-sky-300/15 pt-6">
              <p className="eyebrow mb-2">03 · КОГО ОТМЕТИТЬ</p>
              <label className="block">
                <span>Руководство или конкретные люди <span className="text-rose-300">*</span></span>
                <select value={form.mentionTarget} onChange={set('mentionTarget')} className={inputClass}>
                  {targets.map(target => <option key={target.value} value={target.value}>{target.label}</option>)}
                </select>
              </label>
              {form.mentionTarget === 'people' && (
                <div className="mt-4 space-y-3">
                  {people.map((value, index) => (
                    <div key={index} className="flex items-end gap-2">
                      <label className="block min-w-0 flex-1">
                        <span>Ник Discord человека {index + 1}</span>
                        <input value={value} onChange={event => setPeople(current => current.map((entry, i) => i === index ? event.target.value : entry))}
                          maxLength={80} placeholder="Имя пользователя Discord или Discord ID" className={inputClass} />
                      </label>
                      {people.length > 1 && <button type="button" className="icon-button mb-1" title="Удалить строку"
                        aria-label={`Удалить человека ${index + 1}`} onClick={() => setPeople(current => current.filter((_, i) => i !== index))}>
                        <Trash2 size={17} />
                      </button>}
                    </div>
                  ))}
                  <p className="application-note">Укажите имя пользователя Discord из профиля человека, который должен вас повысить, — по одному в строке. Если человека не удаётся найти, укажите его Discord ID. Без заполненных строк отметим старший состав.</p>
                  {people.length < 5 && <button type="button" className="secondary-button" onClick={() => setPeople(current => [...current, ''])}>
                    <Plus size={16} aria-hidden="true" /> Добавить человека
                  </button>}
                </div>
              )}
            </div>
            <div className="border-t border-sky-300/15 pt-5">
              <label className="block">
                <span>Discord ID <span className="font-normal text-slate-400">(заполняется автоматически)</span></span>
                <input readOnly value={typeof discordId === 'string' ? discordId : 'Будет добавлен при отправке'} className={inputClass} />
              </label>
              <p className="application-note">Отчёт отправится от вашего Discord-аккаунта.</p>
            </div>
            {state === 'error' && <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{errorMessage}</p>}
            <ApplicationSubmitHint reason={incompleteReason} remainingSeconds={remainingSeconds} sending={state === 'sending'} />
            <button type="button" onClick={submit} disabled={Boolean(incompleteReason) || state === 'sending' || remainingSeconds > 0}
              className="primary-button w-full justify-center !py-3.5">
              {state === 'sending' ? 'Отправка…' : 'Отправить отчёт'}
              {state !== 'sending' && <Send size={17} aria-hidden="true" />}
            </button>
          </div>
        </section>
      )}
    </PageTransition>
  );
}
