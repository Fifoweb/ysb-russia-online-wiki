import { useState, type ChangeEvent, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, Clock3, MessageSquareText, Send, ShieldCheck } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import FormLoader from '../components/FormLoader';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { getFunctionErrorMessage } from '../lib/functionError';

type State = 'idle' | 'sending' | 'ok' | 'error';

const factions = [
  { id: 'gibdd', label: 'ГИБДД' },
  { id: 'mvd', label: 'МВД' },
  { id: 'fsb', label: 'ФСБ' },
  { id: 'other', label: 'Другая фракция' },
] as const;
const initialForm = {
  reporterNicknameStatic: '',
  offenderNicknameStatic: '',
  faction: '',
  otherFaction: '',
  description: '',
  incidentAt: '',
  evidence: '',
};
const inputClass = 'mt-2 w-full px-4 py-3 text-sm outline-none';
const validityWindowMs = 48 * 60 * 60 * 1000;

export default function EmployeeComplaintForm() {
  const { user, loading, signInWithDiscord } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [state, setState] = useState<State>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const discordId = (user?.identities?.find((identity) => identity.provider === 'discord')?.identity_data as
    Record<string, unknown> | null)?.sub;

  const update = (key: keyof typeof initialForm) =>
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setForm((current) => ({ ...current, [key]: value }));
      if (state === 'error') { setState('idle'); setErrorMessage(''); }
    };

  const incidentTime = form.incidentAt ? new Date(form.incidentAt).getTime() : NaN;
  const incidentAge = Date.now() - incidentTime;
  const incidentValid = Number.isFinite(incidentTime) && incidentAge >= -5 * 60 * 1000 &&
    incidentAge <= validityWindowMs;
  const allFilled = Boolean(form.reporterNicknameStatic.trim() && form.offenderNicknameStatic.trim() &&
    form.faction && (form.faction !== 'other' || form.otherFaction.trim()) &&
    form.description.trim() && form.evidence.trim() && incidentValid);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !user || state === 'sending' || !allFilled) return;
    setState('sending');
    setErrorMessage('');
    try {
      const { error } = await supabase.functions.invoke('submit-employee-complaint', {
        body: { ...form, incidentAt: new Date(form.incidentAt).toISOString() },
      });
      if (error) {
        setErrorMessage(await getFunctionErrorMessage(error, 'Не удалось отправить жалобу. Попробуйте ещё раз.'));
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
        <span className="application-heading-icon" aria-hidden="true"><MessageSquareText size={26} /></span>
        <div>
          <p className="eyebrow">ОБРАЩЕНИЯ · СОТРУДНИКИ</p>
          <h2 className="!mt-0 !mb-2">Жалобы на сотрудников</h2>
          <p className="!m-0 text-sm text-slate-300">Любой пользователь может сообщить о правонарушении сотрудника. Укажите обстоятельства и приложите доказательства.</p>
        </div>
      </div>

      {loading ? <FormLoader /> : !user ? (
        <section className="glass rounded-2xl border border-sky-300/20 text-center">
          <ShieldCheck size={32} className="mx-auto mb-4 text-sky-300" aria-hidden="true" />
          <p className="text-slate-200 text-sm mb-5">Для отправки жалобы войдите через Discord.</p>
          <button type="button" onClick={() => signInWithDiscord()} className="primary-button mx-auto">
            Войти через Discord <ArrowRight size={16} aria-hidden="true" />
          </button>
        </section>
      ) : state === 'ok' ? (
        <section className="glass rounded-2xl border border-emerald-400/25 text-center" role="status">
          <CheckCircle2 size={34} className="mx-auto mb-4 text-emerald-300" aria-hidden="true" />
          <p className="text-emerald-200 text-base font-semibold mb-5">Жалоба отправлена на рассмотрение</p>
          <button type="button" onClick={() => { setForm(initialForm); setErrorMessage(''); setState('idle'); }}
            className="secondary-button mx-auto">Отправить ещё одну</button>
        </section>
      ) : (
        <section className="glass rounded-2xl border border-sky-300/15">
          <form onSubmit={submit} className="space-y-6">
            <div>
              <p className="eyebrow mb-2">01 · УЧАСТНИКИ</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <label htmlFor="complaint-reporter" className="block">
                  <span>Ваш никнейм и #статик <span className="text-rose-300">*</span></span>
                  <input id="complaint-reporter" value={form.reporterNicknameStatic} onChange={update('reporterNicknameStatic')}
                    maxLength={100} required placeholder="Ваш никнейм | #статик" className={inputClass} />
                </label>
                <label htmlFor="complaint-offender" className="block">
                  <span>Никнейм и/или #статик нарушителя <span className="text-rose-300">*</span></span>
                  <input id="complaint-offender" value={form.offenderNicknameStatic} onChange={update('offenderNicknameStatic')}
                    maxLength={100} required placeholder="Никнейм или #статик" className={inputClass} />
                </label>
              </div>
              <label htmlFor="complaint-faction" className="block mt-5">
                <span>Фракция нарушителя <span className="text-rose-300">*</span></span>
                <select id="complaint-faction" value={form.faction} onChange={update('faction')}
                  required className={inputClass}>
                  <option value="">Выберите фракцию</option>
                  {factions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              {form.faction === 'other' && (
                <label htmlFor="complaint-other-faction" className="block mt-5">
                  <span>Название фракции <span className="text-rose-300">*</span></span>
                  <input id="complaint-other-faction" value={form.otherFaction} onChange={update('otherFaction')}
                    maxLength={80} required placeholder="Укажите фракцию нарушителя" className={inputClass} />
                </label>
              )}
            </div>

            <div className="border-t border-sky-300/15 pt-6">
              <p className="eyebrow mb-2">02 · ОБСТОЯТЕЛЬСТВА И ДОКАЗАТЕЛЬСТВА</p>
              <label htmlFor="complaint-description" className="block">
                <span>Описание ситуации <span className="text-rose-300">*</span></span>
                <textarea id="complaint-description" value={form.description} onChange={update('description')}
                  rows={4} maxLength={1024} required placeholder="Кратко и по существу опишите нарушение"
                  className={inputClass + ' resize-y'} />
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-5">
                <label htmlFor="complaint-time" className="block">
                  <span>Дата и время происшествия <span className="text-rose-300">*</span></span>
                  <input id="complaint-time" type="datetime-local" value={form.incidentAt}
                    onChange={update('incidentAt')} required className={inputClass} />
                </label>
                <div className="flex items-center gap-3 text-sm text-sky-100/80">
                  <Clock3 size={21} className="shrink-0 text-sky-300" aria-hidden="true" />
                  <p className="!m-0">Доказательства действительны 48 часов после происшествия. Просроченная жалоба отклоняется автоматически.</p>
                </div>
              </div>
              {form.incidentAt && !incidentValid && (
                <p role="alert" className="mt-2 text-sm text-rose-300">Укажите время происшествия за последние 48 часов.</p>
              )}
              <label htmlFor="complaint-evidence" className="block mt-5">
                <span>Доказательства нарушения <span className="text-rose-300">*</span></span>
                <textarea id="complaint-evidence" value={form.evidence} onChange={update('evidence')}
                  rows={3} maxLength={1000} required placeholder="Ссылки на скриншоты, видео или другие доказательства"
                  className={inputClass + ' resize-y'} />
              </label>
            </div>

            <div className="border-t border-sky-300/15 pt-5">
              <label htmlFor="complaint-discord" className="block">
                <span>Discord ID <span className="font-normal text-slate-400">(заполняется автоматически)</span></span>
                <input id="complaint-discord" readOnly
                  value={typeof discordId === 'string' ? discordId : 'Будет добавлен при отправке'}
                  className={inputClass} />
              </label>
              <p className="application-note">Имя и Discord ID отправителя будут видны сотрудникам, рассматривающим жалобу.</p>
            </div>
            {state === 'error' && (
              <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {errorMessage}
              </p>
            )}
            <button type="submit" disabled={!allFilled || state === 'sending'}
              className="primary-button w-full justify-center !py-3.5">
              {state === 'sending' ? 'Отправка…' : 'Отправить жалобу'}
              {state !== 'sending' && <Send size={17} aria-hidden="true" />}
            </button>
          </form>
        </section>
      )}
    </PageTransition>
  );
}
