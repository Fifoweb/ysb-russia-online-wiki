import { useState } from 'react';
import { ArrowRight, CheckCircle2, FileText, Send, ShieldCheck } from 'lucide-react';
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
  department: '',
  currentRank: '',
  recordScreenshot: '',
};

export default function ResignForm() {
  const { user, providerToken, loading, signInWithDiscord } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [state, setState] = useState<State>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const remainingSeconds = useApplicationCooldown(user?.id);

  const set = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));

  const rankValid = /^(?:[1-9]|1[0-5])$/.test(form.currentRank);
  const screenshotValid = /^https?:\/\/\S+$/i.test(form.recordScreenshot.trim());
  const allFilled = Object.values(form).every(v => v.trim().length > 0) && rankValid && screenshotValid;

  const submit = async () => {
    if (!supabase || !user || state === 'sending' || remainingSeconds > 0 || !allFilled) return;
    setState('sending');
    setErrorMessage('');

    try {
      const { error } = await invokeApplication('submit-resign', {
        body: { ...form, discordAccessToken: providerToken },
      }, user.id);
      if (error) {
        setErrorMessage(await getFunctionErrorMessage(error, 'Не удалось отправить заявление. Проверьте поля и попробуйте ещё раз.'));
        setState('error');
        return;
      }
      setState('ok');
    } catch {
      setErrorMessage('Сервис временно недоступен. Попробуйте отправить заявление позже.');
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
        <span className="application-heading-icon" aria-hidden="true"><FileText size={26} /></span>
        <div>
          <p className="eyebrow">КАДРОВЫЕ ЗАЯВКИ · УВОЛЬНЕНИЕ</p>
          <h2 className="!mt-0 !mb-2">Заявление на увольнение</h2>
          <p className="!m-0 text-sm text-slate-300">Укажите отдел, текущий ранг и ссылку на личное дело.</p>
        </div>
      </div>

      {user && <ApplicationCooldownBanner seconds={remainingSeconds} />}
      {loading ? <FormLoader /> : !user ? (
        <section className="glass rounded-2xl border border-sky-300/20 text-center">
          <ShieldCheck size={32} className="mx-auto mb-4 text-sky-300" aria-hidden="true" />
          <p className="text-slate-200 text-sm mb-5">Заявления могут отправлять только авторизованные через Discord пользователи.</p>
          <button type="button" onClick={() => signInWithDiscord('identify guilds.members.read')} className="primary-button mx-auto">
            Войти через Discord <ArrowRight size={16} aria-hidden="true" />
          </button>
        </section>
      ) : !providerToken ? (
        <section className="glass rounded-2xl border border-sky-300/20 text-center">
          <ShieldCheck size={32} className="mx-auto mb-4 text-sky-300" aria-hidden="true" />
          <p className="text-slate-200 text-sm mb-5">Для проверки роли нужно повторно войти через Discord и разрешить доступ к сведениям о членстве на сервере.</p>
          <button type="button" onClick={() => signInWithDiscord('identify guilds.members.read')} className="primary-button mx-auto">
            Продолжить через Discord <ArrowRight size={16} aria-hidden="true" />
          </button>
        </section>
      ) : state === 'ok' ? (
        <section className="glass rounded-2xl border border-emerald-400/25 text-center" role="status">
          <CheckCircle2 size={34} className="mx-auto mb-4 text-emerald-300" aria-hidden="true" />
          <p className="text-emerald-200 text-base font-semibold mb-5">Заявление на увольнение отправлено руководству</p>
          <button type="button" onClick={() => { setForm(initialForm); setErrorMessage(''); setState('idle'); }}
            className="secondary-button mx-auto">
            Отправить ещё одно
          </button>
        </section>
      ) : (
        <section className="glass rounded-2xl border border-sky-300/15">
          <div className="space-y-6">
            <div>
              <p className="eyebrow mb-2">01 · ДАННЫЕ СОТРУДНИКА</p>
              {field('Имя Фамилия | static', 'fullNameStatic', 'Например: Стажер | Андрей Смирный | 75463', 100)}
            </div>
            <div className="border-t border-sky-300/15 pt-6">
              <p className="eyebrow mb-2">02 · ТЕКУЩАЯ СЛУЖБА</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {field('Отдел', 'department', 'Например: ГИБДД', 60)}
                <label className="block">
                  <span>Текущий ранг <span className="text-rose-300">*</span></span>
                  <input type="number" min="1" max="15" inputMode="numeric" value={form.currentRank}
                    onChange={set('currentRank')} placeholder="Например: 5" required
                    className="mt-2 w-full px-4 py-3 text-sm outline-none" />
                </label>
              </div>
            </div>
            <div className="border-t border-sky-300/15 pt-6">
              <p className="eyebrow mb-2">03 · ЛИЧНОЕ ДЕЛО</p>
              <label className="block">
                <span>Скриншот личного дела <span className="text-rose-300">*</span></span>
                <input type="url" value={form.recordScreenshot} onChange={set('recordScreenshot')}
                  placeholder="https://..." maxLength={300} required
                  className="mt-2 w-full px-4 py-3 text-sm outline-none" />
              </label>
            </div>

            {state === 'error' && (
              <div className="space-y-3">
                <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{errorMessage}</p>
                <button type="button" onClick={() => signInWithDiscord('identify guilds.members.read')}
                  className="text-sm text-sky-300 hover:text-white underline underline-offset-4">Повторно подключить Discord для проверки роли</button>
              </div>
            )}

            <button type="button" onClick={submit} disabled={!allFilled || state === 'sending' || remainingSeconds > 0}
              className="primary-button w-full justify-center !py-3.5">
              {state === 'sending' ? 'Отправка…' : 'Отправить заявление на увольнение'}
              {state !== 'sending' && <Send size={17} aria-hidden="true" />}
            </button>
            <p className="application-note text-center">Отправляется от вашего Discord-аккаунта: {(user.user_metadata as Record<string, string | undefined>)?.full_name || 'пользователь'}</p>
          </div>
        </section>
      )}
    </PageTransition>
  );
}
