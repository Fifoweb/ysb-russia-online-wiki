import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';

function compile(path: string) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
    transformers: { before: [() => file => ts.factory.updateSourceFile(file,
      file.statements.filter(statement => !ts.isImportDeclaration(statement)))] },
  }).outputText.replace(/export /g, '');
}
const guardSource = compile('../supabase/functions/_shared/submissionCooldown.ts');
const names = ['submit-application', 'submit-promotion', 'submit-resign', 'submit-restore', 'submit-transfer',
  'submit-complaint', 'submit-reprimand-work', 'submit-department', 'submit-employee-complaint',
  'submit-senior-promotion-report', 'submit-academy-promotion-report'];

function fixture(options: { authorized?: boolean; cooldown?: number; dbDown?: boolean;
  authError?: { name?: string; status?: number };
  globalRetry?: number; handler?: 'ok' | 'throw'; functionName?: string; transferDelivery?: boolean } = {}) {
  let handle!: (req: Request) => Promise<Response>;
  let attempts = 0, claims = 0, releases = 0, deliveries = 0;
  const logs: unknown[][] = [];
  const payloads: { embeds: { fields: { name: string; value: string }[] }[]; allowed_mentions: { roles: string[] } }[] = [];
  const env: Record<string, string> = { SUPABASE_URL: 'https://example.test', SUPABASE_ANON_KEY: 'public-test',
    SUPABASE_SERVICE_ROLE_KEY: 'service-test',
    DISCORD_TRANSFER_WEBHOOK_URL: 'https://discord.com/api/webhooks/123456789012345678/fixture' };
  const client = {
    auth: { getUser: async () => ({ error: options.authError ?? null, data: { user: options.authorized === false ? null : {
      id: '00000000-0000-4000-8000-000000000001', user_metadata: {},
      identities: [{ provider: 'discord', identity_data: { sub: '123456789012345678', username: 'test' } }],
    } } }) },
    rpc: async (name: string) => {
      if (options.dbDown) return { data: null, error: new Error('secret-credential-marker') };
      if (name === 'claim_application_attempt') return { data: ++attempts > 5 ? 60 : options.globalRetry ?? 0, error: null };
      if (name === 'claim_application_submission') { claims++; return { data: options.cooldown ?? 0, error: null }; }
      if (name === 'release_application_submission') { releases++; return { data: null, error: null }; }
      throw new Error('Unexpected RPC');
    },
  };
  const context = createContext({ Deno: { env: { get: (key: string) => env[key] }, serve: (fn: typeof handle) => { handle = fn; } },
    createClient: () => client, console: { error: (...args: unknown[]) => logs.push(args) },
    fetch: (_url: URL, init: RequestInit) => {
      deliveries++;
      if (!options.transferDelivery) throw new Error('No network is allowed in these tests');
      payloads.push(JSON.parse(String(init.body)));
      return Promise.resolve(Response.json({ id: '234567890123456789' }));
    },
    Request, Response, Headers, URL, TextDecoder, Uint8Array, crypto: webcrypto,
  });
  runInContext(guardSource, context);
  if (options.functionName) runInContext(compile(`../supabase/functions/${options.functionName}/index.ts`), context);
  else {
    context.deliver = async (req: Request) => {
      deliveries++;
      if (options.handler === 'throw') throw new Error('secret-credential-marker');
      return Response.json({ received: await req.json() });
    };
    context.capture = (fn: typeof handle) => { handle = fn; };
    runInContext("capture(withSubmissionCooldown(deliver, { 'Access-Control-Allow-Origin': '*' }));", context);
  }
  return { logs, payloads, stats: () => ({ attempts, claims, releases, deliveries }),
    submit: (body: unknown = {}, raw?: string, headers: Record<string, string> = {}) => handle(new Request('https://example.test/form', {
      method: 'POST', headers: { Authorization: 'Bearer fixture', 'Content-Type': 'application/json', ...headers },
      body: raw ?? JSON.stringify(body),
    })),
  };
}

test('all eleven forms reject null/array/scalar JSON and wrong field types without reaching Discord', async () => {
  for (const functionName of names) {
    for (const body of [null, [], 42, 'text', { fullNameStatic: 123, type: 123, nick: 123 }]) {
      const app = fixture({ functionName });
      assert.equal((await app.submit(body)).status, 400, functionName);
      assert.equal(app.stats().deliveries, 0, functionName);
    }
  }
});

test('a valid JSON payload reaches the handler intact; successful delivery keeps the 150-second reservation', async () => {
  const app = fixture();
  const body = { name: 'Игрок', evidence: { exam: 'https://example.test/a' }, people: ['player'], fromRank: 1 };
  const response = await app.submit(body);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).received, body);
  assert.deepEqual(app.stats(), { attempts: 1, claims: 1, releases: 0, deliveries: 1 });
  const blocked = fixture({ cooldown: 150 });
  const denied = await blocked.submit(body);
  assert.equal(denied.status, 429);
  assert.equal(denied.headers.get('Retry-After'), '150');
  assert.equal(blocked.stats().deliveries, 0);
});

test('invalid attempts cannot reset the separate request limit and the sixth is denied', async () => {
  const app = fixture();
  for (let i = 0; i < 5; i++) assert.equal((await app.submit(null)).status, 400);
  const response = await app.submit(null);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '60');
  assert.equal(app.stats().claims, 0);
  assert.equal(app.stats().releases, 0);
});

test('global limit and unavailable database fail closed before delivery', async () => {
  for (const [options, status] of [[{ globalRetry: 37 }, 429], [{ dbDown: true }, 503]] as const) {
    const app = fixture(options);
    const response = await app.submit();
    assert.equal(response.status, status);
    assert.equal(app.stats().deliveries, 0);
    assert.equal(app.stats().claims, 0);
    assert.doesNotMatch(JSON.stringify(app.logs) + await response.text(), /secret-credential-marker/);
  }
});

test('a verified user submits without an additional session-record RPC', async () => {
  const app = fixture();
  assert.equal((await app.submit({ name: 'Fixture' })).status, 200);
  assert.equal(app.stats().deliveries, 1);
  assert.doesNotMatch(guardSource, /is_site_session_active|SESSION_EXPIRED/);
});

test('temporary Auth outages and throttling ask for retry without claiming the user signed out', async () => {
  for (const authError of [{ name: 'AuthRetryableFetchError' }, { status: 503 }, { status: 429 }]) {
    const app = fixture({ authError });
    const response = await app.submit();
    assert.equal(response.status, 503);
    assert.equal(app.stats().attempts, 0);
    assert.equal(app.stats().deliveries, 0);
    assert.doesNotMatch(await response.text(), /войдите|истёк|SESSION_EXPIRED/i);
  }
});

test('anonymous calls cannot consume database limit buckets', async () => {
  const app = fixture({ authorized: false });
  assert.equal((await app.submit()).status, 401);
  assert.equal(app.stats().attempts, 0);
});

test('oversized JSON including missing/false Content-Length is rejected before reservation', async () => {
  const oversized = JSON.stringify({ evidence: 'a'.repeat(16_384) });
  for (const headers of [{}, { 'Content-Length': '1' }, { 'Content-Length': String(oversized.length) }]) {
    const app = fixture();
    assert.equal((await app.submit({}, oversized, headers)).status, 413);
    assert.equal(app.stats().claims, 0);
    assert.equal(app.stats().deliveries, 0);
  }
  const invalid = fixture();
  assert.equal((await invalid.submit({}, '{')).status, 400);
  assert.equal((await fixture().submit({}, '{}', { 'Content-Type': 'text/plain' })).status, 415);
});

test('delivery exceptions release only the submission reservation and cannot leak secret-bearing error text', async () => {
  const app = fixture({ handler: 'throw' });
  const response = await app.submit();
  assert.equal(response.status, 502);
  assert.deepEqual(app.stats(), { attempts: 1, claims: 1, releases: 1, deliveries: 1 });
  assert.doesNotMatch(JSON.stringify(app.logs) + await response.text(), /secret-credential-marker/);
});

const transfer = { fullNameStatic: 'Иван Иванов | 12345', sourceFaction: 'Армия', joinDate: '2026-10-01',
  personalFileScreenshot: 'https://fotora.ru/personal.png', currentRank: '5' };
test('transfer rejects absent, invalid and oversized leader approval before any Discord delivery', async () => {
  for (const approval of [undefined, '', 'bad-url', 'javascript:alert(1)', 123, [], 'https://example.test/' + 'x'.repeat(300)]) {
    const app = fixture({ functionName: 'submit-transfer', transferDelivery: true });
    assert.equal((await app.submit({ ...transfer, leaderApprovalScreenshot: approval })).status, 400);
    assert.equal(app.stats().deliveries, 0);
  }
});
test('transfer includes the required leader approval and preserves notification roles and automatic Discord ID', async () => {
  const app = fixture({ functionName: 'submit-transfer', transferDelivery: true });
  const approval = 'https://fotora.ru/leader-approval.png';
  assert.equal((await app.submit({ ...transfer, leaderApprovalScreenshot: approval })).status, 200);
  assert.equal(app.stats().deliveries, 1);
  assert.equal(app.payloads[0].embeds[0].fields.find(field => field.name.includes('Одобрение перевода'))?.value, approval);
  assert.equal(app.payloads[0].embeds[0].fields.at(-1)?.value, '123456789012345678');
  assert.deepEqual(Array.from(app.payloads[0].allowed_mentions.roles), ['1538937566282252319','1538937566273732637']);
});
