import { createClient } from 'jsr:@supabase/supabase-js@2';
import { withSubmissionCooldown } from '../_shared/submissionCooldown.ts';
import { departmentLeadershipRoles } from '../_shared/departments.ts';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(status:number,body:unknown)=>Response.json(body,{status,headers:{...cors,'Cache-Control':'no-store'}});
const roles:Record<string,string>=departmentLeadershipRoles;
const guildId='1538937566156300350', channelId='1538937568890986529', webhookId='1552405413432004609';
function webhookUrl(raw:string|undefined) {
  try { const u=new URL(raw||''); return u.protocol==='https:'&&u.hostname==='discord.com'&&!u.port&&!u.username&&!u.password&&!u.search&&!u.hash&&new RegExp(`^/api/webhooks/${webhookId}/[\\w.-]+$`).test(u.pathname)?u:null; } catch { return null; }
}
function moscowDate(date:unknown,time:unknown):Date|null {
  if(typeof date!=='string'||typeof time!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time))return null;
  const parsed=new Date(`${date}T${time}:00+03:00`);
  if(!Number.isFinite(parsed.getTime())||new Date(parsed.getTime()+3*3600000).toISOString().slice(0,16)!==`${date}T${time}`)return null;
  return parsed;
}
Deno.serve(withSubmissionCooldown(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return json(405,{error:'Method not allowed'});
  const url=Deno.env.get('SUPABASE_URL')!, anon=Deno.env.get('SUPABASE_ANON_KEY')!, service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const client=createClient(url,anon,{global:{headers:{Authorization:req.headers.get('Authorization')||''}},auth:{persistSession:false}});
  const {data:{user},error:authError}=await client.auth.getUser();
  if(authError||!user)return json(401,{error:'Войдите через Discord.'});
  const identity=user.identities?.find(i=>i.provider==='discord')?.identity_data;
  const discordId=identity?.sub;
  if(typeof discordId!=='string'||!/^\d{17,20}$/.test(discordId))return json(403,{error:'Подтвердите вход через Discord.'});
  let raw:unknown;
  try { raw=await req.json(); } catch { return json(400,{error:'Некорректные данные формы.'}); }
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return json(400,{error:'Некорректные данные формы.'});
  const body=raw as Record<string,unknown>;
  const id=typeof body.requestId==='string'?body.requestId:'';
  const leadership=typeof body.leadership==='string'?body.leadership:'';
  const reason=typeof body.reason==='string'?body.reason.trim():'';
  const start=moscowDate(body.startDate,body.startTime), end=moscowDate(body.endDate,body.endTime);
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)||!Object.hasOwn(roles,leadership)||reason.length<3||reason.length>1000||!start||!end||start.getTime()<Date.now()-60000||end<=start||end.getTime()-start.getTime()>366*86400000)return json(400,{error:'Проверьте период, причину и руководство отдела.'});
  const webhook=webhookUrl(Deno.env.get('DISCORD_VACATION_WEBHOOK_URL'));
  if(!webhook)return json(503,{error:'Заявки на отпуск временно недоступны.'});
  try { const check=await fetch(webhook,{redirect:'error',signal:AbortSignal.timeout(6000)}); const meta=check.ok?await check.json():null;
    if(meta?.id!==webhookId||meta?.channel_id!==channelId||meta?.guild_id!==guildId)return json(503,{error:'Канал заявок на отпуск недоступен.'});
  } catch { return json(503,{error:'Канал заявок на отпуск недоступен.'}); }
  const [{data:profile,error:profileError},{data:department}]=await Promise.all([
    client.from('profiles').select('game_nickname').eq('id',user.id).maybeSingle(),
    client.from('discord_department_syncs').select('department,status').eq('user_id',user.id).maybeSingle(),
  ]);
  if(profileError)return json(503,{error:'Не удалось загрузить профиль.'});
  const name=String(profile?.game_nickname||identity?.username||'Сотрудник').trim().slice(0,80)||'Сотрудник';
  const ownDepartment=department?.status==='verified'?String(department.department):'';
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:reservation,error:reservationError}=await admin.rpc('reserve_vacation',{p_id:id,p_user_id:user.id,p_name:name,p_department:ownDepartment,p_leadership:leadership,p_reason:reason,p_start:start.toISOString(),p_end:end.toISOString()});
  if(reservationError)return json(503,{error:'Не удалось сохранить заявку. Попробуйте позже.'});
  if(reservation==='delivered')return json(200,{ok:true});
  if(reservation==='overlap')return json(409,{error:'На выбранный период у вас уже есть отпуск. Проверьте личный кабинет.'});
  if(reservation!=='reserved')return json(409,{error:'Заявка уже отправляется или доставка требует проверки. Проверьте личный кабинет.',uncertain:true});
  const setStatus=async(status:string,messageId?:string)=>{
    for(let attempt=0;attempt<2;attempt++){
      try { const {error}=await admin.from('vacation_requests').update({delivery_status:status,...(messageId?{message_id:messageId}:{})}).eq('id',id).eq('user_id',user.id);if(!error)return true; } catch { /* Retry only the database write. */ }
    }
    return false;
  };
  const formatted=(value:Date)=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',dateStyle:'medium',timeStyle:'short'}).format(value);
  webhook.searchParams.set('wait','true');
  try {
    const response=await fetch(webhook,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json'},body:JSON.stringify({content:`🏖️ Заявка на отпуск от <@${discordId}>\n<@&${roles[leadership]}>`,embeds:[{title:'Отпуск сотрудника',color:0x2563eb,fields:[{name:'Сотрудник',value:name},{name:'Период',value:`${formatted(start)} — ${formatted(end)} (МСК)`},{name:'Причина',value:reason}],footer:{text:`Заявка ${id}`}}],allowed_mentions:{parse:[],users:[discordId],roles:[roles[leadership]]}})});
    if(!response.ok){if(response.status>=500){await setStatus('uncertain');return json(502,{error:'Доставка не подтверждена. Проверьте канал и обратитесь к руководству; не отправляйте повторно.',uncertain:true});}await setStatus('failed');return json(502,{error:'Discord отклонил заявку. Попробуйте позже.'});}
    const message=await response.json();
    if(typeof message.id!=='string'||!/^\d{17,20}$/.test(message.id))throw new Error('Unconfirmed delivery');
    if(!await setStatus('delivered',message.id))return json(503,{error:'Заявка отправлена в Discord, но запись на сайте не подтверждена. Не отправляйте повторно; обратитесь к руководству.',uncertain:true});
    return json(200,{ok:true});
  } catch { await setStatus('uncertain');return json(502,{error:'Доставка не подтверждена. Проверьте канал и обратитесь к руководству; не отправляйте повторно.',uncertain:true}); }
},cors));
