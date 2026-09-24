import { useState } from 'react';
import PageTransition from '../components/PageTransition';
import FormLoader from '../components/FormLoader';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { getFunctionErrorMessage } from '../lib/functionError';

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

  const set = (key: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value }));

  const rankValid = /^(?:[1-9]|1[0-5])$/.test(form.currentRank);
  const screenshotValid = /^https?:\/\/\S+$/i.test(form.personalFileScreenshot.trim());
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(form.joinDate);
  const allFilled = Object.values(form).every((value) => value.trim().length > 0) &&
    rankValid && screenshotValid && dateValid;

  const submit = async () => {
    if (!supabase || state === 'sending' || !allFilled) return;
    setState('sending');
    setErrorMessage('');

    try {
      const { error } = await supabase.functions.invoke('submit-transfer', { body: form });
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
      <span className="text-xs font-bold text-gray-100">{label} <span className="text-red-400">*</span></span>
      <input value={form[key]} onChange={set(key)} placeholder={placeholder} maxLength={maxLength} required
        className="mt-1.5 w-full px-3 py-2.5 rounded-lg bg-white/5 border border-purple-500/20 text-sm text-gray-200 outline-none focus:border-purple-500/50 transition-all placeholder:text-gray-600" />
    </label>
  );

  return (
    <PageTransition className="wiki-content">
      <div className="glass rounded-2xl p-8 border border-purple-500/10 mb-6">
        <h2 className="!mt-0 !mb-2">🚔 Переводы в ГИБДД</h2>
      </div>

      {loading ? <FormLoader /> : !user ? (
        <section className="glass rounded-2xl p-8 border border-purple-500/15 text-center">
          <p className="text-gray-400 text-sm mb-4">🔒 Заявки на перевод могут отправлять только авторизованные через Discord пользователи.</p>
          <button onClick={() => signInWithDiscord()}
            className="px-5 py-2.5 rounded-xl bg-[#5865F2]/15 border border-[#5865F2]/40 text-[#8b9aff] hover:bg-[#5865F2]/25 hover:text-white transition-all text-sm font-medium">
            Войти через Discord
          </button>
        </section>
      ) : state === 'ok' ? (
        <section className="glass rounded-2xl p-8 border border-green-500/20 text-center">
          <p className="text-green-300 text-sm mb-4">✅ Заявка на перевод в ГИБДД отправлена руководству</p>
          <button onClick={() => { setForm(initialForm); setErrorMessage(''); setState('idle'); }}
            className="px-5 py-2.5 rounded-xl bg-white/5 border border-purple-500/20 text-gray-300 hover:text-white transition-all text-sm font-mono">
            Отправить ещё одну
          </button>
        </section>
      ) : (
        <section className="glass rounded-2xl p-8 border border-purple-500/10">
          <div className="space-y-4">
            {field('Имя Фамилия | StaticID', 'fullNameStatic', 'Например: Иван Иванов | 75463', 100)}
            {field('Фракция, из которой переводитесь', 'sourceFaction', 'Например: Армия России', 100)}
            <label className="block">
              <span className="text-xs font-bold text-gray-100">Дата вступления во фракцию <span className="text-red-400">*</span></span>
              <input type="date" value={form.joinDate} onChange={set('joinDate')} required
                className="mt-1.5 w-full px-3 py-2.5 rounded-lg bg-white/5 border border-purple-500/20 text-sm text-gray-200 outline-none focus:border-purple-500/50 transition-all" />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-gray-100">Скриншот личного дела из планшета <span className="text-red-400">*</span></span>
              <input type="url" value={form.personalFileScreenshot} onChange={set('personalFileScreenshot')}
                placeholder="https://..." maxLength={300} required
                className="mt-1.5 w-full px-3 py-2.5 rounded-lg bg-white/5 border border-purple-500/20 text-sm text-gray-200 outline-none focus:border-purple-500/50 transition-all placeholder:text-gray-600" />
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-xs font-bold text-gray-100">Ваш ранг <span className="text-red-400">*</span></span>
                <input type="number" min="1" max="15" inputMode="numeric" value={form.currentRank}
                  onChange={set('currentRank')} placeholder="Например: 5" required
                  className="mt-1.5 w-full px-3 py-2.5 rounded-lg bg-white/5 border border-purple-500/20 text-sm text-gray-200 outline-none focus:border-purple-500/50 transition-all placeholder:text-gray-600" />
              </label>
            </div>

            {state === 'error' && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5">
                {errorMessage}
              </p>
            )}

            <button onClick={submit} disabled={!allFilled || state === 'sending'}
              className="w-full py-3 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/25 transition-all font-mono text-sm disabled:opacity-40 disabled:cursor-not-allowed">
              {state === 'sending' ? 'Отправка...' : '🚔 Отправить заявку на перевод'}
            </button>
            <p className="text-[11px] text-gray-600 text-center !mb-0">Отправляется от вашего Discord-аккаунта: {(user.user_metadata as Record<string, string | undefined>)?.full_name || 'пользователь'}</p>
          </div>
        </section>
      )}
    </PageTransition>
  );
}
