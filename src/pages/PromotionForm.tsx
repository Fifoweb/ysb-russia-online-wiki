import { useState } from 'react';
import { ArrowRight, CheckCircle2, Send, ShieldCheck, TrendingUp } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import FormLoader from '../components/FormLoader';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { getFunctionErrorMessage } from '../lib/functionError';
import { invokeApplication, useApplicationCooldown } from '../lib/applicationCooldown';
import ApplicationCooldownBanner from '../components/ApplicationCooldownBanner';

type State = 'idle' | 'sending' | 'ok' | 'error';
const initialForm = { fullNameStatic: '', targetRank: '', reportUrl: '' };
const inputClass = 'mt-2 w-full px-4 py-3 text-sm outline-none';

export default function PromotionForm() {
  const { user, loading, signInWithDiscord } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [state, setState] = useState<State>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const remainingSeconds = useApplicationCooldown(user?.id);
  const discordId = (user?.identities?.find((identity) => identity.provider === 'discord')?.identity_data as Record<string, unknown> | null)?.sub;

  const set = (key: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const rankValid = /^(?:[1-9]|1[0-5])$/.test(form.targetRank);
  const reportUrlValid = /^https:\/\/(?:discord\.com|discordapp\.com)\/channels\/\d{17,20}\/\d{17,20}\/\d{17,20}\/?$/i.test(form.reportUrl.trim());
  const allFilled = Boolean(form.fullNameStatic.trim() && rankValid && reportUrlValid);

  const submit = async () => {
    if (!supabase || !user || state === 'sending' || remainingSeconds > 0 || !allFilled) return;
    setState('sending');
    setErrorMessage('');
    try {
      const { error } = await invokeApplication('submit-promotion', {
        body: form,
      }, user.id);
      if (error) {
        setErrorMessage(await getFunctionErrorMessage(error, 'Не удалось отправить запрос. Проверьте ссылку и попробуйте ещё раз.'));
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
          <p className="eyebrow">КАДРОВЫЕ ЗАЯВКИ · ПОВЫШЕНИЕ</p>
          <h2 className="!mt-0 !mb-2">Запрос на повышение</h2>
          <p className="!m-0 text-sm text-slate-300">Укажите желаемый ранг и ссылку на сообщение с отчётом в Discord.</p>
        </div>
      </div>

      {user && <ApplicationCooldownBanner seconds={remainingSeconds} />}
      {loading ? <FormLoader /> : !user ? (
        <section className="glass rounded-2xl border border-sky-300/20 text-center">
          <ShieldCheck size={32} className="mx-auto mb-4 text-sky-300" aria-hidden="true" />
          <p className="text-slate-200 text-sm mb-5">Войдите через Discord, чтобы отправить запрос.</p>
          <button type="button" onClick={() => signInWithDiscord()}
            className="primary-button mx-auto">
            Войти через Discord <ArrowRight size={16} aria-hidden="true" />
          </button>
        </section>
      ) : state === 'ok' ? (
        <section className="glass rounded-2xl border border-emerald-400/25 text-center" role="status">
          <CheckCircle2 size={34} className="mx-auto mb-4 text-emerald-300" aria-hidden="true" />
          <p className="text-emerald-200 text-base font-semibold mb-5">Запрос на повышение отправлен</p>
          <button type="button" onClick={() => { setForm(initialForm); setState('idle'); }}
            className="secondary-button mx-auto">
            Отправить ещё один
          </button>
        </section>
      ) : (
        <section className="glass rounded-2xl border border-sky-300/15">
          <div className="space-y-6">
            <div>
              <p className="eyebrow mb-2">01 · ДАННЫЕ СОТРУДНИКА</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <label className="block">
                  <span>Имя Фамилия | StaticID <span className="text-rose-300">*</span></span>
                  <input value={form.fullNameStatic} onChange={set('fullNameStatic')} maxLength={100} placeholder="Имя Фамилия | 75463" className={inputClass} />
                </label>
                <label className="block">
                  <span>На какой ранг повысить? <span className="text-rose-300">*</span></span>
                  <input type="number" min="1" max="15" inputMode="numeric" value={form.targetRank} onChange={set('targetRank')} placeholder="1–15" className={inputClass} />
                </label>
              </div>
            </div>
            <div className="border-t border-sky-300/15 pt-6">
              <p className="eyebrow mb-2">02 · ПОДТВЕРЖДЕНИЕ</p>
              <label className="block">
                <span>Ссылка на отчёт (сообщение Discord) <span className="text-rose-300">*</span></span>
                <input type="url" value={form.reportUrl} onChange={set('reportUrl')} maxLength={300} placeholder="https://discord.com/channels/..." className={inputClass}
                  aria-invalid={Boolean(form.reportUrl.trim()) && !reportUrlValid} aria-describedby="promotion-report-url-hint" />
                <span id="promotion-report-url-hint" className={form.reportUrl.trim() && !reportUrlValid ? 'mt-2 block text-xs text-amber-200' : 'mt-2 block text-xs text-slate-400'}>
                  {form.reportUrl.trim() && !reportUrlValid
                    ? 'Нужна ссылка на конкретное сообщение Discord: discord.com/channels/... или discordapp.com/channels/...'
                    : 'Скопируйте ссылку на сообщение с отчётом в Discord.'}
                </span>
              </label>
            </div>
            <div className="border-t border-sky-300/15 pt-5">
              <label className="block">
                <span>Discord ID <span className="font-normal text-slate-400">(заполняется автоматически)</span></span>
                <input readOnly value={typeof discordId === 'string' ? discordId : 'Будет добавлен при отправке'} className={inputClass} />
              </label>
              <p className="application-note">Заявка отправится от вашего Discord-аккаунта.</p>
            </div>
            {state === 'error' && (
              <div className="space-y-3">
                <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{errorMessage}</p>
              </div>
            )}
            <button type="button" onClick={submit} disabled={!allFilled || state === 'sending' || remainingSeconds > 0}
              className="primary-button w-full justify-center !py-3.5">
              {state === 'sending' ? 'Отправка…' : 'Отправить запрос на повышение'}
              {state !== 'sending' && <Send size={17} aria-hidden="true" />}
            </button>
          </div>
        </section>
      )}
    </PageTransition>
  );
}
