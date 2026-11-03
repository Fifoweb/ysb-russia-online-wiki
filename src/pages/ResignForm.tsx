import { ApplicationSubmitButton, SubmissionSuccess } from '../components/SubmissionFeedback';
import EvidenceUpload from '../components/EvidenceUpload';
import { useEvidenceUploadStatus } from '../components/EvidenceUploadsProvider';
import { useProfileForm } from '../lib/useProfileForm';
import ProfileAutofillNotice from '../components/ProfileAutofillNotice';
import { useState } from 'react';
import { ArrowRight, FileText, ShieldCheck } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import FormLoader from '../components/FormLoader';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { getFunctionErrorMessage } from '../lib/functionError';
import { invokeApplication, useApplicationCooldown } from '../lib/applicationCooldown';
import ApplicationCooldownBanner from '../components/ApplicationCooldownBanner';
import ApplicationSubmitHint from '../components/ApplicationSubmitHint';

type State = 'idle' | 'sending' | 'ok' | 'error';

const initialForm = {
  fullNameStatic: '',
  department: '',
  currentRank: '',
  recordScreenshot: '',
};

export default function ResignForm() {
  const { user, loading, signInWithDiscord } = useAuth();
  const [form, setForm, resetForm] = useProfileForm(initialForm, { fullNameStatic: 'combined', department: 'departmentLabel' });
  const [state, setState] = useState<State>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const uploadStatus = useEvidenceUploadStatus();
  const remainingSeconds = useApplicationCooldown(user?.id);

  const set = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));

  const rankValid = /^(?:[1-9]|1[0-5])$/.test(form.currentRank);
  const screenshotValid = /^https?:\/\/\S+$/i.test(form.recordScreenshot.trim());
  const incompleteReason = uploadStatus.reason || ([
    !form.fullNameStatic.trim() && 'Укажите имя, фамилию и StaticID.',
    !form.department.trim() && 'Укажите отдел.',
    !form.currentRank.trim() ? 'Укажите текущий ранг.' : !rankValid && 'Ранг должен быть от 1 до 15.',
    !form.recordScreenshot.trim() ? 'Добавьте ссылку на личное дело.' : !screenshotValid && 'Проверьте ссылку на скрин личного дела.',
  ].find(Boolean) || undefined);
  const allFilled = !incompleteReason;

  const submit = async () => {
    if (!supabase || !user || state === 'sending' || remainingSeconds > 0 || !allFilled) return;
    setState('sending');
    setErrorMessage('');

    try {
      const { error } = await invokeApplication('submit-resign', {
        body: form,
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

      <ProfileAutofillNotice />

      {user && <ApplicationCooldownBanner seconds={remainingSeconds} />}
      {loading ? <FormLoader /> : !user ? (
        <section className="glass rounded-2xl border border-sky-300/20 text-center">
          <ShieldCheck size={32} className="mx-auto mb-4 text-sky-300" aria-hidden="true" />
          <p className="text-slate-200 text-sm mb-5">Заявления могут отправлять только авторизованные через Discord пользователи.</p>
          <button type="button" onClick={() => signInWithDiscord()} className="primary-button mx-auto">
            Войти через Discord <ArrowRight size={16} aria-hidden="true" />
          </button>
        </section>
      ) : state === 'ok' ? (
        <SubmissionSuccess title="Заявление на увольнение отправлено руководству">

          <button type="button" onClick={() => { resetForm(); setErrorMessage(''); setState('idle'); }}
            className="secondary-button mx-auto">
            Отправить ещё одно
          </button>
        </SubmissionSuccess>
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
              <EvidenceUpload value={form.recordScreenshot} onChange={next => setForm(current => ({ ...current, recordScreenshot: next }))} multiple={false} maxLength={300} maxFiles={1} disabled={state === 'sending'}>
                <label className="block">
                  <span>Скриншот личного дела <span className="text-rose-300">*</span></span>
                  <input type="url" value={form.recordScreenshot} onChange={set('recordScreenshot')}
                    placeholder="https://..." maxLength={300} required
                    className="mt-2 w-full px-4 py-3 text-sm outline-none" />
                </label>
              </EvidenceUpload>
            </div>

            {state === 'error' && (
              <div className="space-y-3">
                <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{errorMessage}</p>
              </div>
            )}

            <ApplicationSubmitHint reason={incompleteReason} remainingSeconds={remainingSeconds} sending={state === 'sending'} />
            <ApplicationSubmitButton type="button" onClick={submit} disabled={!allFilled || state === 'sending' || remainingSeconds > 0} sending={state === 'sending'}>Отправить заявление на увольнение</ApplicationSubmitButton>
            <p className="application-note text-center">Отправляется от вашего Discord-аккаунта: {(user.user_metadata as Record<string, string | undefined>)?.full_name || 'пользователь'}</p>
          </div>
        </section>
      )}
    </PageTransition>
  );
}
