import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { currentDepartments, departmentLeadershipRoles } from '../supabase/functions/_shared/departments';

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
