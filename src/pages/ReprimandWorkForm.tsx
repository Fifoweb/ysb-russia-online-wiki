import { useState } from 'react';
import { ArrowRight, CheckCircle2, Hammer, Send, ShieldCheck } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import FormLoader from '../components/FormLoader';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { getFunctionErrorMessage } from '../lib/functionError';

type State = 'idle' | 'sending' | 'ok' | 'error';

const initialForm = {
  nick: '',
  reprimandScreenshot: '',
  action: '',
  evidence: '',
};

const inputClass = 'mt-2 w-full px-4 py-3 text-sm outline-none';

export default function ReprimandWorkForm() {
  const { user, loading, signInWithDiscord } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [state, setState] = useState<State>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const set = (key: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value }));

  const allFilled = Object.values(form).every((value) => value.trim().length > 0);

  const submit = async () => {
    if (!supabase || state === 'sending' || !allFilled) return;
    setState('sending');
    setErrorMessage('');
    try {
      const { error } = await supabase.functions.invoke('submit-reprimand-work', { body: form });
      if (error) {
        setErrorMessage(await getFunctionErrorMessage(error, 'Не удалось отправить заявку. Попробуйте позже.'));
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
        <span className="application-heading-icon" aria-hidden="true"><Hammer size={26} /></span>
        <div>
          <p className="eyebrow">КАДРОВЫЕ ЗАЯВКИ · ДИСЦИПЛИНА</p>
          <h2 className="!mt-0 !mb-2">Отработка выговора</h2>
          <p className="!m-0 text-sm text-slate-300">Опишите выполненную работу и приложите подтверждающие материалы.</p>
        </div>
      </div>

      {loading ? <FormLoader /> : !user ? (
        <section className="glass rounded-2xl border border-sky-300/20 text-center">
          <ShieldCheck size={32} className="mx-auto mb-4 text-sky-300" aria-hidden="true" />
          <p className="text-slate-200 text-sm mb-5">Для отправки заявки войдите через Discord.</p>
          <button type="button" onClick={() => signInWithDiscord()} className="primary-button mx-auto">
            Войти через Discord <ArrowRight size={16} aria-hidden="true" />
          </button>
        </section>
      ) : state === 'ok' ? (
        <section className="glass rounded-2xl border border-emerald-400/25 text-center" role="status">
          <CheckCircle2 size={34} className="mx-auto mb-4 text-emerald-300" aria-hidden="true" />
          <p className="text-emerald-200 text-base font-semibold mb-5">Заявка на отработку выговора отправлена</p>
          <button type="button" onClick={() => { setForm(initialForm); setState('idle'); }} className="secondary-button mx-auto">
            Отправить ещё одну
          </button>
        </section>
      ) : (
        <section className="glass rounded-2xl border border-sky-300/15">
          <div className="space-y-6">
            <div>
              <p className="eyebrow mb-2">01 · ДАННЫЕ СОТРУДНИКА</p>
              <label className="block">
                <span>Ваш никнейм | статик <span className="text-rose-300">*</span></span>
                <input value={form.nick} onChange={set('nick')} maxLength={100} placeholder="Например: Kira_Comis | 155" className={inputClass} />
              </label>
            </div>

            <div className="border-t border-sky-300/15 pt-6">
              <p className="eyebrow mb-2">02 · ВЫГОВОР И ОТРАБОТКА</p>
              <label className="block">
                <span>Скрин вашего личного дела (планшета) с выданным выговором <span className="text-rose-300">*</span></span>
                <input type="url" value={form.reprimandScreenshot} onChange={set('reprimandScreenshot')} maxLength={300} placeholder="https://..." className={inputClass} />
              </label>

              <label className="block mt-5">
                <span>Каким действием отрабатываете выговор <span className="text-rose-300">*</span></span>
                <textarea value={form.action} onChange={set('action')} rows={4} maxLength={1000}
                  placeholder="Опишите действие, которым отрабатываете выговор..." className={`${inputClass} resize-y`} />
              </label>
            </div>

            <div className="border-t border-sky-300/15 pt-6">
              <p className="eyebrow mb-2">03 · ПОДТВЕРЖДЕНИЕ</p>
              <label className="block">
                <span>Доказательства отработки (видеозапись / скрин) <span className="text-rose-300">*</span></span>
                <textarea value={form.evidence} onChange={set('evidence')} rows={4} maxLength={1000}
                  placeholder="Ссылка на видеозапись или скриншот..." className={`${inputClass} resize-y`} />
              </label>
            </div>

            {state === 'error' && (
              <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {errorMessage}
              </p>
            )}

            <button type="button" onClick={submit} disabled={!allFilled || state === 'sending'}
              className="primary-button w-full justify-center !py-3.5">
              {state === 'sending' ? 'Отправка…' : 'Отправить заявку'}
              {state !== 'sending' && <Send size={17} aria-hidden="true" />}
            </button>
            <p className="application-note text-center">Discord ID будет добавлен в карточку автоматически.</p>
          </div>
        </section>
      )}
    </PageTransition>
  );
}
