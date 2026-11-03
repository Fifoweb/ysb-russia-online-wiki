import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CalendarBlank } from '@phosphor-icons/react';
import PageTransition from '../components/PageTransition';
import PortalLink from '../components/PortalLink';
import VacationCalendar from '../components/VacationCalendar';
import TimePicker from '../components/TimePicker';
import { ApplicationSubmitButton, SubmissionSuccess } from '../components/SubmissionFeedback';
import { useAuth } from '../lib/auth';
import { useProfile } from '../lib/useProfile';
import { invokeApplication, useApplicationCooldown } from '../lib/applicationCooldown';
import { getFunctionErrorMessage } from '../lib/functionError';
import '../vacation.css';
import { vacationPeriodError, vacationTimestamp, vacationDuration } from '../lib/vacation';

export const vacationLeadership = [
  ['senior','Старший состав'],['dps','Руководство ДПС'],['sdb','Руководство СДБ'],['ugk','Руководство УГК'],
  ['mb','Руководство МБ'],['uor','Руководство УОР'],['uku','Руководство УКУ'],['usb','Руководство УСБ'],['udk','Руководство УДК'],['ovk','Руководство ОВК'],
] as const;
export default function Vacation({ onNavigate }: { onNavigate: (path:string)=>void }) {
  const {user,loading,signInWithDiscord}=useAuth();
  const {profile}=useProfile();
  const [start,setStart]=useState(''),[end,setEnd]=useState(''),[startTime,setStartTime]=useState('12:00'),[endTime,setEndTime]=useState('12:00');
  const [leadership,setLeadership]=useState(''),[reason,setReason]=useState(''),[state,setState]=useState<'idle'|'sending'|'ok'|'error'>('idle'),[error,setError]=useState('');
  const [requestId,setRequestId]=useState(()=>crypto.randomUUID());
  const [uncertain,setUncertain]=useState(false);
  const errorRef=useRef<HTMLParagraphElement>(null);
  const cooldown=useApplicationCooldown(user?.id);
  const periodError=vacationPeriodError(start,end,startTime,endTime);
  useEffect(()=>{ if(state==='error')errorRef.current?.focus(); },[state,error]);
  useEffect(()=>{
    if(state==='ok'||!start&&!reason)return;
    const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[state,start,reason]);
  const submit=async(event:FormEvent)=>{event.preventDefault();if(!user||state==='sending'||uncertain||cooldown>0)return;
    if(periodError){setError(periodError);setState('error');return;}setState('sending');setError('');
    try{const result=await invokeApplication('submit-vacation',{body:{requestId,leadership,reason,startDate:start,endDate:end,startTime,endTime}},user.id);
      if(result.error){const response=(result.error as {context?:Response}).context;let unknownOutcome=!response;try{if(response)unknownOutcome=(await response.clone().json())?.uncertain===true;}catch{unknownOutcome=!response;}
        setUncertain(unknownOutcome);setError(await getFunctionErrorMessage(result.error,'Не удалось отправить заявку.'));setState('error');return;}setState('ok');
    }catch{setUncertain(true);setError('Доставка не подтверждена. Проверьте канал и обратитесь к руководству; не отправляйте повторно.');setState('error');}
  };
  return <PageTransition className="vacation-page"><div className="page-heading"><p className="eyebrow">Заявления сотрудников</p><h1>Заявка на отпуск</h1><p>Выберите период и отправьте заявку руководству. Время указано по Москве.</p></div>
    {loading?<p role="status">Проверяем вход…</p>:!user?<section className="panel vacation-panel"><p>Для подачи заявки войдите через Discord.</p><button type="button" className="portal-primary" onClick={()=>void signInWithDiscord('/vacation')}>Войти через Discord</button></section>:
      state==='ok'?<SubmissionSuccess title="Заявка отправлена"><p>Отпуск доступен в личном кабинете и общем списке.</p><div className="vacation-actions"><PortalLink path="/profile" onNavigate={onNavigate} className="portal-secondary">Личный кабинет</PortalLink><PortalLink path="/vacations" onNavigate={onNavigate} className="portal-secondary">Все отпуска</PortalLink><button type="button" className="portal-secondary" onClick={()=>{setRequestId(crypto.randomUUID());setState('idle');setStart('');setEnd('');setReason('');}}>Новая заявка</button></div></SubmissionSuccess>:
      <form className="vacation-form" onSubmit={submit}><VacationCalendar start={start} end={end} disabled={state==='sending'||uncertain} onChange={(a,b)=>{setStart(a);setEnd(b)}} />
        <section className="panel vacation-panel"><div className="vacation-panel-heading"><CalendarBlank size={24} aria-hidden="true"/><div><h2>Детали отпуска</h2><p>Уведомление придёт от вашего Discord-аккаунта.</p></div></div>
          <fieldset disabled={state==='sending'||uncertain} className="vacation-fields"><legend className="sr-only">Данные заявки</legend>
          <div className="vacation-time-grid"><TimePicker label="Время начала" name="startTime" value={startTime} onChange={setStartTime} disabled={state==='sending'||uncertain} /><TimePicker label="Время окончания" name="endTime" value={endTime} onChange={setEndTime} disabled={state==='sending'||uncertain} alignEnd /></div>
          <label>Какое руководство уведомить <select name="leadership" required value={leadership} onChange={e=>setLeadership(e.target.value)}><option value="">Выберите руководство</option>{vacationLeadership.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
          <label>Причина отпуска <textarea name="reason" autoComplete="off" required minLength={3} maxLength={1000} rows={4} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Например, семейные обстоятельства…" /></label>
          </fieldset>
          {start&&end&&<p className="vacation-duration" role="status">{periodError||`Длительность: ${vacationDuration(vacationTimestamp(start,startTime),vacationTimestamp(end,endTime))}`}</p>}
          <p className="vacation-note">Заявитель: {profile.game_nickname || 'ваш аккаунт Discord'}. В уведомлении будет отмечен ваш Discord.</p>
          {state==='error'&&<p ref={errorRef} tabIndex={-1} className="vacation-error" role="alert">{error}</p>}{cooldown>0&&<p className="vacation-note">Следующую заявку можно отправить через {cooldown} сек.</p>}
          {uncertain?<PortalLink path="/profile" onNavigate={onNavigate} className="portal-secondary">Проверить личный кабинет</PortalLink>:<ApplicationSubmitButton type="submit" sending={state==='sending'} disabled={!start||!end||!leadership||reason.trim().length<3||Boolean(periodError)||state==='sending'||cooldown>0}>Отправить заявку</ApplicationSubmitButton>}
        </section></form>}
  </PageTransition>;
}
