import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { currentDepartments, departmentLeadershipRoles } from '../supabase/functions/_shared/departments';
import { createDepartmentLookup, discordDepartmentRoles } from '../supabase/functions/_shared/discordDepartments';

const routes = {
  ovk: { webhook: '1567283053909512202', thread: '1540874839471165520' },
  udk: { webhook: '1567282962251128912', thread: '1540874889441972296' },
} as const;
function fixture(functionName: string, department: keyof typeof routes, wrongChannel = false) {
  const route = routes[department], posts: { url: URL; body: any }[] = [];
  let handler!: (request: Request) => Promise<Response>;
  const context = createContext({
    currentDepartments, departmentLeadershipRoles,
    Deno: { env: { get: (name: string) => name.endsWith('_PROMOTION_WEBHOOK_URL')
      ? `https://discord.com/api/webhooks/${route.webhook}/offline-marker` : 'offline' }, serve: (fn: typeof handler) => { handler = fn; } },
    withSubmissionCooldown: (fn: typeof handler) => fn,
    createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: '00000000-0000-4000-8000-00000000ff01', identities: [{ provider: 'discord', identity_data: { sub: '123456789012345678', username: 'Offline' } }], user_metadata: { sub: 'forged' } } }, error: null }) } }),
    Request, Response, URL, Date, console: { error: () => {} },
    fetch: async (input: URL, init: RequestInit = {}) => {
      const url = new URL(input);
      assert.equal(url.origin, 'https://discord.com');
      if (init.method === 'POST') { posts.push({ url, body: JSON.parse(String(init.body)) }); return Response.json({ id: '123456789012345679', channel_id: route.thread }); }
      return Response.json({ id: route.webhook, channel_id: wrongChannel ? '123456789012345678' : '1540874407080103986' });
    },
  });
  const source = ts.transpileModule(readFileSync(new URL(`../supabase/functions/${functionName}/index.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText.replace(/^import .*$/gm, '');
  runInContext(source, context);
  return { posts, submit: (body: unknown) => handler(new Request('https://example.test/form', { method: 'POST', headers: { authorization: 'Bearer offline', 'content-type': 'application/json' }, body: JSON.stringify(body) })) };
}

test('OVK and UDK department applications reach the supplied thread and notify leadership only', async () => {
  for (const department of ['ovk', 'udk'] as const) {
    const app = fixture('submit-department', department);
    assert.equal((await app.submit({ fullNameStatic: 'Offline_Officer | #1', currentRank: '5', sourceDepartment: 'dps', targetDepartment: department })).status, 200);
    const post = app.posts[0]; assert.equal(app.posts.length, 1);
    assert.equal(post.url.searchParams.get('thread_id'), routes[department].thread);
    assert.equal(post.url.searchParams.get('wait'), 'true');
    assert.deepEqual(post.body.allowed_mentions, { parse: [], roles: [departmentLeadershipRoles[department]], users: ['123456789012345678'] });
    assert.equal(post.body.embeds[0].fields.find((field: any) => field.name.includes('Выберите отдел')).value, currentDepartments.find(item => item.id === department)!.label);
  }
});

test('OVK and UDK promotion reports use their new forum webhooks and supplied threads', async () => {
  for (const department of ['ovk', 'udk'] as const) {
    const app = fixture('submit-academy-promotion-report', department);
    assert.equal((await app.submit({ department, nickStatic: 'Offline_Officer | #1', fromRank: 3, toRank: 4, evidence: 'https://allwebs.ru/offline.png' })).status, 200);
    assert.equal(app.posts.length, 1); const post = app.posts[0];
    assert.equal(post.url.pathname.split('/')[3], routes[department].webhook);
    assert.equal(post.url.searchParams.get('thread_id'), routes[department].thread);
    assert.equal(post.url.searchParams.get('wait'), 'true');
    assert.deepEqual(post.body.allowed_mentions, { parse: [], roles: [departmentLeadershipRoles[department]], users: ['123456789012345678'] });
  }
});

test('retired departments and mismatched promotion channels never receive a report', async () => {
  for (const department of ['usb', 'ukm']) {
    const app = fixture('submit-department', 'ovk');
    assert.equal((await app.submit({ fullNameStatic: 'Offline_Officer | #1', currentRank: '5', sourceDepartment: 'dps', targetDepartment: department })).status, 400);
    assert.equal(app.posts.length, 0);
  }
  const app = fixture('submit-academy-promotion-report', 'udk', true);
  assert.equal((await app.submit({ department: 'udk', nickStatic: 'Offline_Officer | #1', fromRank: 3, toRank: 4, evidence: 'https://allwebs.ru/offline.png' })).status, 503);
  assert.equal(app.posts.length, 0);
});

function promotionFixture(options: { roles?: string[]; unavailable?: boolean; missing?: boolean } = {}) {
  const posts: any[] = [], lookups: string[] = [];
  let handler!: (request: Request) => Promise<Response>;
  const context = createContext({
    currentDepartments, departmentLeadershipRoles, createDepartmentLookup,
    Deno: { env: { get: (name: string) => name === 'DISCORD_PROMOTION_WEBHOOK_URL' ? 'https://discord.com/api/webhooks/123456789012345678/offline' : 'offline' }, serve: (fn: typeof handler) => { handler = fn; } },
    withSubmissionCooldown: (fn: typeof handler) => fn,
    createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'offline', user_metadata: { department: 'dps' }, identities: [{ provider: 'discord', identity_data: { sub: '223456789012345678' } }] } }, error: null }) } }),
    Request, Response, URL, Date, console: { error: () => {} },
    fetch: async (input: URL | string, init: RequestInit = {}) => {
      const url = new URL(input);
      if (init.method === 'POST') { posts.push(JSON.parse(String(init.body))); return Response.json({ id: '123456789012345679' }); }
      if (url.pathname.includes('/webhooks/')) return Response.json({ channel_id: '1538937568429740200', guild_id: '1538937566156300350' });
      lookups.push(url.pathname);
      assert.equal((init.headers as Record<string, string>).Authorization, 'Bot offline');
      if (options.unavailable) return Response.json({}, { status: 503 });
      if (url.pathname.endsWith('/roles')) return Response.json(Object.values(discordDepartmentRoles).map(id => ({ id })));
      assert.equal(url.pathname, '/api/v10/guilds/1538937566156300350/members/223456789012345678');
      return Response.json({ user: { id: '223456789012345678' }, roles: options.roles ?? [discordDepartmentRoles.udk] }, { status: options.missing ? 404 : 200 });
    },
  });
  const source = ts.transpileModule(readFileSync(new URL('../supabase/functions/submit-promotion/index.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/^import .*$/gm, '');
  runInContext(source, context);
  const submit = (extra: Record<string, unknown> = {}) => handler(new Request('https://example.test/form', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fullNameStatic: 'Offline Officer | #1', targetRank: '5', reportUrl: 'https://discord.com/channels/1538937566156300350/123456789012345678/223456789012345678', ...extra }) }));
  return { posts, lookups, submit };
}

test('promotion requests notify only the author’s live verified department, ignoring supplied role or department IDs', async () => {
  for (const department of ['udk', 'ovk', 'dps'] as const) {
    const app = promotionFixture({ roles: [discordDepartmentRoles[department]] });
    assert.equal((await app.submit({ recipient: 'department', department: 'mb', roleId: departmentLeadershipRoles.senior })).status, 200);
    assert.deepEqual(app.posts[0].allowed_mentions, { parse: [], roles: [departmentLeadershipRoles[department]] });
    assert.equal(app.posts[0].embeds[0].fields.at(-1).value, '223456789012345678');
  }
});

test('senior recipients and old open promotion pages retain senior notification without department lookup', async () => {
  for (const extra of [{ recipient: 'senior' }, {}]) {
    const app = promotionFixture({ unavailable: true });
    assert.equal((await app.submit(extra)).status, 200);
    assert.deepEqual(app.posts[0].allowed_mentions.roles, [departmentLeadershipRoles.senior]);
    assert.equal(app.lookups.length, 0);
  }
});

test('legacy automatic recipients fail closed for unverified departments; forged recipients never send', async () => {
  for (const [options, status] of [[{ roles: [] }, 409], [{ missing: true }, 409], [{ roles: [discordDepartmentRoles.udk, discordDepartmentRoles.dps] }, 409], [{ unavailable: true }, 503]] as const) {
    const app = promotionFixture(options as { roles?: string[]; missing?: boolean; unavailable?: boolean });
    assert.equal((await app.submit({ recipient: 'department' })).status, status);
    assert.equal(app.posts.length, 0);
  }
  for(const recipient of ['unknown', '__proto__', 'constructor', '1540269491404017674', null, [], {}]){
    const app = promotionFixture(); assert.equal((await app.submit({ recipient })).status, 400); assert.equal(app.posts.length, 0);
  }
});

test('promotion authors can select any current department leadership independently of their own roles',async()=>{
  for(const department of currentDepartments){
    const app=promotionFixture({unavailable:true});
    assert.equal((await app.submit({recipient:department.id,department:'forged',roleId:'forged'})).status,200);
    assert.deepEqual(app.posts[0].allowed_mentions,{parse:[],roles:[departmentLeadershipRoles[department.id]]});
    assert.equal(app.posts[0].embeds[0].fields.find((field:any)=>field.name.includes('Кому направлено')).value,`Руководство ${department.label.split(' | ')[0]}`);
    assert.equal(app.lookups.length,0);
  }
});
