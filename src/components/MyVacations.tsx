import { useEffect, useState } from 'react';
import { CalendarBlank } from '@phosphor-icons/react';
import { supabase } from '../lib/supabase';
import PortalLink from './PortalLink';
import '../vacation.css';
import { vacationDate as fmt } from '../lib/vacation';

type Row={id:string;reason:string;starts_at:string;ends_at:string;delivery_status:string};
export default function MyVacations({userId,onNavigate}:{userId:string;onNavigate:(path:string)=>void}){
  const [rows,setRows]=useState<Row[]|null>(null),[error,setError]=useState(false);
  const [reload,setReload]=useState(0);
  useEffect(()=>{let active=true;setError(false);const load=async()=>{if(!supabase)return;try{const {data,error}=await supabase.from('vacation_requests').select('id,reason,starts_at,ends_at,delivery_status').eq('user_id',userId).order('starts_at',{ascending:false}).limit(20);if(active){if(error)setError(true);else{setRows(data||[]);setError(false)}}}catch{if(active)setError(true)}};void load();const timer=window.setInterval(()=>void load(),60_000);return()=>{active=false;window.clearInterval(timer)}},[userId,reload]);
  return <section className="account-panel vacation-personal" aria-labelledby="my-vacations-title"><div className="account-section-title"><CalendarBlank size={24} aria-hidden="true"/><div><h2 id="my-vacations-title">Мои отпуска</h2><p>Заявки и периоды отсутствия</p></div></div>
    {error?<p role="alert">Не удалось загрузить отпуска. <button type="button" onClick={()=>setReload(v=>v+1)}>Повторить</button></p>:!rows?<p role="status">Загружаем отпуска…</p>:!rows.length?<p>Заявок пока нет.</p>:<div className="vacation-personal-list">{rows.map(row=><article key={row.id}><strong>{row.delivery_status==='delivered'?(Date.parse(row.starts_at)>Date.now()?'Предстоящий':Date.parse(row.ends_at)>Date.now()?'В отпуске':'Завершён'):row.delivery_status==='failed'?'Не доставлено':'Доставка требует проверки'}</strong><span>{fmt(row.starts_at)} — {fmt(row.ends_at)} МСК</span><p>{row.reason}</p></article>)}</div>}
    <div className="vacation-actions"><PortalLink path="/vacation" onNavigate={onNavigate} className="portal-secondary">Подать заявку</PortalLink><PortalLink path="/vacations" onNavigate={onNavigate} className="portal-secondary">Все отпуска</PortalLink></div>
  </section>;
}
