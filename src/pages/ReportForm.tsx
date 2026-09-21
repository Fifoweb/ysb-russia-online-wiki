import { useState } from 'react';
import PageTransition from '../components/PageTransition';
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
      <span className="text-xs font-bold text-gray-100">{label} <span className="text-red-400">*</span></span>
      <input value={form[key]} onChange={set(key)} placeholder={placeholder}
        className="mt-1.5 w-full px-3 py-2.5 rounded-lg bg-white/5 border border-purple-500/20 text-sm text-gray-200 outline-none focus:border-purple-500/50 transition-all placeholder:text-gray-600" />
    </label>
  );

  return (
    <PageTransition className="wiki-content">
      <div className="glass rounded-2xl p-8 border border-purple-500/10 mb-6">
        <h2 className="!mt-0 !mb-2">📤 Заявление на повышение</h2>
        <p className="text-sm text-gray-500 !mb-0">Заполните форму — заявление сразу уйдёт руководству ГИБДД в Discord от лица бота «Начальник ГИБДД».</p>
      </div>

      {loading ? null : !user ? (
        <section className="glass rounded-2xl p-8 border border-purple-500/15 text-center">
          <p className="text-gray-400 text-sm mb-4">🔒 Заявления могут отправлять только авторизованные через Discord пользователи.</p>
          <button onClick={signInWithDiscord}
            className="px-5 py-2.5 rounded-xl bg-[#5865F2]/15 border border-[#5865F2]/40 text-[#8b9aff] hover:bg-[#5865F2]/25 hover:text-white transition-all text-sm font-medium">
            Войти через Discord
          </button>
        </section>
      ) : state === 'ok' ? (
        <section className="glass rounded-2xl p-8 border border-green-500/20 text-center">
          <p className="text-green-300 text-sm mb-4">✅ Заявление отправлено начальству ГИБДД</p>
          <button onClick={() => { setForm({ nick: '', currentRank: '', targetRank: '', points: '', evidence: '' }); setState('idle'); }}
            className="px-5 py-2.5 rounded-xl bg-white/5 border border-purple-500/20 text-gray-300 hover:text-white transition-all text-sm font-mono">
            Отправить ещё одно
          </button>
        </section>
      ) : (
        <section className="glass rounded-2xl p-8 border border-purple-500/10">
          <div className="space-y-4">
            {field('Ник и статик', 'nick', 'Например: Kira_Comis | 155')}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {field('Текущее звание', 'currentRank', 'Например: Лейтенант')}
              {field('Звание, на которое подаётесь', 'targetRank', 'Например: Капитан')}
            </div>
            {field('Сколько баллов набрано', 'points', 'Например: 15')}
            <label className="block">
              <span className="text-xs font-bold text-gray-100">Доказательства <span className="text-red-400">*</span></span>
              <textarea value={form.evidence} onChange={set('evidence')} rows={4}
                placeholder="Ссылки на скриншоты/видео, описание: чем подтверждаете набор баллов..."
                className="mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-purple-500/20 text-sm text-gray-200 outline-none focus:border-purple-500/50 transition-all resize-none placeholder:text-gray-600" />
            </label>

            {state === 'error' && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5">
                ❌ {errorMessage}
              </p>
            )}

            <button onClick={submit} disabled={!allFilled || state === 'sending'}
              className="w-full py-3 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-200 hover:bg-purple-500/30 transition-all font-mono text-sm disabled:opacity-40 disabled:cursor-not-allowed">
              {state === 'sending' ? 'Отправка...' : '📤 Отправить заявление'}
            </button>
            <p className="text-[11px] text-gray-600 text-center !mb-0">Отправляется от вашего Discord-аккаунта: {(user.user_metadata as Record<string, string | undefined>)?.full_name || 'пользователь'}</p>
          </div>
        </section>
      )}
    </PageTransition>
  );
}
