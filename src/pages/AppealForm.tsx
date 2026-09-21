import { useState } from 'react';
import PageTransition from '../components/PageTransition';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

type State = 'idle' | 'sending' | 'ok' | 'error';

const initialForm = {
  nick: '',
  reason: '',
  evidence: '',
  reprimandScreenshot: '',
};

export default function AppealForm() {
  const { user, loading, signInWithDiscord } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [state, setState] = useState<State>('idle');

  const set = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));

  const allFilled = form.reason.trim().length > 0 && form.evidence.trim().length > 0;

  const submit = async () => {
    if (!supabase || state === 'sending' || !allFilled) return;
    setState('sending');
    const { error } = await supabase.functions.invoke('submit-application', {
      body: { type: 'appeal', ...form },
    });
    setState(error ? 'error' : 'ok');
  };

  const inputClass = 'mt-1.5 w-full px-3 py-2.5 rounded-lg bg-white/5 border border-purple-500/20 text-sm text-gray-200 outline-none focus:border-purple-500/50 transition-all placeholder:text-gray-600';

  return (
    <PageTransition className="wiki-content">
      <div className="glass rounded-2xl p-8 border border-purple-500/10 mb-6">
        <h2 className="!mt-0 !mb-2">⚖️ Обжалование выговора</h2>
        <p className="text-sm text-gray-500 !mb-0">Заполните форму — обращение будет отправлено в отдел для рассмотрения.</p>
      </div>

      {loading ? null : !user ? (
        <section className="glass rounded-2xl p-8 border border-purple-500/15 text-center">
          <p className="text-gray-400 text-sm mb-4">🔒 Обжалование могут отправлять только авторизованные через Discord пользователи.</p>
          <button onClick={signInWithDiscord}
            className="px-5 py-2.5 rounded-xl bg-[#5865F2]/15 border border-[#5865F2]/40 text-[#8b9aff] hover:bg-[#5865F2]/25 hover:text-white transition-all text-sm font-medium">
            Войти через Discord
          </button>
        </section>
      ) : state === 'ok' ? (
        <section className="glass rounded-2xl p-8 border border-green-500/20 text-center">
          <p className="text-green-300 text-sm mb-4">✅ Обжалование выговора отправлено на рассмотрение</p>
          <button onClick={() => { setForm(initialForm); setState('idle'); }}
            className="px-5 py-2.5 rounded-xl bg-white/5 border border-purple-500/20 text-gray-300 hover:text-white transition-all text-sm font-mono">
            Отправить ещё одно
          </button>
        </section>
      ) : (
        <section className="glass rounded-2xl p-8 border border-purple-500/10">
          <div className="space-y-4">
            <label className="block">
              <span className="text-xs font-bold text-gray-100">Ваш никнейм | статик <span className="text-gray-500 font-normal">(необязательно)</span></span>
              <input value={form.nick} onChange={set('nick')} placeholder="Например: Kira_Comis | 155" maxLength={100} className={inputClass} />
            </label>

            <label className="block">
              <span className="text-xs font-bold text-gray-100">Почему вам должны обжаловать выговор <span className="text-red-400">*</span></span>
              <textarea value={form.reason} onChange={set('reason')} rows={4} maxLength={1000}
                placeholder="Опишите обстоятельства и основания для обжалования..." className={`${inputClass} resize-none`} />
            </label>

            <label className="block">
              <span className="text-xs font-bold text-gray-100">Доказательства, подтверждающие ваши слова <span className="text-red-400">*</span></span>
              <textarea value={form.evidence} onChange={set('evidence')} rows={4} maxLength={1000}
                placeholder="Ссылки на скриншоты, видео или другие допустимые доказательства..." className={`${inputClass} resize-none`} />
            </label>

            <label className="block">
              <span className="text-xs font-bold text-gray-100">Скрин с планшета с активным выговором <span className="text-gray-500 font-normal">(необязательно)</span></span>
              <input type="url" value={form.reprimandScreenshot} onChange={set('reprimandScreenshot')} placeholder="https://..." maxLength={300} className={inputClass} />
            </label>

            {state === 'error' && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5">
                ❌ Не удалось отправить. Проверьте ссылки и попробуйте ещё раз.
              </p>
            )}

            <button onClick={submit} disabled={!allFilled || state === 'sending'}
              className="w-full py-3 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-200 hover:bg-purple-500/30 transition-all font-mono text-sm disabled:opacity-40 disabled:cursor-not-allowed">
              {state === 'sending' ? 'Отправка...' : '⚖️ Отправить обжалование'}
            </button>
            <p className="text-[11px] text-gray-600 text-center !mb-0">Отправляется от вашего Discord-аккаунта: {(user.user_metadata as Record<string, string | undefined>)?.full_name || 'пользователь'}</p>
          </div>
        </section>
      )}
    </PageTransition>
  );
}
