import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
import { createAuthStorage, removeProviderTokensFromUrl, withoutProviderTokens } from '../src/lib/authSessionStorage';

const sessionKey = 'sb-project-auth-token';
const discordId = '123456789012345678';
const verifiedRole = '1538937566156300351';
const user = {
  id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated',
  app_metadata: { provider: 'discord' }, user_metadata: { full_name: 'Test player', avatar_url: 'https://example.test/avatar.png' },
  created_at: '2026-01-01T00:00:00Z',
  identities: [{ id: discordId, user_id: '00000000-0000-4000-8000-000000000001', identity_id: 'identity-test',
    provider: 'discord', created_at: '2026-01-01T00:00:00Z', identity_data: { sub: discordId, username: 'test_player' } }],
};
const siteSession = {
  access_token: 'test-site-access-token', refresh_token: 'test-site-refresh-token', token_type: 'bearer',
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user,
};
const oldSession = { ...siteSession, provider_token: 'test-discord-access-token', provider_refresh_token: 'test-discord-refresh-token' };

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

test('old Discord credentials are erased while the current login, identity and unrelated preferences survive', () => {
  const local = memoryStorage({ [sessionKey]: JSON.stringify(oldSession), discord_oauth_access_token: 'old', theme: 'dark' });
  const tab = memoryStorage({ discord_oauth_access_token: 'old', discord_oauth_user_id: discordId, draft: 'keep' });
  const storage = createAuthStorage(sessionKey, local, tab);
  assert.deepEqual(JSON.parse(storage.getItem(sessionKey)!), siteSession);
  assert.deepEqual(JSON.parse(local.getItem(sessionKey)!), siteSession);
  assert.equal(local.getItem('discord_oauth_access_token'), null);
  assert.equal(tab.getItem('discord_oauth_access_token'), null);
  assert.equal(tab.getItem('discord_oauth_user_id'), null);
  assert.equal(tab.getItem('draft'), 'keep');
  assert.equal(local.getItem('theme'), 'dark');
});

test('new and externally written sessions cannot persist provider tokens; PKCE data and logout keep working', () => {
  const local = memoryStorage();
  const storage = createAuthStorage(sessionKey, local, null);
  storage.setItem(sessionKey, JSON.stringify(oldSession));
  assert.deepEqual(JSON.parse(local.getItem(sessionKey)!), siteSession);
  local.setItem(sessionKey, JSON.stringify(oldSession));
  assert.deepEqual(JSON.parse(storage.getItem(sessionKey)!), siteSession);
  assert.deepEqual(JSON.parse(local.getItem(sessionKey)!), siteSession);
  storage.setItem(`${sessionKey}-code-verifier`, 'test-pkce-verifier');
  assert.equal(storage.getItem(`${sessionKey}-code-verifier`), 'test-pkce-verifier');
  storage.removeItem(sessionKey);
  assert.equal(storage.getItem(sessionKey), null);
});

test('the OAuth redirect retains the site tokens, path and query while removing both Discord tokens', () => {
  const url = new URL('https://fifoweb.github.io/ysb-russia-online-wiki/?next=report&provider_token=test-query-secret#access_token=test-site-access&refresh_token=test-site-refresh&expires_in=3600&token_type=bearer&provider_token=test-discord-access&provider_refresh_token=test-discord-refresh');
  assert.equal(removeProviderTokensFromUrl(url), true);
  const hash = new URLSearchParams(url.hash.slice(1));
  assert.equal(url.pathname, '/ysb-russia-online-wiki/');
  assert.equal(url.searchParams.get('next'), 'report');
  assert.equal(hash.get('access_token'), 'test-site-access');
  assert.equal(hash.get('refresh_token'), 'test-site-refresh');
  assert.equal(hash.get('expires_in'), '3600');
  assert.equal(hash.get('token_type'), 'bearer');
  assert.equal(url.searchParams.has('provider_token'), false);
  assert.equal(hash.has('provider_token'), false);
  assert.equal(hash.has('provider_refresh_token'), false);
  assert.equal(removeProviderTokensFromUrl(url), false);
  const normalUrl = new URL('https://example.test/ysb-russia-online-wiki/?q=hello#article-12');
  const original = normalUrl.href;
  assert.equal(removeProviderTokensFromUrl(normalUrl), false);
  assert.equal(normalUrl.href, original);
  const queryOnly = new URL('https://example.test/?provider_token=test-secret#article-12');
  assert.equal(removeProviderTokensFromUrl(queryOnly), true);
  assert.equal(queryOnly.hash, '#article-12');
});

test('session state retains the Discord identity and cannot expose the provider credentials', () => {
  assert.deepEqual(withoutProviderTokens(oldSession), siteSession);
  assert.equal(oldSession.provider_token, 'test-discord-access-token');
});

test('blocked browser storage keeps a sanitized login in memory and supports logout', () => {
  const blocked = {
    getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); },
  };
  const storage = createAuthStorage(sessionKey, blocked, blocked);
  storage.setItem(sessionKey, JSON.stringify(oldSession));
  assert.deepEqual(JSON.parse(storage.getItem(sessionKey)!), siteSession);
  storage.removeItem(sessionKey);
  assert.equal(storage.getItem(sessionKey), null);
});

test('the installed Supabase SDK restores an existing login with the same Discord ID and no provider credentials', async () => {
  const local = memoryStorage({ [sessionKey]: JSON.stringify(oldSession) });
  const client = createClient('https://project.example.test', 'sb_publishable_test_public_key', {
    auth: { storageKey: sessionKey, storage: createAuthStorage(sessionKey, local, null),
      autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async () => { throw new Error('Restoring a valid cached login must not send a network request'); } },
  });
  const { data, error } = await client.auth.getSession();
  assert.equal(error, null);
  assert.equal(data.session?.user.identities?.[0].identity_data?.sub, discordId);
  assert.equal(data.session?.access_token, siteSession.access_token);
  assert.equal(data.session?.refresh_token, siteSession.refresh_token);
  assert.equal(data.session?.provider_token, undefined);
  assert.equal(data.session?.provider_refresh_token, undefined);
  await client.auth.stopAutoRefresh();
});

// Run the real Edge Function handler against simulated Supabase and Discord APIs.
// Requests never leave this test process and cannot send an actual application.
const functionSource = readFileSync(new URL('../supabase/functions/submit-resign/index.ts', import.meta.url), 'utf8');
const handlerSource = ts.transpileModule(functionSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
  transformers: { before: [() => source => ts.factory.updateSourceFile(source,
    source.statements.filter(statement => !ts.isImportDeclaration(statement)))] },
}).outputText.replace(/export \{\};?\s*$/, '');

function resignation(options: { authorized?: boolean; roles?: string[]; memberStatus?: number; botConfigured?: boolean } = {}) {
  let handler!: (req: Request) => Promise<Response>;
  const calls: { url: string; method: string; authorization: string | null; body?: Record<string, any> }[] = [];
  const secrets: Record<string, string> = {
    SUPABASE_URL: 'https://project.example.test', SUPABASE_ANON_KEY: 'test-public-key',
    DISCORD_RESIGN_WEBHOOK_URL: 'https://discord.com/api/webhooks/123456789012345679/test-webhook-credential',
  };
  if (options.botConfigured !== false) secrets.DISCORD_BOT_TOKEN = 'test-server-bot-credential';
  runInNewContext(handlerSource, {
    Deno: { env: { get: (key: string) => secrets[key] }, serve: (fn: typeof handler) => { handler = fn; } },
    createClient: () => ({ auth: { getUser: async () => ({
      data: { user: options.authorized === false ? null : user }, error: null,
    }) } }),
    withSubmissionCooldown: (fn: typeof handler) => fn,
    fetch: async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method, authorization: new Headers(init?.headers).get('Authorization'),
        body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.includes('/webhooks/') && method === 'GET') {
        return Response.json({ channel_id: '1540827327674712195', guild_id: '123456789012345680' });
      }
      if (url.includes(`/members/${discordId}`)) {
        return Response.json({ user: { id: discordId }, roles: options.roles ?? [verifiedRole] },
          { status: options.memberStatus ?? 200 });
      }
      if (url.includes('/webhooks/') && method === 'POST') return Response.json({ id: 'test-message-id' });
      throw new Error('Unexpected Discord endpoint in the role check');
    },
    Response, Headers, URL, console: { error: () => {} },
  });
  return { calls, submit: () => handler(new Request('https://example.test/submit-resign', {
    method: 'POST', headers: { Authorization: 'Bearer test-site-session', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullNameStatic: 'Test Player | 12345', department: 'Test', currentRank: '5',
      recordScreenshot: 'https://example.test/record.png', discordId: '999999999999999999' }),
  })) };
}

test('resignation checks the trusted Discord ID via the bot, preserves the card and does not need a user Discord token', async () => {
  const app = resignation();
  assert.equal((await app.submit()).status, 200);
  const member = app.calls.find(call => call.url.includes('/members/'))!;
  assert.equal(member.authorization, 'Bot test-server-bot-credential');
  assert.equal(member.url.endsWith(`/members/${discordId}`), true);
  assert.equal(app.calls.some(call => call.url.includes('users/@me')), false);
  const message = app.calls.find(call => call.method === 'POST')!.body!;
  assert.equal(message.embeds[0].fields.at(-1).value, discordId);
  assert.equal(message.embeds[0].footer.text.includes('test_player'), true);
  assert.deepEqual(message.allowed_mentions, { parse: [], roles: ['1538937566273732632'] });
});

test('an absent role or guild member prevents sending a resignation', async () => {
  for (const options of [{ roles: [] }, { memberStatus: 404 }]) {
    const app = resignation(options);
    assert.equal((await app.submit()).status, 403);
    assert.equal(app.calls.some(call => call.method === 'POST'), false);
  }
});

test('missing bot credentials or Discord errors fail closed and never send a resignation', async () => {
  for (const options of [{ botConfigured: false }, ...[401, 403, 429, 500].map(memberStatus => ({ memberStatus }))]) {
    const app = resignation(options);
    assert.equal((await app.submit()).status, 503);
    assert.equal(app.calls.some(call => call.method === 'POST'), false);
  }
});

test('unauthenticated submissions do not query Discord or send messages', async () => {
  const app = resignation({ authorized: false });
  assert.equal((await app.submit()).status, 401);
  assert.equal(app.calls.length, 0);
});
