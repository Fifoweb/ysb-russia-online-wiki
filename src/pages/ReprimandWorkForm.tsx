import { useState } from 'react';
import PageTransition from '../components/PageTransition';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { getFunctionErrorMessage } from '../lib/functionError';

type State = 'idle' | 'sending' | 'ok' | 'error';

const initialForm = {
  nick: '',
  reprimandScreenshot: '',
  action: '',
  evidence: '',
};

const inputClass = 'mt-1.5 w-full px-3 py-2.5 rounded-lg bg-white/5 border border-purple-500/20 text-sm text-gray-200 outline-none focus:border-purple-500/50 transition-all placeholder:text-gray-600';

export default function ReprimandWorkForm() {
  const { user, loading, signInWithDiscord } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [state, setState] = useState<State>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const set = (key: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value }));

  const allFilled = Object.values(form).every((value) => value.trim().length > 0);

  const submit = async () => {
    if (!supabase || state === 'sending' || !allFilled) return;
    setState('sending');
    setErrorMessage('');
    try {
      const { error } = await supabase.functions.invoke('submit-reprimand-work', { body: form });
      if (error) {
        setErrorMessage(await getFunctionErrorMessage(error, 'Не удалось отправить заявку. Попробуйте позже.'));
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
    <PageTransition className="wiki-content">
      <div className="glass rounded-2xl p-8 border border-purple-500/10 mb-6">
        <h2 className="!mt-0 !mb-2">🛠️ Отработка выговора</h2>
      </div>

      {loading ? null : !user ? (
        <section className="glass rounded-2xl p-8 border border-purple-500/15 text-center">
          <p className="text-gray-400 text-sm mb-4">Для отправки заявки войдите через Discord.</p>
          <button onClick={() => signInWithDiscord()}
            className="px-5 py-2.5 rounded-xl bg-[#5865F2]/15 border border-[#5865F2]/40 text-[#8b9aff] hover:bg-[#5865F2]/25 hover:text-white transition-all text-sm font-medium">
            Войти через Discord
          </button>
        </section>
      ) : state === 'ok' ? (
        <section className="glass rounded-2xl p-8 border border-green-500/20 text-center">
          <p className="text-green-300 text-sm mb-4">Заявка на отработку выговора отправлена.</p>
          <button onClick={() => { setForm(initialForm); setState('idle'); }}
            className="px-5 py-2.5 rounded-xl bg-white/5 border border-purple-500/20 text-gray-300 hover:text-white transition-all text-sm font-mono">
            Отправить ещё одну
          </button>
        </section>
      ) : (
        <section className="glass rounded-2xl p-8 border border-purple-500/10">
          <div className="space-y-4">
            <label className="block">
              <span className="text-xs font-bold text-gray-100">Ваш никнейм | статик <span className="text-red-400">*</span></span>
              <input value={form.nick} onChange={set('nick')} maxLength={100} placeholder="Например: Kira_Comis | 155" className={inputClass} />
            </label>

            <label className="block">
              <span className="text-xs font-bold text-gray-100">Скрин вашего личного дела (планшета) с выданным выговором <span className="text-red-400">*</span></span>
              <input type="url" value={form.reprimandScreenshot} onChange={set('reprimandScreenshot')} maxLength={300} placeholder="https://..." className={inputClass} />
            </label>

            <label className="block">
              <span className="text-xs font-bold text-gray-100">Каким действием отрабатываете выговор <span className="text-red-400">*</span></span>
              <textarea value={form.action} onChange={set('action')} rows={4} maxLength={1000}
                placeholder="Опишите действие, которым отрабатываете выговор..." className={`${inputClass} resize-none`} />
            </label>

            <label className="block">
              <span className="text-xs font-bold text-gray-100">Доказательства отработки (видеозапись / скрин) <span className="text-red-400">*</span></span>
              <textarea value={form.evidence} onChange={set('evidence')} rows={4} maxLength={1000}
                placeholder="Ссылка на видеозапись или скриншот..." className={`${inputClass} resize-none`} />
            </label>

            {state === 'error' && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5">
                ❌ {errorMessage}
              </p>
            )}

            <button onClick={submit} disabled={!allFilled || state === 'sending'}
              className="w-full py-3 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-200 hover:bg-purple-500/30 transition-all font-mono text-sm disabled:opacity-40 disabled:cursor-not-allowed">
              {state === 'sending' ? 'Отправка...' : '🛠️ Отправить заявку'}
            </button>
            <p className="text-[11px] text-gray-600 text-center !mb-0">Discord ID будет добавлен в карточку автоматически.</p>
          </div>
        </section>
      )}
    </PageTransition>
  );
}
