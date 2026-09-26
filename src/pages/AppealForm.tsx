import { useState } from 'react';
import { ArrowRight, CheckCircle2, Gavel, Send, ShieldCheck } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import FormLoader from '../components/FormLoader';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { getFunctionErrorMessage } from '../lib/functionError';
import { invokeApplication, useApplicationCooldown } from '../lib/applicationCooldown';
import ApplicationCooldownBanner from '../components/ApplicationCooldownBanner';

type State = 'idle' | 'sending' | 'ok' | 'error';

const initialForm = {
  nick: '',
  reason: '',
  evidence: '',
};

export default function AppealForm() {
  const { user, loading, signInWithDiscord } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [state, setState] = useState<State>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const remainingSeconds = useApplicationCooldown(user?.id);

  const set = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));

  const allFilled = form.reason.trim().length > 0 && form.evidence.trim().length > 0;

  const submit = async () => {
    if (!supabase || !user || state === 'sending' || remainingSeconds > 0 || !allFilled) return;
    setState('sending');
    setErrorMessage('');
    try {
      const { error } = await invokeApplication('submit-application', {
        body: { type: 'appeal', ...form },
      }, user.id);
      if (error) {
        setErrorMessage(await getFunctionErrorMessage(error, 'Не удалось отправить. Проверьте ссылки и попробуйте ещё раз.'));
        setState('error');
        return;
      }
      setState('ok');
    } catch {
      setErrorMessage('Сервис временно недоступен. Попробуйте отправить обращение позже.');
      setState('error');
    }
  };

  const inputClass = 'mt-2 w-full px-4 py-3 text-sm outline-none';

  return (
    <PageTransition className="wiki-content application-panel">
      <div className="glass rounded-2xl mb-6 application-heading">
        <span className="application-heading-icon" aria-hidden="true"><Gavel size={26} /></span>
        <div>
          <p className="eyebrow">КАДРОВЫЕ ЗАЯВКИ · ОБЖАЛОВАНИЕ</p>
          <h2 className="!mt-0 !mb-2">Обжалование выговора</h2>
          <p className="!m-0 text-sm text-slate-300">Опишите причины обжалования и приложите подтверждающие материалы.</p>
        </div>
      </div>

      {user && <ApplicationCooldownBanner seconds={remainingSeconds} />}
      {loading ? <FormLoader /> : !user ? (
        <section className="glass rounded-2xl border border-sky-300/20 text-center">
          <ShieldCheck size={32} className="mx-auto mb-4 text-sky-300" aria-hidden="true" />
          <p className="text-slate-200 text-sm mb-5">Обжалование могут отправлять только авторизованные через Discord пользователи.</p>
          <button type="button" onClick={() => signInWithDiscord()} className="primary-button mx-auto">
            Войти через Discord <ArrowRight size={16} aria-hidden="true" />
          </button>
        </section>
      ) : state === 'ok' ? (
        <section className="glass rounded-2xl border border-emerald-400/25 text-center" role="status">
          <CheckCircle2 size={34} className="mx-auto mb-4 text-emerald-300" aria-hidden="true" />
          <p className="text-emerald-200 text-base font-semibold mb-5">Обжалование выговора отправлено на рассмотрение</p>
          <button type="button" onClick={() => { setForm(initialForm); setState('idle'); }} className="secondary-button mx-auto">
            Отправить ещё одно
          </button>
        </section>
      ) : (
        <section className="glass rounded-2xl border border-sky-300/15">
          <div className="space-y-6">
            <div>
              <p className="eyebrow mb-2">01 · ЗАЯВИТЕЛЬ</p>
              <label className="block">
                <span>Ваш никнейм | статик <span className="font-normal text-slate-400">(необязательно)</span></span>
                <input value={form.nick} onChange={set('nick')} placeholder="Например: Kira_Comis | 155" maxLength={100} className={inputClass} />
              </label>
            </div>

            <div className="border-t border-sky-300/15 pt-6">
              <p className="eyebrow mb-2">02 · ОБСТОЯТЕЛЬСТВА</p>
              <label className="block">
                <span>Почему вам должны обжаловать выговор <span className="text-rose-300">*</span></span>
                <textarea value={form.reason} onChange={set('reason')} rows={4} maxLength={1000}
                  placeholder="Опишите обстоятельства и основания для обжалования..." className={`${inputClass} resize-y`} />
              </label>
            </div>

            <div className="border-t border-sky-300/15 pt-6">
              <p className="eyebrow mb-2">03 · ДОКАЗАТЕЛЬСТВА</p>
              <label className="block">
                <span>Доказательства, подтверждающие ваши слова (если таковые допустимы) <span className="text-rose-300">*</span></span>
                <textarea value={form.evidence} onChange={set('evidence')} rows={4} maxLength={1000}
                  placeholder="Ссылки на скриншоты, видео или другие допустимые доказательства..." className={`${inputClass} resize-y`} />
              </label>
            </div>

            {state === 'error' && (
              <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {errorMessage}
              </p>
            )}

            <button type="button" onClick={submit} disabled={!allFilled || state === 'sending' || remainingSeconds > 0}
              className="primary-button w-full justify-center !py-3.5">
              {state === 'sending' ? 'Отправка…' : 'Отправить обжалование'}
              {state !== 'sending' && <Send size={17} aria-hidden="true" />}
            </button>
            <p className="application-note text-center">Отправляется от вашего Discord-аккаунта: {(user.user_metadata as Record<string, string | undefined>)?.full_name || 'пользователь'}</p>
          </div>
        </section>
      )}
    </PageTransition>
  );
}
