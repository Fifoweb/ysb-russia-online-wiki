import { useState } from 'react';
import { ArrowRight, CheckCircle2, RotateCcw, Send, ShieldCheck } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import FormLoader from '../components/FormLoader';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { getFunctionErrorMessage } from '../lib/functionError';
import { invokeApplication, useApplicationCooldown } from '../lib/applicationCooldown';
import ApplicationCooldownBanner from '../components/ApplicationCooldownBanner';

type State = 'idle' | 'sending' | 'ok' | 'error';

export default function RestoreForm() {
  const { user, loading, signInWithDiscord } = useAuth();
  const [form, setForm] = useState({
    fullNameStatic: '', factionScreenshot: '', rankEvidence: '', dismissReason: '', previousRank: '',
  });
  const [state, setState] = useState<State>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const remainingSeconds = useApplicationCooldown(user?.id);

  const set = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));

  // Скриншот из гос.фракций — опционально (только после ban/warn), остальные обязательны
  const requiredKeys: (keyof typeof form)[] = ['fullNameStatic', 'rankEvidence', 'dismissReason', 'previousRank'];
  const allFilled = requiredKeys.every(k => form[k].trim().length > 0);

  const submit = async () => {
    if (!supabase || !user || state === 'sending' || remainingSeconds > 0 || !allFilled) return;
    setState('sending');
    setErrorMessage('');

    try {
      const { error } = await invokeApplication('submit-restore', { body: form }, user.id);
      if (error) {
        setErrorMessage(await getFunctionErrorMessage(error, 'Не удалось отправить. Попробуйте позже или напишите руководству лично.'));
        setState('error');
        return;
      }
      setState('ok');
    } catch {
      setErrorMessage('Сервис временно недоступен. Попробуйте отправить заявку позже.');
      setState('error');
    }
  };

  const field = (label: string, key: keyof typeof form, placeholder: string, optional = false) => (
    <label className="block">
      <span>{label} {optional ? <span className="text-slate-400 font-normal">(необязательно)</span> : <span className="text-rose-300">*</span>}</span>
      <input value={form[key]} onChange={set(key)} placeholder={placeholder}
        className="mt-2 w-full px-4 py-3 text-sm outline-none" />
    </label>
  );

  return (
    <PageTransition className="wiki-content application-panel">
      <div className="glass rounded-2xl mb-6 application-heading">
        <span className="application-heading-icon" aria-hidden="true"><RotateCcw size={26} /></span>
        <div>
          <p className="eyebrow">КАДРОВЫЕ ЗАЯВКИ · ВОССТАНОВЛЕНИЕ</p>
          <h2 className="!mt-0 !mb-2">Восстановление сотрудника</h2>
          <p className="!m-0 text-sm text-slate-300">Расскажите о прежнем ранге и причине увольнения, приложите подтверждение.</p>
        </div>
      </div>

      {user && <ApplicationCooldownBanner seconds={remainingSeconds} />}
      {loading ? <FormLoader /> : !user ? (
        <section className="glass rounded-2xl border border-sky-300/20 text-center">
          <ShieldCheck size={32} className="mx-auto mb-4 text-sky-300" aria-hidden="true" />
          <p className="text-slate-200 text-sm mb-5">Заявки могут отправлять только авторизованные через Discord пользователи.</p>
          <button type="button" onClick={() => signInWithDiscord()} className="primary-button mx-auto">
            Войти через Discord <ArrowRight size={16} aria-hidden="true" />
          </button>
        </section>
      ) : state === 'ok' ? (
        <section className="glass rounded-2xl border border-emerald-400/25 text-center" role="status">
          <CheckCircle2 size={34} className="mx-auto mb-4 text-emerald-300" aria-hidden="true" />
          <p className="text-emerald-200 text-base font-semibold mb-5">Заявка на восстановление отправлена руководству</p>
          <button type="button" onClick={() => { setForm({ fullNameStatic: '', factionScreenshot: '', rankEvidence: '', dismissReason: '', previousRank: '' }); setErrorMessage(''); setState('idle'); }}
            className="secondary-button mx-auto">
            Отправить ещё одну
          </button>
        </section>
      ) : (
        <section className="glass rounded-2xl border border-sky-300/15">
          <div className="space-y-6">
            <div>
              <p className="eyebrow mb-2">01 · ДАННЫЕ СОТРУДНИКА</p>
              {field('Имя Фамилия | static', 'fullNameStatic', 'Например: Стажер | Андрей Смирный | 75463')}
            </div>
            <div className="border-t border-sky-300/15 pt-6">
              <p className="eyebrow mb-2">02 · ПРЕЖНЯЯ СЛУЖБА</p>
              <div className="space-y-5">
                {field('Ранг до увольнения', 'previousRank', 'Например: 5')}
                <label className="block">
                  <span>Причина увольнения <span className="text-rose-300">*</span></span>
                  <textarea value={form.dismissReason} onChange={set('dismissReason')} rows={3}
                    placeholder="Почему были уволены..."
                    className="mt-2 w-full px-4 py-3 text-sm outline-none resize-y" />
                </label>
              </div>
            </div>
            <div className="border-t border-sky-300/15 pt-6">
              <p className="eyebrow mb-2">03 · ПОДТВЕРЖДЕНИЕ</p>
              <div className="space-y-5">
                {field('Доказательства пребывания на ранге', 'rankEvidence', 'Ссылка на скриншот/видео...')}
                {field('Скриншот на одобренный запрос из дискорда гос.фракций (если после ban/warn)', 'factionScreenshot', 'Ссылка на скриншот...', true)}
              </div>
            </div>

            {state === 'error' && (
              <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {errorMessage}
              </p>
            )}

            <button type="button" onClick={submit} disabled={!allFilled || state === 'sending' || remainingSeconds > 0}
              className="primary-button w-full justify-center !py-3.5">
              {state === 'sending' ? 'Отправка…' : 'Отправить заявку на восстановление'}
              {state !== 'sending' && <Send size={17} aria-hidden="true" />}
            </button>
            <p className="application-note text-center">Отправляется от вашего Discord-аккаунта: {(user.user_metadata as Record<string, string | undefined>)?.full_name || 'пользователь'}</p>
          </div>
        </section>
      )}
    </PageTransition>
  );
}
