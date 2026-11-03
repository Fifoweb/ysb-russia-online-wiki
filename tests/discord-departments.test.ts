import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { createDepartmentLookup, departmentFromRoles, discordDepartmentRoles, DepartmentLookupError } from '../supabase/functions/_shared/discordDepartments';
import { applyProfileDefaults, emptyProfile, profileDefault, profileWriteValues, readProfile, validateProfile, withDiscordDepartment } from '../src/lib/profileData';

const userId = '00000000-0000-4000-8000-000000000001';
const discordId = '123456789012345678';
const guildId = '223456789012345678';
const channelId = '323456789012345678';
const checkedAt = '2026-11-03T19:00:00.000Z';
function remote(options: { roles?: string[]; http?: number; missingRole?: boolean; malformed?: boolean } = {}) {
  const requests: { url: string; init: RequestInit }[] = [];
  const fetcher = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input); requests.push({ url, init });
    assert.equal(new URL(url).origin, 'https://discord.com');
    assert.equal(init.redirect, 'error');
    assert.equal((init.headers as Record<string,string>).Authorization, 'Bot private-bot-marker');
    assert.ok(!init.method || init.method === 'GET');
    if (url.endsWith(`/channels/${channelId}`)) return Response.json({ guild_id: guildId });
    if (url.endsWith('/roles')) return Response.json(Object.values(discordDepartmentRoles).slice(options.missingRole ? 1 : 0).map(id => ({ id })));
    assert.equal(url, `https://discord.com/api/v10/guilds/${guildId}/members/${discordId}`);
    return Response.json(options.malformed ? { user: { id: 'wrong' }, roles: [] } : { user: { id: discordId }, roles: options.roles ?? [discordDepartmentRoles.dps] }, {
      status: options.http ?? 200, headers: { 'Retry-After': '42' },
    });
  };
  return { requests, fetcher: fetcher as typeof fetch };
}

test('all eight owner-supplied membership roles map exactly; multiple departments have no implicit priority', () => {
  assert.deepEqual(Object.values(discordDepartmentRoles), ['1540267058233876530','1538937566156300355','1540267814651166812','1542230244293873805','1540267554684280852','1540267392742072320','1540267213578043434','1540267656370716693']);
  for (const [department, id] of Object.entries(discordDepartmentRoles)) assert.deepEqual(departmentFromRoles([id,id]), { department, status: 'verified' });
  assert.deepEqual(departmentFromRoles([]), { department: '', status: 'none' });
  assert.deepEqual(departmentFromRoles([discordDepartmentRoles.dps,discordDepartmentRoles.mb]), { department: '', status: 'multiple' });
  assert.deepEqual(departmentFromRoles(['1540268712282562610']), { department: '', status: 'none' }); // notification role
});

test('guild comes from the configured channel, every supplied role is checked, and discovery is cached', async () => {
  const api = remote(); const lookup = createDepartmentLookup(api.fetcher);
  for (let i=0;i<2;i++) assert.deepEqual(await lookup.lookup(discordId,'private-bot-marker',channelId), { department: 'dps', status: 'verified' });
  assert.equal(api.requests.length,4);
  assert.equal(api.requests.filter(item => item.url.endsWith('/roles')).length,1);
  const wrong = remote({ missingRole:true });
  await assert.rejects(createDepartmentLookup(wrong.fetcher).lookup(discordId,'private-bot-marker',channelId), DepartmentLookupError);
  assert.equal(wrong.requests.length,2);
});

test('missing members clear the department; malformed/provider errors never become verified membership', async () => {
  for (const [options, expected] of [[{http:404},'not_member'],[{roles:[]},'none'],[{roles:[discordDepartmentRoles.dps,discordDepartmentRoles.sdb]},'multiple']] as const) {
    const api=remote(options as Parameters<typeof remote>[0]);
    assert.deepEqual(await createDepartmentLookup(api.fetcher).lookup(discordId,'private-bot-marker',undefined,guildId), {department:'',status:expected});
  }
  for (const options of [{http:403},{http:500},{malformed:true}]) {
    const api=remote(options); await assert.rejects(createDepartmentLookup(api.fetcher).lookup(discordId,'private-bot-marker',channelId));
  }
  const limited=remote({http:429});
  await assert.rejects(createDepartmentLookup(limited.fetcher).lookup(discordId,'private-bot-marker',channelId), (error: unknown) => error instanceof DepartmentLookupError && error.retryAfter===42);
});

function compile(path: string) {
  return ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/^import .*$/gm,'').replace(/export /g,'');
}
function fixture(options: { anonymous?: boolean; identity?: boolean; claim?: unknown; claimError?: boolean; saveError?: boolean; http?: number } = {}) {
  const api=remote({http:options.http});
  const calls: {name:string; params:Record<string,unknown>}[]=[]; const logs:unknown[]=[];
  let handler!: (req: Request) => Promise<Response>;
  const client={
    auth:{getUser:async()=>({error:null,data:{user:options.anonymous?null:{id:userId,user_metadata:{sub:'forged-metadata'},identities:options.identity===false?[]:[{provider:'discord',id:'forged-identity',identity_data:{sub:discordId}}]}}})},
    rpc:async(name:string,params:Record<string,unknown>)=>{
      calls.push({name,params});
      if(name==='reserve_discord_department_sync')return{data:options.claim??{kind:'claimed',ticket:'ticket'},error:options.claimError?'private-db-marker':null};
      if(name==='complete_discord_department_sync')return{data:options.saveError?null:{department:params.p_department,status:params.p_status,checked_at:checkedAt},error:options.saveError?'private-db-marker':null};
      throw new Error('Unexpected RPC');
    },
  };
  const env:Record<string,string>={SUPABASE_URL:'https://example.test',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'private-service-marker',DISCORD_BOT_TOKEN:'private-bot-marker',DISCORD_CHANNEL_ID:channelId};
  const context=createContext({Deno:{env:{get:(key:string)=>env[key]},serve:(value:typeof handler)=>{handler=value}},createClient:()=>client,
    createDepartmentLookup:()=>createDepartmentLookup(api.fetcher),DepartmentLookupError,Request,Response,Headers,TextDecoder,console:{error:(...args:unknown[])=>logs.push(args)}});
  runInContext(compile('../supabase/functions/sync-profile-department/index.ts'),context);
  return{calls,requests:api.requests,logs,submit:(body:unknown={},method='POST')=>handler(new Request('https://example.test/sync?discordId=forged',{method,headers:{authorization:'Bearer fixture','content-type':'application/json'},...(method==='POST'?{body:JSON.stringify(body)}:{})}))};
}

test('anonymous, non-Discord and forged-body calls cannot query memberships or spend sync quotas', async () => {
  for(const [options,body,status] of [[{anonymous:true},{},401],[{identity:false},{},403],[{},{discordId:'another-user'},400],[{},[],400],[{},null,400],[{},{padding:'x'.repeat(300)},400]] as const){
    const app=fixture(options);assert.equal((await app.submit(body)).status,status);assert.deepEqual(app.calls,[]);assert.deepEqual(app.requests,[]);
  }
});

test('only the verified identity is looked up, only its auth user is updated, and no credentials escape', async () => {
  const app=fixture();const response=await app.submit();assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{department:'dps',status:'verified',checked_at:checkedAt});
  assert.equal(app.calls[0].params.p_user_id,userId);assert.equal(app.calls[1].params.p_user_id,userId);
  assert.equal(app.requests.at(-1)?.url,`https://discord.com/api/v10/guilds/${guildId}/members/${discordId}`);
  assert.ok(!JSON.stringify(app.logs).includes('private-'));
});

test('fresh cache, active leases and limits avoid Discord requests; guard failures fail closed', async () => {
  const cached=fixture({claim:{kind:'cached',result:{department:'mb',status:'verified',checked_at:checkedAt}}});
  assert.equal((await cached.submit()).status,200);assert.equal(cached.requests.length,0);
  for(const kind of ['limited','busy']){const app=fixture({claim:{kind,retryAfterSeconds:20}});const result=await app.submit();assert.equal(result.status,429);assert.equal(result.headers.get('Retry-After'),'20');assert.equal(app.requests.length,0)}
  const down=fixture({claimError:true});assert.equal((await down.submit()).status,503);assert.equal(down.requests.length,0);
  const failed=fixture({saveError:true});assert.equal((await failed.submit()).status,503);
});

test('Discord outages save an explicit unavailable result, and rate limits pause subsequent lookups', async () => {
  const app=fixture({http:429});const response=await app.submit();assert.deepEqual(await response.json(),{department:'',status:'unavailable',checked_at:checkedAt});
  assert.equal(app.calls.at(-1)?.params.p_retry_after,42);assert.ok(!JSON.stringify(app.logs).includes('private-'));
});

test('verified departments override editable legacy values; absent roles and outages cannot autofill stale membership', () => {
  const manual={...emptyProfile,game_nickname:'Test_Officer',static_id:'123',department:'usb'};
  const verified=withDiscordDepartment(manual,{department:'udk',status:'verified',checked_at:checkedAt});
  assert.equal(profileDefault(verified,'departmentLabel'),'УДК');
  for(const field of ['achievementDepartment','sourceDepartment','promotionDepartment'] as const)assert.equal(profileDefault(verified,field),'udk');
  for(const status of ['none','not_member','multiple','unavailable']){
    const profile=withDiscordDepartment(manual,{department:'',status,checked_at:checkedAt});
    assert.equal(profile.department,'');assert.deepEqual(validateProfile(profile),{});
    assert.equal(applyProfileDefaults({department:'dps'},[],profile,{department:'achievementDepartment'}).department,'');
    assert.equal(applyProfileDefaults({department:'dps'},['department'],profile,{department:'achievementDepartment'}).department,'dps');
  }
  assert.equal(withDiscordDepartment(manual,{department:'dps',status:'verified',checked_at:'invalid'}).department_status,'unavailable');
  assert.deepEqual(readProfile({}),emptyProfile);
  const write=profileWriteValues(verified);assert.ok(!('department' in write));assert.ok(!('department_status' in write));assert.ok(!('department_checked_at' in write));
});

test('profile transport uses the site JWT, keeps saved fields during Discord errors, and never writes membership claims', async () => {
  let syncDown=false;const writes:unknown[]=[];const headers:unknown[]=[];
  const stored={game_nickname:'Test_Officer',static_id:'123',department:'usb'};
  const chain={select:()=>chain,eq:()=>chain,maybeSingle:async()=>({data:stored,error:null}),single:async()=>({data:stored,error:null}),upsert:(value:unknown)=>{writes.push(value);return chain}};
  const context=createContext({supabase:{from:()=>chain,functions:{invoke:async(_name:string,options:{headers:unknown})=>{headers.push(options.headers);return{data:syncDown?null:{department:'dps',status:'verified',checked_at:checkedAt},error:syncDown?'offline':null}}}},getApplicationSession:async()=>({session:{access_token:'site-fixture',user:{identities:[{provider:'discord'}]}}}),readProfile,validateProfile,profileWriteValues,withDiscordDepartment});
  runInContext(compile('../src/lib/profile.ts'),context);
  const load=()=>runInContext(`loadProfile('${userId}')`,context);
  const first=await load();assert.equal(first.department,'dps');
  context.profile={...first,department:'mb'};await runInContext(`saveProfile('${userId}',profile)`,context);
  assert.ok(!('department' in (writes[0] as object)));assert.equal((headers[0] as {Authorization:string}).Authorization,'Bearer site-fixture');
  syncDown=true;const unavailable=await load();assert.equal(unavailable.game_nickname,'Test_Officer');assert.equal(unavailable.department,'');assert.equal(unavailable.department_status,'unavailable');
});
