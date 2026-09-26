import { useState } from 'react';
import { ArrowRight, CheckCircle2, MessageSquareText, Send, ShieldCheck } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import FormLoader from '../components/FormLoader';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { getFunctionErrorMessage } from '../lib/functionError';
import { invokeApplication, useApplicationCooldown } from '../lib/applicationCooldown';
import ApplicationCooldownBanner from '../components/ApplicationCooldownBanner';

type State = 'idle' | 'sending' | 'ok' | 'error';

const initialForm = { offender: '', description: '', evidence: '', contactDiscord: '' };
const inputClass = 'mt-2 w-full px-4 py-3 text-sm outline-none';

export default function ComplaintForm() {
  const { user, loading, signInWithDiscord } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [state, setState] = useState<State>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const remainingSeconds = useApplicationCooldown(user?.id);

  const set = (key: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value }));
  const allFilled = Boolean(form.offender.trim() && form.description.trim() && form.contactDiscord.trim());

  const submit = async () => {
    if (!supabase || !user || state === 'sending' || remainingSeconds > 0 || !allFilled) return;
    setState('sending');
    setErrorMessage('');
    try {
      const { error } = await invokeApplication('submit-complaint', {
        body: { ...form, evidence: form.evidence.trim() },
      }, user.id);
      if (error) {
        setErrorMessage(await getFunctionErrorMessage(error, 'Не удалось отправить жалобу. Попробуйте позже.'));
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
          <p className="eyebrow">ОБРАЩЕНИЯ · РУКОВОДСТВО</p>
          <h2 className="!mt-0 !mb-2">Анонимные жалобы на вышестоящее руководство</h2>
          <p className="!m-0 text-sm text-slate-300">Здесь можно пожаловаться на действия начальников и вышестоящего руководства.</p>
        </div>
      </div>

      {user && <ApplicationCooldownBanner seconds={remainingSeconds} />}
      {loading ? <FormLoader /> : !user ? (
        <section className="glass rounded-2xl border border-sky-300/20 text-center">
          <ShieldCheck size={32} className="mx-auto mb-4 text-sky-300" aria-hidden="true" />
          <p className="text-slate-200 text-sm mb-5">Войдите через Discord: ID будет добавлен в карточку автоматически.</p>
          <button type="button" onClick={() => signInWithDiscord()} className="primary-button mx-auto">
            Войти через Discord <ArrowRight size={16} aria-hidden="true" />
          </button>
        </section>
      ) : state === 'ok' ? (
        <section className="glass rounded-2xl border border-emerald-400/25 text-center" role="status">
          <CheckCircle2 size={34} className="mx-auto mb-4 text-emerald-300" aria-hidden="true" />
          <p className="text-emerald-200 text-base font-semibold mb-5">Жалоба отправлена</p>
          <button type="button" onClick={() => { setForm(initialForm); setState('idle'); }} className="secondary-button mx-auto">
            Отправить ещё одну
          </button>
        </section>
      ) : (
        <section className="glass rounded-2xl border border-sky-300/15">
          <div className="space-y-6">
            <div>
              <p className="eyebrow mb-2">01 · УЧАСТНИКИ</p>
              <label className="block">
                <span>Никнейм / Статик нарушителя <span className="text-rose-300">*</span></span>
                <input value={form.offender} onChange={set('offender')} maxLength={100} placeholder="Имя и StaticID" className={inputClass} />
              </label>
            </div>
            <div className="border-t border-sky-300/15 pt-6">
              <p className="eyebrow mb-2">02 · ОБСТОЯТЕЛЬСТВА И ДОКАЗАТЕЛЬСТВА</p>
              <label className="block">
                <span>Описание ситуации <span className="text-rose-300">*</span></span>
                <textarea value={form.description} onChange={set('description')} rows={5} maxLength={1024}
                  placeholder="Опишите, что произошло..." className={`${inputClass} resize-y`} />
              </label>
              <label className="block mt-5">
                <span>Доказательства <span className="text-slate-400 font-normal">(при наличии)</span></span>
                <textarea value={form.evidence} onChange={set('evidence')} rows={3} maxLength={1000}
                  placeholder="Ссылки или описание доказательств..." className={`${inputClass} resize-y`} />
              </label>
            </div>
            <div className="border-t border-sky-300/15 pt-6">
              <p className="eyebrow mb-2">03 · ОБРАТНАЯ СВЯЗЬ</p>
              <label className="block">
                <span>Ваш Discord для связи <span className="text-rose-300">*</span></span>
                <input value={form.contactDiscord} onChange={set('contactDiscord')} maxLength={100} placeholder="Например: username" className={inputClass} />
              </label>
              <p className="application-note">Discord-ник и ID из авторизации будут видны сотрудникам канала; автора не упоминает.</p>
            </div>
            {state === 'error' && <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{errorMessage}</p>}
            <button type="button" onClick={submit} disabled={!allFilled || state === 'sending' || remainingSeconds > 0}
              className="primary-button w-full justify-center !py-3.5">
              {state === 'sending' ? 'Отправка…' : 'Отправить жалобу'}
              {state !== 'sending' && <Send size={17} aria-hidden="true" />}
            </button>
          </div>
        </section>
      )}
    </PageTransition>
  );
}
