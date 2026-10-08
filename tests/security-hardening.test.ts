import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function compileEdge(path: string) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  return ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
    transformers: { before: [() => file => ts.factory.updateSourceFile(file,
      file.statements.filter(statement => !ts.isImportDeclaration(statement)))] },
  }).outputText.replace(/export \{\};?\s*$/, '');
}

const applicationSource = compileEdge('../supabase/functions/submit-application/index.ts');
const interactionsSource = compileEdge('../supabase/functions/discord-interactions/index.ts');

function application(identities: unknown[]) {
  let handle!: (req: Request) => Promise<Response>;
  const sent: Record<string, any>[] = [];
  const env: Record<string, string> = {
    SUPABASE_URL: 'https://example.test', SUPABASE_ANON_KEY: 'public-key',
    DISCORD_APPEAL_WEBHOOK_URL: 'https://discord.com/api/webhooks/123456789012345678/test-secret',
  };
  runInNewContext(applicationSource, {
    Deno: { env: { get: (key: string) => env[key] }, serve: (fn: typeof handle) => { handle = fn; } },
    createClient: () => ({ auth: { getUser: async () => ({ data: { user: {
      user_metadata: { sub: '999999999999999999', user_name: 'modified username' }, identities,
    } }, error: null }) } }),
    withSubmissionCooldown: (fn: typeof handle) => fn,
    fetch: async (_url: unknown, init?: RequestInit) => {
      if (init?.method === 'POST') {
        sent.push(JSON.parse(String(init.body)));
        return Response.json({ id: 'test' });
      }
      return Response.json({ channel_id: '123456789012345678' });
    },
    Response, Headers, URL, console: { error: () => {} },
  });
  return {
    sent,
    submit: () => handle(new Request('https://example.test/submit-application', {
      method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'appeal', reason: 'Reason', evidence: 'Evidence' }),
    })),
  };
}

test('editable metadata.sub and arbitrary identity.id cannot impersonate another Discord member', async () => {
  for (const identities of [[], [{ provider: 'discord', id: '999999999999999999', identity_data: {} }],
    [{ provider: 'discord', identity_data: { sub: 'not-a-snowflake' } }]]) {
    const app = application(identities);
    assert.equal((await app.submit()).status, 403);
    assert.equal(app.sent.length, 0);
  }
});

test('verified Discord identity is accepted even when user_metadata.sub is forged', async () => {
  const app = application([{ provider: 'discord', identity_data: { sub: '123456789012345678', username: 'real-name' } }]);
  assert.equal((await app.submit()).status, 200);
  assert.equal(app.sent.length, 1);
  assert.equal(app.sent[0].embeds[0].fields.at(-1).value, '123456789012345678');
});

function interactions(db: 'ok' | 'down' = 'ok') {
  let handle!: (req: Request) => Promise<Response>;
  let claims = 0;
  const seen = new Set<string>();
  const env: Record<string, string> = {
    DISCORD_PUBLIC_KEY: 'bb'.repeat(32),
    SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_ROLE_KEY: 'server-only-test-key',
  };
  runInNewContext(interactionsSource, {
    Deno: { env: { get: (key: string) => env[key] }, serve: (fn: typeof handle) => { handle = fn; } },
    nacl: { sign: { detached: { verify: (_payload: Uint8Array, signature: Uint8Array) => signature[0] === 0xaa } } },
    createClient: () => ({ rpc: async (_name: string, params: Record<string, string>) => {
      claims++;
      if (db === 'down') return { data: null, error: new Error('offline') };
      const fresh = !seen.has(params.p_interaction_id);
      seen.add(params.p_interaction_id);
      return { data: fresh, error: null };
    } }),
    Response, Headers, URL, TextEncoder, console: { error: () => {} },
  });
  const submit = (body: unknown, age = 0, signature = 'aa'.repeat(64)) => handle(new Request('https://example.test/discord-interactions', {
    method: 'POST', headers: {
      'X-Signature-Ed25519': signature,
      'X-Signature-Timestamp': String(Math.floor(Date.now() / 1000) - age),
    }, body: JSON.stringify(body),
  }));
  return { submit, getClaims: () => claims };
}

test('expired/future-signed and invalid signatures are denied before database writes', async () => {
  const app = interactions();
  const payload = { id: '123456789012345678', type: 3, data: { custom_id: 'approve' } };
  assert.equal((await app.submit(payload, 301)).status, 401);
  assert.equal((await app.submit(payload, -301)).status, 401);
  assert.equal((await app.submit(payload, 0, '00'.repeat(64))).status, 401);
  assert.equal(app.getClaims(), 0);
});

test('replayed Discord interaction ID is processed once and duplicates get an ephemeral acknowledgement', async () => {
  const app = interactions();
  const payload = { id: '123456789012345678', type: 3, data: { custom_id: 'approve' } };
  const original = await app.submit(payload);
  assert.equal(original.status, 200);
  const again = await app.submit(payload);
  assert.equal(again.status, 200);
  const data = await again.json();
  assert.equal(data.type, 4);
  assert.match(data.data.content, /уже обработано/);
  assert.equal(app.getClaims(), 2);
  assert.equal((await app.submit({ type: 1 })).status, 200); // Discord verification PING
  assert.equal(app.getClaims(), 2);
});

test('replay protection fails closed when database RPC is unavailable', async () => {
  const app = interactions('down');
  assert.equal((await app.submit({ id: '123456789012345678', type: 3 })).status, 503);
});

test('GitHub Pages HTML uses a real meta CSP without inline JavaScript', () => {
  for (const name of ['../index.html', '../public/404.html']) {
    const html = readFileSync(new URL(name, import.meta.url), 'utf8');
    assert.match(html, /http-equiv="Content-Security-Policy"/);
    assert.match(html, /script-src 'self'/);
    assert.doesNotMatch(html, /<script\b[^>]*>\s*[^<\s]/);
  }
});
