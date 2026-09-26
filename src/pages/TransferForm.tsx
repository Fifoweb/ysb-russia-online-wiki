import { useState } from 'react';
import { ArrowRight, ArrowRightLeft, CheckCircle2, Send, ShieldCheck } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import FormLoader from '../components/FormLoader';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { getFunctionErrorMessage } from '../lib/functionError';
import { invokeApplication, useApplicationCooldown } from '../lib/applicationCooldown';
import ApplicationCooldownBanner from '../components/ApplicationCooldownBanner';

type State = 'idle' | 'sending' | 'ok' | 'error';

const initialForm = {
  fullNameStatic: '',
  sourceFaction: '',
  joinDate: '',
  personalFileScreenshot: '',
  currentRank: '',
};

export default function TransferForm() {
  const { user, loading, signInWithDiscord } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [state, setState] = useState<State>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const remainingSeconds = useApplicationCooldown(user?.id);

  const set = (key: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value }));

  const rankValid = /^(?:[1-9]|1[0-5])$/.test(form.currentRank);
  const screenshotValid = /^https?:\/\/\S+$/i.test(form.personalFileScreenshot.trim());
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(form.joinDate);
  const allFilled = Object.values(form).every((value) => value.trim().length > 0) &&
    rankValid && screenshotValid && dateValid;

  const submit = async () => {
    if (!supabase || !user || state === 'sending' || remainingSeconds > 0 || !allFilled) return;
    setState('sending');
    setErrorMessage('');

    try {
      const { error } = await invokeApplication('submit-transfer', { body: form }, user.id);
      if (error) {
        setErrorMessage(await getFunctionErrorMessage(error, 'Не удалось отправить заявку. Проверьте поля и попробуйте ещё раз.'));
        setState('error');
        return;
      }
      setState('ok');
    } catch {
      setErrorMessage('Сервис временно недоступен. Попробуйте отправить заявку позже.');
      setState('error');
    }
  };

  const field = (label: string, key: keyof typeof form, placeholder: string, maxLength: number) => (
    <label className="block">
      <span>{label} <span className="text-rose-300">*</span></span>
      <input value={form[key]} onChange={set(key)} placeholder={placeholder} maxLength={maxLength} required
        className="mt-2 w-full px-4 py-3 text-sm outline-none" />
    </label>
  );

  return (
    <PageTransition className="wiki-content application-panel">
      <div className="glass rounded-2xl mb-6 application-heading">
        <span className="application-heading-icon" aria-hidden="true"><ArrowRightLeft size={26} /></span>
        <div>
          <p className="eyebrow">КАДРОВЫЕ ЗАЯВКИ · ПЕРЕВОД</p>
          <h2 className="!mt-0 !mb-2">Переводы в ГИБДД</h2>
          <p className="!m-0 text-sm text-slate-300">Укажите прежнюю фракцию и подтвердите данные личного дела.</p>
        </div>
      </div>

      {user && <ApplicationCooldownBanner seconds={remainingSeconds} />}
      {loading ? <FormLoader /> : !user ? (
        <section className="glass rounded-2xl border border-sky-300/20 text-center">
          <ShieldCheck size={32} className="mx-auto mb-4 text-sky-300" aria-hidden="true" />
          <p className="text-slate-200 text-sm mb-5">Заявки на перевод могут отправлять только авторизованные через Discord пользователи.</p>
          <button type="button" onClick={() => signInWithDiscord()} className="primary-button mx-auto">
            Войти через Discord <ArrowRight size={16} aria-hidden="true" />
          </button>
        </section>
      ) : state === 'ok' ? (
        <section className="glass rounded-2xl border border-emerald-400/25 text-center" role="status">
          <CheckCircle2 size={34} className="mx-auto mb-4 text-emerald-300" aria-hidden="true" />
          <p className="text-emerald-200 text-base font-semibold mb-5">Заявка на перевод в ГИБДД отправлена руководству</p>
          <button type="button" onClick={() => { setForm(initialForm); setErrorMessage(''); setState('idle'); }}
            className="secondary-button mx-auto">
            Отправить ещё одну
          </button>
        </section>
      ) : (
        <section className="glass rounded-2xl border border-sky-300/15">
          <div className="space-y-6">
            <div>
              <p className="eyebrow mb-2">01 · ДАННЫЕ СОТРУДНИКА</p>
              {field('Имя Фамилия | StaticID', 'fullNameStatic', 'Например: Иван Иванов | 75463', 100)}
            </div>
            <div className="border-t border-sky-300/15 pt-6">
              <p className="eyebrow mb-2">02 · ТЕКУЩАЯ СЛУЖБА</p>
              <div className="space-y-5">
                {field('Фракция, из которой переводитесь', 'sourceFaction', 'Например: Армия России', 100)}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <label className="block">
                    <span>Дата вступления во фракцию <span className="text-rose-300">*</span></span>
                    <input type="date" value={form.joinDate} onChange={set('joinDate')} required
                      className="mt-2 w-full px-4 py-3 text-sm outline-none" />
                  </label>
                  <label className="block">
                    <span>Ваш ранг <span className="text-rose-300">*</span></span>
                    <input type="number" min="1" max="15" inputMode="numeric" value={form.currentRank}
                      onChange={set('currentRank')} placeholder="Например: 5" required
                      className="mt-2 w-full px-4 py-3 text-sm outline-none" />
                  </label>
                </div>
              </div>
            </div>
            <div className="border-t border-sky-300/15 pt-6">
              <p className="eyebrow mb-2">03 · ПОДТВЕРЖДЕНИЕ</p>
              <label className="block">
                <span>Скриншот личного дела из планшета <span className="text-rose-300">*</span></span>
                <input type="url" value={form.personalFileScreenshot} onChange={set('personalFileScreenshot')}
                  placeholder="https://..." maxLength={300} required
                  className="mt-2 w-full px-4 py-3 text-sm outline-none" />
              </label>
            </div>

            {state === 'error' && (
              <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {errorMessage}
              </p>
            )}

            <button type="button" onClick={submit} disabled={!allFilled || state === 'sending' || remainingSeconds > 0}
              className="primary-button w-full justify-center !py-3.5">
              {state === 'sending' ? 'Отправка…' : 'Отправить заявку на перевод'}
              {state !== 'sending' && <Send size={17} aria-hidden="true" />}
            </button>
            <p className="application-note text-center">Отправляется от вашего Discord-аккаунта: {(user.user_metadata as Record<string, string | undefined>)?.full_name || 'пользователь'}</p>
          </div>
        </section>
      )}
    </PageTransition>
  );
}
