import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { departmentLeadershipRoles } from '../supabase/functions/_shared/departments';

const discordId='123456789012345678', userId='00000000-0000-4000-8000-000000000001';
const testWebhook='https://discord.com/api/webhooks/1552405413432004609/offline-test-token';
const future=(days:number)=>new Date(Date.now()+days*86400000+3*3600000).toISOString().slice(0,16);
const start=future(1),end=future(2);
const input={requestId:'00000000-0000-4000-8000-000000000111',leadership:'dps',reason:'Личные обстоятельства',startDate:start.slice(0,10),startTime:start.slice(11),endDate:end.slice(0,10),endTime:end.slice(11)};
function fixture(options:{anonymous?:boolean;identity?:boolean;badChannel?:boolean;reserveFail?:boolean;reservation?:string;postStatus?:number;throwPost?:boolean;finishFail?:boolean}={}){
  let handler!:(req:Request)=>Promise<Response>;const calls:{table:string;operation:string;value?:any}[]=[];const requests:{method:string;url:string;body?:any}[]=[];const logs:unknown[]=[];
  const client={auth:{getUser:async()=>({data:{user:options.anonymous?null:{id:userId,user_metadata:{sub:'forged'},identities:options.identity===false?[]:[{provider:'discord',identity_data:{sub:discordId,username:'offline'}}]}},error:null})},
    rpc:async(name:string,value:unknown)=>{calls.push({table:name,operation:'reserve',value});return{data:options.reservation||'reserved',error:options.reserveFail?{}:null}},
    from:(table:string)=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:table==='profiles'?{game_nickname:'Test_Officer'}:{status:'verified',department:'dps'},error:null})})}),
      insert:async(value:unknown)=>{calls.push({table,operation:'insert',value});return{error:options.reserveFail?{}:null}},
      update:(value:unknown)=>({eq:()=>({eq:async()=>{calls.push({table,operation:'update',value});return{error:options.finishFail?{}:null}}})})})};
  const env:Record<string,string>={SUPABASE_URL:'https://example.test',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'private-service-marker',DISCORD_VACATION_WEBHOOK_URL:testWebhook};
  const context=createContext({departmentLeadershipRoles,Deno:{env:{get:(key:string)=>env[key]},serve:(fn:typeof handler)=>{handler=fn}},createClient:()=>client,withSubmissionCooldown:(fn:typeof handler)=>fn,Request,Response,URL,AbortSignal,Date,Intl,console:{error:(...v:unknown[])=>logs.push(v)},fetch:async(url:URL,init:RequestInit={})=>{
    const method=init.method||'GET';requests.push({method,url:String(url),body:init.body?JSON.parse(String(init.body)):undefined});
    if(method==='GET')return Response.json({id:'1552405413432004609',guild_id:'1538937566156300350',channel_id:options.badChannel?'123456789012345678':'1538937568890986529'});
    if(options.throwPost)throw new Error('private-webhook-marker');return Response.json({id:'123456789012345678'},{status:options.postStatus??200});
  }});
  const code=ts.transpileModule(readFileSync(new URL('../supabase/functions/submit-vacation/index.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/^import .*$/gm,'');
  runInContext(code,context);
  return{calls,requests,logs,submit:(body:unknown=input)=>handler(new Request('https://example.test/vacation',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer offline'},body:JSON.stringify(body)}))};
}

test('only authenticated Discord identities and valid periods can create a vacation',async()=>{
  for(const [opts,body,status] of [[{anonymous:true},input,401],[{identity:false},input,403],[{},null,400],[{},[],400],[{}, {...input,leadership:'forged'},400],[{},{...input,reason:'x'},400],[{},{...input,endDate:input.startDate,endTime:input.startTime},400],[{},{...input,startDate:'2026-02-30'},400],[{},{...input,requestId:'invalid'},400],[{badChannel:true},input,503],[{reserveFail:true},input,503],[{reservation:'overlap'},input,409],[{reservation:'uncertain'},input,409]] as const){
    const app=fixture(opts);assert.equal((await app.submit(body)).status,status);assert.equal(app.requests.filter(r=>r.method==='POST').length,0);
  }
});
test('successful delivery mentions only the authenticated author and selected leadership, then publishes',async()=>{
  for(const [leadership,role] of [['dps','1540268712282562610'],['udk','1540269491404017674'],['ovk','1540269592927019038']] as const){
    const app=fixture();const response=await app.submit({...input,leadership,discordId:'forged'});assert.equal(response.status,200);
    const post=app.requests.find(r=>r.method==='POST')!;assert.deepEqual(post.body.allowed_mentions,{parse:[],users:[discordId],roles:[role]});assert.match(post.body.content,new RegExp(discordId));assert.equal(app.calls.at(-1)?.value.delivery_status,'delivered');assert.ok(!JSON.stringify(app.logs).includes('private-'));
  }
});
test('known failure, uncertain delivery and persistence failure never publish falsely',async()=>{
  for(const [options,expected] of [[{postStatus:400},'failed'],[{postStatus:500},'uncertain'],[{throwPost:true},'uncertain']] as const){const app=fixture(options);assert.equal((await app.submit()).status,502);assert.equal(app.calls.at(-1)?.value.delivery_status,expected);}
  const app=fixture({finishFail:true});assert.equal((await app.submit()).status,503);assert.equal(app.calls.length,3);
});
test('confirmed request retries acknowledge success without a second Discord post',async()=>{
  const app=fixture({reservation:'delivered'});assert.equal((await app.submit()).status,200);assert.equal(app.requests.filter(r=>r.method==='POST').length,0);
});
