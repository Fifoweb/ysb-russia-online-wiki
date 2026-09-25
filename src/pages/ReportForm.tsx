import { useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, FileUp, LockKeyhole, Send } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import FormLoader from '../components/FormLoader';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { getFunctionErrorMessage } from '../lib/functionError';

type State = 'idle' | 'sending' | 'ok' | 'error';

export default function ReportForm() {
  const { user, loading, signInWithDiscord } = useAuth();
  const [form, setForm] = useState({ nick: '', currentRank: '', targetRank: '', points: '', evidence: '' });
  const [state, setState] = useState<State>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const set = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));

  const allFilled = Object.values(form).every(v => v.trim().length > 0);

  const submit = async () => {
    if (!supabase || state === 'sending' || !allFilled) return;
    setState('sending');
    setErrorMessage('');
    try {
      const { error } = await supabase.functions.invoke('submit-application', { body: form });
      if (error) {
        setErrorMessage(await getFunctionErrorMessage(error, 'Не удалось отправить. Попробуйте позже или напишите руководству лично.'));
        setState('error');
        return;
      }
      setState('ok');
    } catch {
      setErrorMessage('Сервис временно недоступен. Попробуйте отправить заявление позже.');
      setState('error');
    }
  };

  const field = (label: string, key: keyof typeof form, placeholder: string) => (
    <label className="block">
      <span>{label} <span className="text-rose-300">*</span></span>
      <input value={form[key]} onChange={set(key)} placeholder={placeholder}
        className="mt-2 w-full px-4 py-3 text-sm outline-none" />
    </label>
  );

  return (
    <PageTransition className="wiki-content application-panel">
      <div className="glass rounded-2xl mb-6 application-heading">
        <span className="application-heading-icon" aria-hidden="true"><FileUp size={26} /></span>
        <div>
          <p className="eyebrow">КАДРОВЫЕ ЗАЯВЛЕНИЯ · ГИБДД</p>
          <h2 className="!mt-0 !mb-2">Заявление на повышение</h2>
          <p className="!m-0 text-sm text-slate-300">Укажите звание, баллы и ссылки на подтверждающие материалы.</p>
        </div>
      </div>

      {loading ? <FormLoader /> : !user ? (
        <section className="glass rounded-2xl border border-sky-300/20 text-center">
          <LockKeyhole size={32} className="mx-auto mb-4 text-sky-300" aria-hidden="true" />
          <p className="text-slate-200 text-sm mb-5">Заявления могут отправлять только авторизованные через Discord пользователи.</p>
          <button type="button" onClick={() => signInWithDiscord()} className="primary-button mx-auto">
            Войти через Discord <ArrowRight size={16} aria-hidden="true" />
          </button>
        </section>
      ) : state === 'ok' ? (
        <section className="glass rounded-2xl border border-emerald-400/25 text-center" role="status">
          <CheckCircle2 size={34} className="mx-auto mb-4 text-emerald-300" aria-hidden="true" />
          <p className="text-emerald-200 text-base font-semibold mb-5">Заявление отправлено начальству ГИБДД</p>
          <button type="button" onClick={() => { setForm({ nick: '', currentRank: '', targetRank: '', points: '', evidence: '' }); setState('idle'); }}
            className="secondary-button mx-auto">
            Отправить ещё одно
          </button>
        </section>
      ) : (
        <section className="glass rounded-2xl border border-sky-300/15">
          <div className="space-y-6">
            <div>
              <p className="eyebrow mb-2">01 · ДАННЫЕ СОТРУДНИКА</p>
              {field('Ник и статик', 'nick', 'Например: Kira_Comis | 155')}
            </div>
            <div className="border-t border-sky-300/15 pt-6">
              <p className="eyebrow mb-2">02 · СВЕДЕНИЯ О ПОВЫШЕНИИ</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {field('Текущее звание', 'currentRank', 'Например: Лейтенант')}
                {field('Звание, на которое подаётесь', 'targetRank', 'Например: Капитан')}
              </div>
              <div className="mt-5">{field('Сколько баллов набрано', 'points', 'Например: 15')}</div>
            </div>
            <div className="border-t border-sky-300/15 pt-6">
              <p className="eyebrow mb-2">03 · ПОДТВЕРЖДЕНИЕ</p>
              <label className="block">
                <span>Доказательства <span className="text-rose-300">*</span></span>
                <textarea value={form.evidence} onChange={set('evidence')} rows={4}
                  placeholder="Ссылки на скриншоты/видео, описание: чем подтверждаете набор баллов..."
                  className="mt-2 w-full px-4 py-3 text-sm outline-none resize-y" />
              </label>
            </div>

            {state === 'error' && (
              <p className="flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200" role="alert">
                <AlertCircle size={17} className="shrink-0 mt-0.5" aria-hidden="true" /> {errorMessage}
              </p>
            )}

            <button type="button" onClick={submit} disabled={!allFilled || state === 'sending'}
              className="primary-button w-full justify-center !py-3.5">
              {state === 'sending' ? <><span className="form-loader-spinner !w-4 !h-4" aria-hidden="true" /> Отправка…</> : <>Отправить заявление <Send size={17} aria-hidden="true" /></>}
            </button>
            <p className="application-note text-center">Отправляется от вашего Discord-аккаунта: {(user.user_metadata as Record<string, string | undefined>)?.full_name || 'пользователь'}</p>
          </div>
        </section>
      )}
    </PageTransition>
  );
}
