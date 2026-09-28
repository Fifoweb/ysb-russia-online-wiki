import { useState } from 'react';
import { ArrowRight, CheckCircle2, Send, ShieldCheck, TrendingUp } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import FormLoader from '../components/FormLoader';
import ApplicationCooldownBanner from '../components/ApplicationCooldownBanner';
import ApplicationSubmitHint from '../components/ApplicationSubmitHint';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { getFunctionErrorMessage } from '../lib/functionError';
import { invokeApplication, useApplicationCooldown } from '../lib/applicationCooldown';

type State = 'idle' | 'sending' | 'ok' | 'error';
type RankTransition = '' | '1-2' | '2-3';
type EvidenceKey = 'governmentId' | 'exam' | 'practice' | 'stateFractionRole';
const blankEvidence = { governmentId: '', exam: '', practice: '', stateFractionRole: '' };
const inputClass = 'mt-2 w-full px-4 py-3 text-sm outline-none';

function validEvidenceUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      ['imgur.com', 'fotora.ru', 'yapx.ru'].some(domain => host === domain || host.endsWith(`.${domain}`));
  } catch { return false; }
}

export default function AcademyPromotionReportForm() {
  const { user, loading, signInWithDiscord } = useAuth();
  const [nickStatic, setNickStatic] = useState('');
  const [rankTransition, setRankTransition] = useState<RankTransition>('');
  const [evidence, setEvidence] = useState(blankEvidence);
  const [state, setState] = useState<State>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const remainingSeconds = useApplicationCooldown(user?.id);
  const identity = user?.identities?.find(item => item.provider === 'discord')?.identity_data as Record<string, unknown> | undefined;
  const discordId = typeof identity?.sub === 'string' ? identity.sub : 'Будет добавлен при отправке';
  const discordName = typeof identity?.username === 'string' ? identity.username : 'Будет добавлено при отправке';

  const fields: { key: EvidenceKey; label: string }[] = rankTransition === '1-2' ? [
    { key: 'governmentId', label: 'Удостоверение, полученное в Правительстве' },
    { key: 'exam', label: 'Экзамен: строевая подготовка, субординация, радиообмен и устав' },
    { key: 'practice', label: 'Практика: трафик-стоп, разбор статей и выписка штрафа' },
    { key: 'stateFractionRole', label: 'Полученная роль на сервере State Fraction' },
  ] : rankTransition === '2-3' ? [
    { key: 'exam', label: 'Экзамен по КоАП, УК и УПК' },
    { key: 'practice', label: 'Практика по УПК' },
  ] : [];
  const incompleteReason = !nickStatic.trim() ? 'Укажите никнейм и #статик.'
    : !rankTransition ? 'Выберите повышение: с 1 на 2 или с 2 на 3.'
    : fields.find(field => !evidence[field.key].trim()) ? 'Приложите ссылки ко всем заданиям.'
    : fields.find(field => !validEvidenceUrl(evidence[field.key])) ? 'Ссылки должны вести на Imgur, Fotora или Япикс по HTTPS.'
    : undefined;

  const submit = async () => {
    if (!supabase || !user || state === 'sending' || remainingSeconds > 0 || incompleteReason) return;
    setState('sending');
    setErrorMessage('');
    try {
      const selectedEvidence = Object.fromEntries(fields.map(field => [field.key, evidence[field.key].trim()]));
      const { error } = await invokeApplication('submit-academy-promotion-report', {
        body: { nickStatic: nickStatic.trim(), rankTransition, evidence: selectedEvidence },
      }, user.id);
      if (error) {
        setErrorMessage(await getFunctionErrorMessage(error, 'Не удалось отправить отчёт. Проверьте данные и попробуйте снова.'));
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
          <h2 className="!mt-0 !mb-2">Отчёт на повышение</h2>
          <p className="!m-0 text-sm text-slate-300">Выберите подразделение и повышение — ниже появятся задания для выбранного ранга.</p>
        </div>
      </div>

      {user && <ApplicationCooldownBanner seconds={remainingSeconds} />}
      {loading ? <FormLoader /> : !user ? (
        <section className="glass rounded-2xl border border-sky-300/20 text-center">
          <ShieldCheck size={32} className="mx-auto mb-4 text-sky-300" aria-hidden="true" />
          <p className="text-slate-200 text-sm mb-5">Войдите через Discord, чтобы отправить отчёт.</p>
          <button type="button" onClick={() => signInWithDiscord()} className="primary-button mx-auto">
            Войти через Discord <ArrowRight size={16} aria-hidden="true" />
          </button>
        </section>
      ) : state === 'ok' ? (
        <section className="glass rounded-2xl border border-emerald-400/25 text-center" role="status">
          <CheckCircle2 size={34} className="mx-auto mb-4 text-emerald-300" aria-hidden="true" />
          <p className="text-emerald-200 text-base font-semibold mb-5">Отчёт на повышение отправлен</p>
          <button type="button" onClick={() => { setNickStatic(''); setRankTransition(''); setEvidence(blankEvidence); setState('idle'); }} className="secondary-button mx-auto">
            Заполнить новый отчёт
          </button>
        </section>
      ) : (
        <section className="glass rounded-2xl border border-sky-300/15">
          <div className="space-y-6">
            <div>
              <p className="eyebrow mb-2">01 · СОТРУДНИК И ПОВЫШЕНИЕ</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <label className="block">
                  <span>Ваш никнейм и #статик <span className="text-rose-300">*</span></span>
                  <input value={nickStatic} onChange={event => setNickStatic(event.target.value)} maxLength={100} placeholder="Никнейм | #12345" className={inputClass} />
                </label>
                <label className="block">
                  <span>Подразделение</span>
                  <select defaultValue="academy" className={inputClass}>
                    <option value="academy">Академия</option>
                  </select>
                  <span className="mt-2 block text-xs text-slate-400">Пока доступна только Академия.</span>
                </label>
                <label className="block">
                  <span>На какой ранг повышаетесь <span className="text-rose-300">*</span></span>
                  <select value={rankTransition} onChange={event => { setRankTransition(event.target.value as RankTransition); setEvidence(blankEvidence); }} className={inputClass}>
                    <option value="">Выберите повышение</option>
                    <option value="1-2">Рядовой (1) → Младший сержант (2)</option>
                    <option value="2-3">Младший сержант (2) → Сержант (3)</option>
                  </select>
                </label>
              </div>
            </div>

            {rankTransition && (
              <div className="border-t border-sky-300/15 pt-6">
                <p className="eyebrow mb-2">02 · ДОКАЗАТЕЛЬСТВА</p>
                <div className="space-y-4">
                  {fields.map((field, index) => (
                    <label key={field.key} className="block">
                      <span>{index + 1}. {field.label} <span className="text-rose-300">*</span></span>
                      <input type="url" value={evidence[field.key]} onChange={event => setEvidence(current => ({ ...current, [field.key]: event.target.value }))}
                        maxLength={500} placeholder="https://imgur.com/..." className={inputClass}
                        aria-invalid={Boolean(evidence[field.key].trim()) && !validEvidenceUrl(evidence[field.key])} />
                    </label>
                  ))}
                </div>
                <p className="application-note">Во время выполнения заданий включайте бодикамеру, иначе отчёт отклонят. Скриншоты принимаются только через Imgur, Fotora или Япикс.</p>
                <p className="application-note">Запись на экзамен и практику — в канале «📝・запись-на-экзамен».</p>
                {rankTransition === '1-2' && <p className="application-note">Для роли State Fraction сначала <a href="https://discord.gg/DUYKbzwG2" target="_blank" rel="noopener noreferrer">вступите на сервер</a>, затем перейдите в канал «получение-роли» и приложите скриншот полученной роли.</p>}
              </div>
            )}

            <div className="border-t border-sky-300/15 pt-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
              <label className="block">
                <span>Ник Discord <span className="font-normal text-slate-400">(автоматически)</span></span>
                <input readOnly value={discordName} className={inputClass} />
              </label>
              <label className="block">
                <span>Discord ID <span className="font-normal text-slate-400">(автоматически)</span></span>
                <input readOnly value={discordId} className={inputClass} />
              </label>
            </div>
            {state === 'error' && <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{errorMessage}</p>}
            <ApplicationSubmitHint reason={incompleteReason} remainingSeconds={remainingSeconds} sending={state === 'sending'} />
            <button type="button" onClick={submit} disabled={Boolean(incompleteReason) || state === 'sending' || remainingSeconds > 0}
              className="primary-button w-full justify-center !py-3.5">
              {state === 'sending' ? 'Отправка…' : 'Отправить отчёт'}
              {state !== 'sending' && <Send size={17} aria-hidden="true" />}
            </button>
          </div>
        </section>
      )}
    </PageTransition>
  );
}
