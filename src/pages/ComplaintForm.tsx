import { useState } from 'react';
import PageTransition from '../components/PageTransition';
import FormLoader from '../components/FormLoader';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { getFunctionErrorMessage } from '../lib/functionError';

type State = 'idle' | 'sending' | 'ok' | 'error';

const initialForm = { offender: '', description: '', evidence: '', contactDiscord: '' };
const inputClass = 'mt-1.5 w-full px-3 py-2.5 rounded-lg bg-white/5 border border-purple-500/20 text-sm text-gray-200 outline-none focus:border-purple-500/50 transition-all placeholder:text-gray-600';

export default function ComplaintForm() {
  const { user, loading, signInWithDiscord } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [state, setState] = useState<State>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const set = (key: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value }));
  const allFilled = Boolean(form.offender.trim() && form.description.trim() && form.contactDiscord.trim());

  const submit = async () => {
    if (!supabase || state === 'sending' || !allFilled) return;
    setState('sending');
    setErrorMessage('');
    try {
      const { error } = await supabase.functions.invoke('submit-complaint', {
        body: { ...form, evidence: form.evidence.trim() },
      });
      if (error) {
        setErrorMessage(await getFunctionErrorMessage(error, 'Не удалось отправить жалобу. Попробуйте позже.'));
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
        <h2 className="!mt-0 !mb-2">Анонимные жалобы на вышестоящее руководство</h2>
        <p className="!m-0 text-sm text-slate-300">Здесь можно пожаловаться на действия начальников и вышестоящего руководства.</p>
      </div>

      {loading ? <FormLoader /> : !user ? (
        <section className="glass rounded-2xl p-8 border border-purple-500/15 text-center">
          <p className="text-gray-400 text-sm mb-4">Войдите через Discord: ID будет добавлен в карточку автоматически.</p>
          <button onClick={() => signInWithDiscord()}
            className="px-5 py-2.5 rounded-xl bg-[#5865F2]/15 border border-[#5865F2]/40 text-[#8b9aff] hover:bg-[#5865F2]/25 hover:text-white transition-all text-sm font-medium">
            Войти через Discord
          </button>
        </section>
      ) : state === 'ok' ? (
        <section className="glass rounded-2xl p-8 border border-green-500/20 text-center">
          <p className="text-green-300 text-sm mb-4">Жалоба отправлена.</p>
          <button onClick={() => { setForm(initialForm); setState('idle'); }}
            className="px-5 py-2.5 rounded-xl bg-white/5 border border-purple-500/20 text-gray-300 hover:text-white transition-all text-sm font-mono">
            Отправить ещё одну
          </button>
        </section>
      ) : (
        <section className="glass rounded-2xl p-8 border border-purple-500/10">
          <div className="space-y-4">
            <label className="block">
              <span className="text-xs font-bold text-gray-100">Никнейм / Статик нарушителя <span className="text-red-400">*</span></span>
              <input value={form.offender} onChange={set('offender')} maxLength={100} placeholder="Имя и StaticID" className={inputClass} />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-gray-100">Описание ситуации <span className="text-red-400">*</span></span>
              <textarea value={form.description} onChange={set('description')} rows={5} maxLength={1024}
                placeholder="Опишите, что произошло..." className={`${inputClass} resize-y`} />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-gray-100">Доказательства <span className="text-gray-500 font-normal">(при наличии)</span></span>
              <textarea value={form.evidence} onChange={set('evidence')} rows={3} maxLength={1000}
                placeholder="Ссылки или описание доказательств..." className={`${inputClass} resize-y`} />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-gray-100">Ваш Discord для связи <span className="text-red-400">*</span></span>
              <input value={form.contactDiscord} onChange={set('contactDiscord')} maxLength={100} placeholder="Например: username" className={inputClass} />
            </label>
            <p className="text-xs text-gray-500 !mb-0">Discord-ник и ID из авторизации будут видны сотрудникам канала; автора не упоминает.</p>
            {state === 'error' && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5">{errorMessage}</p>}
            <button onClick={submit} disabled={!allFilled || state === 'sending'}
              className="w-full py-3 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-200 hover:bg-purple-500/30 transition-all font-mono text-sm disabled:opacity-40 disabled:cursor-not-allowed">
              {state === 'sending' ? 'Отправка...' : 'Отправить жалобу'}
            </button>
          </div>
        </section>
      )}
    </PageTransition>
  );
}
