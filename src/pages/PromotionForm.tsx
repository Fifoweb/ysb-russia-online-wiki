import { useState } from 'react';
import PageTransition from '../components/PageTransition';
import FormLoader from '../components/FormLoader';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { getFunctionErrorMessage } from '../lib/functionError';

type State = 'idle' | 'sending' | 'ok' | 'error';
const initialForm = { fullNameStatic: '', targetRank: '', reportUrl: '' };
const inputClass = 'mt-1.5 w-full px-3 py-2.5 rounded-lg bg-white/5 border border-purple-500/20 text-sm text-gray-200 outline-none focus:border-purple-500/50 transition-all placeholder:text-gray-600';

export default function PromotionForm() {
  const { user, providerToken, loading, signInWithDiscord } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [state, setState] = useState<State>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const discordId = (user?.identities?.find((identity) => identity.provider === 'discord')?.identity_data as Record<string, unknown> | null)?.sub;

  const set = (key: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const rankValid = /^(?:[1-9]|1[0-5])$/.test(form.targetRank);
  const reportUrlValid = /^https:\/\/discord\.com\/channels\/\d{17,20}\/\d{17,20}\/\d{17,20}\/?$/i.test(form.reportUrl.trim());
  const allFilled = Boolean(form.fullNameStatic.trim() && rankValid && reportUrlValid);

  const submit = async () => {
    if (!supabase || state === 'sending' || !allFilled) return;
    setState('sending');
    setErrorMessage('');
    try {
      const { error } = await supabase.functions.invoke('submit-promotion', {
        body: { ...form, discordAccessToken: providerToken },
      });
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
    <PageTransition className="wiki-content">
      <div className="glass rounded-2xl p-8 border border-purple-500/10 mb-6">
        <h2 className="!mt-0 !mb-2">⬆️ Запрос на повышение</h2>
      </div>

      {loading ? <FormLoader /> : !user ? (
        <section className="glass rounded-2xl p-8 border border-purple-500/15 text-center">
          <p className="text-gray-400 text-sm mb-4">Войдите через Discord и разрешите проверку роли.</p>
          <button onClick={() => signInWithDiscord('identify guilds.members.read')}
            className="px-5 py-2.5 rounded-xl bg-[#5865F2]/15 border border-[#5865F2]/40 text-[#8b9aff] hover:bg-[#5865F2]/25 hover:text-white transition-all text-sm font-medium">
            Войти через Discord
          </button>
        </section>
      ) : !providerToken ? (
        <section className="glass rounded-2xl p-8 border border-purple-500/15 text-center">
          <p className="text-gray-400 text-sm mb-4">Для проверки роли нужно повторно войти через Discord и разрешить доступ к сведениям о членстве на сервере.</p>
          <button onClick={() => signInWithDiscord('identify guilds.members.read')}
            className="px-5 py-2.5 rounded-xl bg-[#5865F2]/15 border border-[#5865F2]/40 text-[#8b9aff] hover:bg-[#5865F2]/25 hover:text-white transition-all text-sm font-medium">
            Продолжить через Discord
          </button>
        </section>
      ) : state === 'ok' ? (
        <section className="glass rounded-2xl p-8 border border-green-500/20 text-center">
          <p className="text-green-300 text-sm mb-4">Запрос на повышение отправлен.</p>
          <button onClick={() => { setForm(initialForm); setState('idle'); }}
            className="px-5 py-2.5 rounded-xl bg-white/5 border border-purple-500/20 text-gray-300 hover:text-white transition-all text-sm font-mono">
            Отправить ещё один
          </button>
        </section>
      ) : (
        <section className="glass rounded-2xl p-8 border border-purple-500/10">
          <div className="space-y-4">
            <label className="block">
              <span className="text-xs font-bold text-gray-100">Имя Фамилия | StaticID <span className="text-red-400">*</span></span>
              <input value={form.fullNameStatic} onChange={set('fullNameStatic')} maxLength={100} placeholder="Имя Фамилия | 75463" className={inputClass} />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-gray-100">На какой ранг повысить? <span className="text-red-400">*</span></span>
              <input type="number" min="1" max="15" inputMode="numeric" value={form.targetRank} onChange={set('targetRank')} placeholder="1–15" className={inputClass} />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-gray-100">Ссылка на отчет (ссылка на сообщение) <span className="text-red-400">*</span></span>
              <input type="url" value={form.reportUrl} onChange={set('reportUrl')} maxLength={300} placeholder="https://discord.com/channels/..." className={inputClass} />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-gray-100">Discord ID <span className="text-gray-500 font-normal">(заполняется автоматически)</span></span>
              <input readOnly value={typeof discordId === 'string' ? discordId : 'Будет добавлен при отправке'} className={`${inputClass} text-gray-500`} />
            </label>
            {state === 'error' && (
              <div className="space-y-3">
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5">{errorMessage}</p>
                <button onClick={() => signInWithDiscord('identify guilds.members.read')}
                  className="text-sm text-[#9aa8ff] hover:text-white underline underline-offset-4">Повторно подключить Discord для проверки роли</button>
              </div>
            )}
            <button onClick={submit} disabled={!allFilled || state === 'sending'}
              className="w-full py-3 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/25 transition-all font-mono text-sm disabled:opacity-40 disabled:cursor-not-allowed">
              {state === 'sending' ? 'Отправка...' : 'Отправить запрос на повышение'}
            </button>
          </div>
        </section>
      )}
    </PageTransition>
  );
}
