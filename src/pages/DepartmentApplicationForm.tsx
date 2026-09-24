import { useState, type ChangeEvent, type FormEvent } from 'react';
import { ArrowRight, ArrowRightLeft, CheckCircle2, Send, ShieldCheck } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import FormLoader from '../components/FormLoader';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { getFunctionErrorMessage } from '../lib/functionError';

type State = 'idle' | 'sending' | 'ok' | 'error';

const departments = [
  { id: 'ugk', label: 'УГК | Управление грузового контроля' },
  { id: 'usb', label: 'УСБ | Управление собственной безопасности' },
  { id: 'udo', label: 'УДО | Управление дорожных ситуаций' },
  { id: 'uor', label: 'УОР | Управление оперативного розыска' },
  { id: 'sdb', label: 'СДБ | Специальный дорожный батальон' },
  { id: 'uku', label: 'УКУ | Учебно-кадровое управление' },
  { id: 'dps', label: 'ДПС | Дорожно-патрульная служба' },
  { id: 'ukm', label: 'УКМ | Управление по контролю магистралей' },
  { id: 'academy', label: 'Академия' },
] as const;

const initialForm = {
  fullNameStatic: '',
  currentRank: '',
  sourceDepartment: '',
  targetDepartment: '',
};
const inputClass = 'mt-2 w-full px-4 py-3 text-sm outline-none';

export default function DepartmentApplicationForm() {
  const { user, loading, signInWithDiscord } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [state, setState] = useState<State>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const discordId = (user?.identities?.find((identity) => identity.provider === 'discord')?.identity_data as
    Record<string, unknown> | null)?.sub;

  const update = (key: keyof typeof initialForm) =>
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = event.target.value;
      setForm((current) => ({
        ...current,
        [key]: value,
        ...(key === 'sourceDepartment' && value === current.targetDepartment ? { targetDepartment: '' } : {}),
      }));
      if (state === 'error') { setState('idle'); setErrorMessage(''); }
    };

  const rankValid = /^(?:[1-9]|1[0-5])$/.test(form.currentRank);
  const allFilled = Boolean(form.fullNameStatic.trim() && rankValid && form.sourceDepartment &&
    form.targetDepartment && form.sourceDepartment !== form.targetDepartment);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !user || state === 'sending' || !allFilled) return;
    setState('sending');
    setErrorMessage('');
    try {
      const { error } = await supabase.functions.invoke('submit-department', { body: form });
      if (error) {
        setErrorMessage(await getFunctionErrorMessage(error, 'Не удалось отправить заявку. Попробуйте ещё раз.'));
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
        <span className="application-heading-icon" aria-hidden="true"><ArrowRightLeft size={26} /></span>
        <div>
          <p className="eyebrow">КАДРОВЫЕ ЗАЯВКИ · ОТДЕЛЫ</p>
          <h2 className="!mt-0 !mb-2">Заявки в отдел</h2>
          <p className="!m-0 text-sm text-slate-300">Выберите, из какого отдела переводитесь и куда хотите подать заявку.</p>
        </div>
      </div>

      {loading ? <FormLoader /> : !user ? (
        <section className="glass rounded-2xl border border-sky-300/20 text-center">
          <ShieldCheck size={32} className="mx-auto mb-4 text-sky-300" aria-hidden="true" />
          <p className="text-slate-200 text-sm mb-5">Для подачи заявки войдите через Discord.</p>
          <button type="button" onClick={() => signInWithDiscord()} className="primary-button mx-auto">
            Войти через Discord <ArrowRight size={16} aria-hidden="true" />
          </button>
        </section>
      ) : state === 'ok' ? (
        <section className="glass rounded-2xl border border-emerald-400/25 text-center" role="status">
          <CheckCircle2 size={34} className="mx-auto mb-4 text-emerald-300" aria-hidden="true" />
          <p className="text-emerald-200 text-base font-semibold mb-5">Заявка в отдел отправлена</p>
          <button type="button" onClick={() => { setForm(initialForm); setErrorMessage(''); setState('idle'); }}
            className="secondary-button mx-auto">Подать ещё одну</button>
        </section>
      ) : (
        <section className="glass rounded-2xl border border-sky-300/15">
          <form onSubmit={submit} className="space-y-6">
            <div>
              <p className="eyebrow mb-2">01 · ДАННЫЕ СОТРУДНИКА</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <label htmlFor="department-name" className="block">
                  <span>Имя Фамилия | StaticID <span className="text-rose-300">*</span></span>
                  <input id="department-name" value={form.fullNameStatic} onChange={update('fullNameStatic')}
                    maxLength={100} required placeholder="Иван Иванов | 75463" className={inputClass} />
                </label>
                <label htmlFor="department-rank" className="block">
                  <span>Ваш текущий ранг <span className="text-rose-300">*</span></span>
                  <input id="department-rank" type="number" min="1" max="15" inputMode="numeric"
                    value={form.currentRank} onChange={update('currentRank')} required placeholder="От 1 до 15"
                    className={inputClass} />
                </label>
              </div>
            </div>

            <div className="border-t border-sky-300/15 pt-6">
              <p className="eyebrow mb-2">02 · МАРШРУТ ЗАЯВКИ</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <label htmlFor="department-source" className="block">
                  <span>Из какого отдела переводитесь? <span className="text-rose-300">*</span></span>
                  <select id="department-source" value={form.sourceDepartment}
                    onChange={update('sourceDepartment')} required className={inputClass}>
                    <option value="">Выберите текущий отдел</option>
                    {departments.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                </label>
                <label htmlFor="department-target" className="block">
                  <span>В какой отдел подаёте заявку? <span className="text-rose-300">*</span></span>
                  <select id="department-target" value={form.targetDepartment}
                    onChange={update('targetDepartment')} required className={inputClass}>
                    <option value="">Выберите отдел назначения</option>
                    {departments.filter((item) => item.id !== form.sourceDepartment)
                      .map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                </label>
              </div>
            </div>

            <div className="border-t border-sky-300/15 pt-5">
              <label htmlFor="department-discord" className="block">
                <span>Discord ID <span className="font-normal text-slate-400">(заполняется автоматически)</span></span>
                <input id="department-discord" readOnly value={typeof discordId === 'string' ? discordId : 'Будет добавлен при отправке'}
                  className={inputClass} />
              </label>
              <p className="application-note">Заявка отправится от вашего Discord-аккаунта.</p>
            </div>

            {state === 'error' && (
              <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {errorMessage}
              </p>
            )}
            <button type="submit" disabled={!allFilled || state === 'sending'}
              className="primary-button w-full justify-center !py-3.5">
              {state === 'sending' ? 'Отправка…' : 'Отправить заявку в отдел'}
              {state !== 'sending' && <Send size={17} aria-hidden="true" />}
            </button>
          </form>
        </section>
      )}
    </PageTransition>
  );
}
