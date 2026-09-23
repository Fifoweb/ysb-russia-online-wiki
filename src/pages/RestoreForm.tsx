import { useState } from 'react';
import PageTransition from '../components/PageTransition';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { getFunctionErrorMessage } from '../lib/functionError';

type State = 'idle' | 'sending' | 'ok' | 'error';

export default function RestoreForm() {
  const { user, loading, signInWithDiscord } = useAuth();
  const [form, setForm] = useState({
    fullNameStatic: '', factionScreenshot: '', rankEvidence: '', dismissReason: '', previousRank: '',
  });
  const [state, setState] = useState<State>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const set = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));

  // Скриншот из гос.фракций — опционально (только после ban/warn), остальные обязательны
  const requiredKeys: (keyof typeof form)[] = ['fullNameStatic', 'rankEvidence', 'dismissReason', 'previousRank'];
  const allFilled = requiredKeys.every(k => form[k].trim().length > 0);

  const submit = async () => {
    if (!supabase || state === 'sending' || !allFilled) return;
    setState('sending');
    setErrorMessage('');

    try {
      const { error } = await supabase.functions.invoke('submit-restore', { body: form });
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
      <span className="text-xs font-bold text-gray-100">{label} {optional ? <span className="text-gray-500 font-normal">(необязательно)</span> : <span className="text-red-400">*</span>}</span>
      <input value={form[key]} onChange={set(key)} placeholder={placeholder}
        className="mt-1.5 w-full px-3 py-2.5 rounded-lg bg-white/5 border border-purple-500/20 text-sm text-gray-200 outline-none focus:border-purple-500/50 transition-all placeholder:text-gray-600" />
    </label>
  );

  return (
    <PageTransition className="wiki-content">
      <div className="glass rounded-2xl p-8 border border-purple-500/10 mb-6">
        <h2 className="!mt-0 !mb-2">♻️ Восстановление сотрудника</h2>
      </div>

      {loading ? null : !user ? (
        <section className="glass rounded-2xl p-8 border border-purple-500/15 text-center">
          <p className="text-gray-400 text-sm mb-4">🔒 Заявки могут отправлять только авторизованные через Discord пользователи.</p>
          <button onClick={() => signInWithDiscord()}
            className="px-5 py-2.5 rounded-xl bg-[#5865F2]/15 border border-[#5865F2]/40 text-[#8b9aff] hover:bg-[#5865F2]/25 hover:text-white transition-all text-sm font-medium">
            Войти через Discord
          </button>
        </section>
      ) : state === 'ok' ? (
        <section className="glass rounded-2xl p-8 border border-green-500/20 text-center">
          <p className="text-green-300 text-sm mb-4">✅ Заявка на восстановление отправлена руководству</p>
          <button onClick={() => { setForm({ fullNameStatic: '', factionScreenshot: '', rankEvidence: '', dismissReason: '', previousRank: '' }); setErrorMessage(''); setState('idle'); }}
            className="px-5 py-2.5 rounded-xl bg-white/5 border border-purple-500/20 text-gray-300 hover:text-white transition-all text-sm font-mono">
            Отправить ещё одну
          </button>
        </section>
      ) : (
        <section className="glass rounded-2xl p-8 border border-purple-500/10">
          <div className="space-y-4">
            {field('Имя Фамилия | static', 'fullNameStatic', 'Например: Стажер | Андрей Смирный | 75463')}
            {field('Скриншот на одобренный запрос из дискорда гос.фракций (если после ban/warn)', 'factionScreenshot', 'Ссылка на скриншот...', true)}
            {field('Доказательства пребывания на ранге', 'rankEvidence', 'Ссылка на скриншот/видео...')}
            <label className="block">
              <span className="text-xs font-bold text-gray-100">Причина увольнения <span className="text-red-400">*</span></span>
              <textarea value={form.dismissReason} onChange={set('dismissReason')} rows={3}
                placeholder="Почему были уволены..."
                className="mt-1.5 w-full px-3 py-2.5 rounded-lg bg-white/5 border border-purple-500/20 text-sm text-gray-200 outline-none focus:border-purple-500/50 transition-all resize-none placeholder:text-gray-600" />
            </label>
            {field('Ранг до увольнения', 'previousRank', 'Например: 5')}

            {state === 'error' && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5">
                {errorMessage}
              </p>
            )}

            <button onClick={submit} disabled={!allFilled || state === 'sending'}
              className="w-full py-3 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-200 hover:bg-purple-500/30 transition-all font-mono text-sm disabled:opacity-40 disabled:cursor-not-allowed">
              {state === 'sending' ? 'Отправка...' : '♻️ Отправить заявку на восстановление'}
            </button>
            <p className="text-[11px] text-gray-600 text-center !mb-0">Отправляется от вашего Discord-аккаунта: {(user.user_metadata as Record<string, string | undefined>)?.full_name || 'пользователь'}</p>
          </div>
        </section>
      )}
    </PageTransition>
  );
}
