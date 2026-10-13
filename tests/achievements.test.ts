import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
import { achievementDepartments, achievementGoals, getAchievementGoalsForWeek, achievementWeekStart, canonicalEvidenceLink, parseAchievementEvidence,
  validateAchievementSubmission } from '../supabase/functions/_shared/achievements.ts';
import { buildAchievementMessage, buildAchievementMessages } from '../supabase/functions/_shared/achievementMessage.ts';

const now = new Date('2026-10-12T13:00:00+03:00');
const valid = { requestId: '00000000-0000-4000-8000-000000000001', fullName: 'Иван Иванов', staticId: '75463',
  department: 'usb', achievementId: 'fines', quantity: 12, workDate: '2026-10-12', workTime: '12:00',
  evidence: ['https://example.test/proof.png'], rulesAccepted: true };

test('Moscow week switches at Monday 00:00; new work is accepted from 00:01', () => {
  assert.equal(achievementWeekStart(new Date('2026-10-11T20:59:59Z')), '2026-10-05');
  assert.equal(achievementWeekStart(new Date('2026-10-11T21:00:00Z')), '2026-10-12');
  const monday = { ...valid, workDate: '2026-10-12', workTime: '00:01' };
  assert.ok(validateAchievementSubmission(monday, new Date('2026-10-12T00:00:59+03:00')).error);
  assert.ok(validateAchievementSubmission(monday, new Date('2026-10-12T00:01:00+03:00')).value);
  assert.ok(validateAchievementSubmission({ ...monday, workTime: '00:00' }, new Date('2026-10-12T00:02:00+03:00')).error);
  assert.ok(validateAchievementSubmission(valid, new Date('2026-10-12T00:02:00+03:00')).error);
});

test('quantities, dates, departments and proof requirements reject forged/invalid data', () => {
  assert.ok(validateAchievementSubmission(valid, now).value);
  const headquarters = validateAchievementSubmission({ ...valid, department: 'gu' }, now).value!;
  assert.ok(headquarters);
  assert.equal(buildAchievementMessage(headquarters, '123456789012345678', 'discord.user', now)
    .embeds[0].fields.find(field => field.name === '🏢 Отдел')?.value, 'ГУ ГИБДД');
  for (const patch of [{ quantity: -1 }, { quantity: 1.5 }, { quantity: '12' }, { quantity: 100000 },
    { workDate: '2026-10-11' }, { workDate: '2026-10-13' }, { workDate: '2026-02-31' },
    { department: '__proto__' }, { achievementId: 'unknown' }, { staticId: 'x' },
    { rulesAccepted: false }, { evidence: [] }, { evidence: ['javascript:alert(1)'] },
    { evidence: ['https://discord.com/api/webhooks/123/token'] }]) {
    assert.ok(validateAchievementSubmission({ ...valid, ...patch }, now).error, JSON.stringify(patch));
  }
  assert.ok(validateAchievementSubmission({ ...valid, achievementId: 'average-online', quantity: 0 }, now).value);
  assert.ok(validateAchievementSubmission({ ...valid, achievementId: 'warehouse', quantity: 2 }, now).error);
  assert.ok(validateAchievementSubmission({ ...valid, achievementId: 'warehouse', quantity: 1 }, now).value);
});

test('bulk proofs preserve all 50 links and reject canonical Discord duplicates', () => {
  const links = Array.from({ length: 50 }, (_, index) => `https://example.test/${index}.png`);
  assert.equal(parseAchievementEvidence(links.join('\n')).links.length, 50);
  assert.ok(parseAchievementEvidence([...links, 'https://example.test/51.png'].join('\n')).error);
  assert.equal(canonicalEvidenceLink('https://cdn.discordapp.com/attachments/1/2/p.png?ex=1&hm=a'),
    canonicalEvidenceLink('https://cdn.discordapp.com/attachments/1/2/p.png?ex=2&hm=b'));
  assert.ok(parseAchievementEvidence('https://example.test/a\nhttps://example.test/a#duplicate').error);
});

test('achievement departments exclude Academy, UDO and UKM without removing the graduation goal', async () => {
  assert.deepEqual(achievementDepartments.map(dept => dept.id), ['gu','usb','uku','uor','sdb','mb','ugk','dps']);
  assert.ok(achievementGoals.some(goal => goal.id === 'academy-graduates'));
  for (const department of ['academy','udo','ukm']) {
    assert.ok(validateAchievementSubmission({ ...valid, department }, now).error);
    const app = fixture();
    assert.equal((await app.submit({ ...valid, department })).status, 400);
    assert.equal(app.sent.length, 0);
  }
});

test('all ten routes match the requested threads; embeds keep Discord ID last and ping only the author', () => {
  assert.deepEqual(achievementGoals.map(goal => goal.threadId), ['1559215678722936934','1559215901226831922',
    '1559215837527932989','1559215765503086863','1559215938816180307','1559215994327535700',
    '1559216051353296916','1559216095871631372','1559216172186996827','1559216211240427641']);
  const checked = validateAchievementSubmission(valid, now).value!;
  const payload = buildAchievementMessage(checked, '123456789012345678', 'discord.user', now);
  assert.equal(payload.embeds[0].fields.at(-1)?.value, '123456789012345678');
  assert.match(payload.content, /<@123456789012345678>/);
  assert.deepEqual(payload.allowed_mentions, { parse: [], users: ['123456789012345678'] });
  assert.match(payload.embeds[0].footer.text, /Отправил ДС discord.user/);
  assert.ok(payload.embeds[0].fields.every(field => field.inline !== true && field.value.length <= 1024));
});

test('all 26 normal proof URLs appear one-per-line in Discord evidence, never above the embed or in evidence.txt', () => {
  const evidence = Array.from({ length: 26 }, (_, i) => `https://fotora.ru/image/proof-${i + 1}.png`);
  const payloads = buildAchievementMessages({ ...valid, evidence }, '123456789012345678', 'discord.user', now);
  assert.equal(payloads.length, 1);
  const msg = payloads[0];
  const evidenceFields = msg.embeds[0].fields.filter(field => field.name.includes('Доказательства'));
  assert.ok(evidenceFields.length > 0);
  const allLines = evidenceFields.flatMap(field => field.value.split('\n'));
  assert.equal(allLines.length, 26);
  assert.deepEqual(allLines, evidence.map(link => `<${link}>`));
  assert.ok(msg.embeds[0].fields.every(field => field.value.length <= 1024));
  assert.equal(msg.embeds[0].fields.at(-1)?.name, '🆔 Discord ID');
  assert.doesNotMatch(JSON.stringify(msg), /evidence\.txt|attachments/);
  assert.doesNotMatch(msg.content, /fotora\.ru/);
});

test('large evidence sets retain every link in the same thread and within Discord embed limits', () => {
  const evidence = Array.from({ length: 50 }, (_, i) => `https://fotora.ru/image/${i}-${'x'.repeat(710)}`);
  const payloads = buildAchievementMessages({ ...valid, evidence }, '123456789012345678', 'discord.user', now);
  assert.ok(payloads.length >= 2);
  const lines = payloads.flatMap(payload => payload.embeds[0].fields
    .filter(field => field.name.includes('Доказательства')).flatMap(field => field.value.split('\n')));
  assert.deepEqual(lines, evidence.map(link => `<${link}>`));
  for (const payload of payloads) {
    const embed = payload.embeds[0];
    assert.ok(embed.fields.length <= 25);
    assert.ok(embed.fields.every(field => field.value.length <= 1024));
    const total = embed.title.length + embed.fields.reduce((sum, f) => sum + f.name.length + f.value.length, 0) +
      ('footer' in embed && embed.footer ? embed.footer.text.length : 0);
    assert.ok(total <= 6000, `embed size ${total}`);
  }
  assert.deepEqual(payloads.slice(1).map(payload => payload.allowed_mentions.users), Array(payloads.length - 1).fill([]));
});

function compile(file: string) {
  return ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    transformers: { before: [() => file => ts.factory.updateSourceFile(file,
      file.statements.filter(statement => !ts.isImportDeclaration(statement)))] },
  }).outputText.replace(/export /g, '');
}

function fixture(options: { reservation?: string; http?: number; rejectPart?: number; networkError?: boolean; syncDown?: boolean;
  identity?: boolean; active?: boolean; cooldown?: number; discordError?: unknown } = {}) {
  let handler!: (req: Request) => Promise<Response>;
  const statuses: string[] = [];
  const logs: unknown[][] = [];
  const sent: { url: string; payload: ReturnType<typeof buildAchievementMessage> }[] = [];
  const client = {
    auth: { getUser: async () => ({ error: null, data: { user: { id: '00000000-0000-4000-8000-000000000001',
      user_metadata: { provider_id: '999999999999999999' }, identities: options.identity === false ? [] : [
        { provider: 'discord', identity_data: { sub: '123456789012345678', username: 'discord.user' } }],
    } } }) },
    rpc: async (name: string, params: Record<string, unknown> = {}) => {
      if (name === 'claim_achievement_attempt') return { data: 0, error: null };
      if (name === 'is_site_session_active') return { data: options.active !== false, error: null };
      if (name === 'claim_achievement_submission') return { data: options.cooldown ?? 0, error: null };
      if (name === 'release_achievement_submission') return { data: null, error: null };
      if (name === 'reserve_achievement_report') {
        assert.equal(params.p_discord_id, '123456789012345678');
        return { data: { result: options.reservation ?? 'reserved', id: 'report-fixture' }, error: null };
      }
      if (name === 'settle_achievement_report') { statuses.push(String(params.p_status)); return { data: !options.syncDown, error: null }; }
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
  class FixedDate extends Date { constructor(value?: string | number) { super(value ?? now.getTime()); } static now() { return now.getTime(); } }
  const env: Record<string, string> = { SUPABASE_URL: 'https://example.test', SUPABASE_ANON_KEY: 'fixture',
    SUPABASE_SERVICE_ROLE_KEY: 'fixture', DISCORD_ACHIEVEMENTS_WEBHOOK_URL: 'https://discord.com/api/webhooks/123456789012345678/secret-fixture-marker' };
  const context = createContext({ Date: FixedDate, Deno: { env: { get: (key: string) => env[key] }, serve: (fn: typeof handler) => { handler = fn; } },
    createClient: () => client, console: { error: (...args: unknown[]) => logs.push(args) },
    crypto: webcrypto, Request, Response, Headers, FormData, Blob, URL, AbortSignal, TextEncoder, TextDecoder, Uint8Array,
    fetch: async (url: URL, init: RequestInit) => {
      if (options.networkError) throw new Error('secret-fixture-marker');
      const payload = JSON.parse(String(init.body));
      sent.push({ url: url.toString(), payload });
      return Response.json(options.discordError ?? { id: '234567890123456789', channel_id: url.searchParams.get('thread_id') },
        { status: options.rejectPart === sent.length ? 429 : options.http ?? 200 });
    },
  });
  for (const file of ['../supabase/functions/_shared/achievements.ts', '../supabase/functions/_shared/achievementMessage.ts',
    '../supabase/functions/_shared/submissionCooldown.ts', '../supabase/functions/submit-achievement-report/index.ts']) runInContext(compile(file), context);
  return { sent, statuses, logs, submit: (body: unknown = valid) => handler(new Request('https://example.test/report', {
    method: 'POST', headers: { authorization: 'Bearer fixture', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })) };
}

test('delivery embeds complete proof list, confirms thread, then commits progress', async () => {
  const app = fixture();
  const response = await app.submit();
  assert.equal(response.status, 200);
  assert.deepEqual(app.statuses, ['sent']);
  assert.equal(new URL(app.sent[0].url).searchParams.get('thread_id'), '1559215994327535700');
  assert.ok(app.sent[0].payload.embeds[0].fields.some(field => field.name.includes('Доказательства') && field.value.includes('https://example.test/proof.png')));
  assert.equal(app.sent[0].payload.embeds[0].fields.at(-1)?.value, '123456789012345678');
});

test('new motorcycle and AirDrop reports reach their own threads; removed escort reports cannot be submitted', async () => {
  for (const [achievementId, threadId] of [['motorcyclists','1559215765503086863'],['airdrop','1559216051353296916']]) {
    const app = fixture();
    assert.equal((await app.submit({ ...valid, achievementId, quantity: 1 })).status, 200);
    assert.equal(new URL(app.sent[0].url).searchParams.get('thread_id'), threadId);
    assert.deepEqual(app.statuses, ['sent']);
  }
  const removed = fixture();
  assert.equal((await removed.submit({ ...valid, achievementId: 'escorts' })).status, 400);
  assert.equal(removed.sent.length, 0);
});

test('each current achievement sends to its replacement weekly thread', async () => {
  for (const goal of achievementGoals) {
    const app = fixture();
    assert.equal((await app.submit({ ...valid, achievementId: goal.id, quantity: 1 })).status, 200);
    assert.equal(new URL(app.sent[0].url).searchParams.get('thread_id'), goal.threadId);
    assert.deepEqual(app.statuses, ['sent']);
  }
});

test('Discord rejections explain unavailable threads and log only safe numeric diagnostics', async () => {
  for (const code of [10003, 50083, 160005]) {
    const app = fixture({ http: 400, discordError: { code, message: 'secret-fixture-marker',
      errors: { evidence: 'https://example.test/private-proof' } } });
    const response = await app.submit();
    assert.equal(response.status, 502);
    const text = await response.text();
    assert.match(text, /ветка Discord недоступна или закрыта/);
    assert.deepEqual(app.statuses, ['failed']);
    assert.equal(app.sent.length, 1);
    assert.match(JSON.stringify(app.logs), new RegExp(String(code)));
    assert.doesNotMatch(text + JSON.stringify(app.logs), /secret-fixture-marker|private-proof|discord\.user/);
  }
  const malformed = fixture({ http: 400, discordError: { code: 'secret-fixture-marker', message: 'secret-fixture-marker' } });
  const response = await malformed.submit();
  assert.match(await response.text(), /Discord отклонил отчёт/);
  assert.doesNotMatch(JSON.stringify(malformed.logs), /secret-fixture-marker/);
});
test('current week has ten goals and three exercises; archived weeks retain their old nine goals', () => {
  const current = getAchievementGoalsForWeek('2026-10-12');
  const archive = getAchievementGoalsForWeek('2026-10-05');
  assert.equal(current.length, 10);
  assert.equal(current.find(goal => goal.id === 'joint-exercises')?.target, 3);
  assert.equal(archive.length, 9);
  assert.equal(archive.find(goal => goal.id === 'joint-exercises')?.target, 2);
  assert.ok(archive.some(goal => goal.id === 'escorts'));
});

test('50 links longer than one Discord embed are all delivered vertically in one thread before counting', async () => {
  const app = fixture();
  const evidence = Array.from({ length: 50 }, (_, index) =>
    `https://fotora.ru/image/proof-${index}-${'a'.repeat(135)}`);
  assert.ok(validateAchievementSubmission({ ...valid, evidence }, now).value);
  assert.equal((await app.submit({ ...valid, evidence })).status, 200);
  assert.ok(app.sent.length >= 2);
  assert.deepEqual(app.statuses, ['sent']);
  const lines = app.sent.flatMap(part => part.payload.embeds[0].fields
    .filter(field => field.name.includes('Доказательства'))
    .flatMap(field => field.value.split('\n')));
  assert.deepEqual(lines, evidence.map(link => `<${link}>`));
  assert.ok(app.sent.every(part => new URL(part.url).searchParams.get('thread_id') === '1559215994327535700'));
});

test('failure after the first delivered evidence part is uncertain and never counted or automatically retried', async () => {
  const app = fixture({ rejectPart: 2 });
  const evidence = Array.from({ length: 50 }, (_, index) =>
    `https://fotora.ru/image/proof-${index}-${'a'.repeat(135)}`);
  assert.equal((await app.submit({ ...valid, evidence })).status, 502);
  assert.equal(app.sent.length, 2);
  assert.deepEqual(app.statuses, ['uncertain']);
});

test('duplicates, invalid identities, expired sessions and cooldown do not reach Discord', async () => {
  for (const [options, status] of [[{ reservation: 'duplicate' }, 409], [{ reservation: 'sending' }, 409],
    [{ reservation: 'sent' }, 200], [{ identity: false }, 403], [{ active: false }, 401], [{ cooldown: 10 }, 429]] as const) {
    const app = fixture(options);
    assert.equal((await app.submit()).status, status);
    assert.equal(app.sent.length, 0);
    assert.equal(app.statuses.length, 0);
  }
});

test('known failures release proofs; uncertain deliveries block resending; sync failure never resends', async () => {
  const rejected = fixture({ http: 429 });
  assert.equal((await rejected.submit()).status, 502);
  assert.deepEqual(rejected.statuses, ['failed']);
  const uncertain = fixture({ networkError: true });
  const response = await uncertain.submit();
  assert.equal(response.status, 502);
  assert.deepEqual(uncertain.statuses, ['uncertain']);
  assert.doesNotMatch(await response.text() + JSON.stringify(uncertain.logs), /secret-fixture-marker/);
  const sync = fixture({ syncDown: true });
  const synced = await sync.submit();
  assert.equal(synced.status, 202);
  assert.equal((await synced.json()).syncPending, true);
  assert.equal(sync.sent.length, 1);
});

test('the submission route is omitted from menu and search; the public dashboard links to no submission form', () => {
  for (const file of ['../src/data/navigation.ts', '../src/data/search.ts', '../src/pages/AchievementsDashboard.tsx']) {
    assert.doesNotMatch(readFileSync(new URL(file, import.meta.url), 'utf8'), /\/achievement-report/);
  }
});

test('achievement form recommends Fotora and explains evidence is shown vertically in Discord', () => {
  const page = readFileSync(new URL('../src/pages/AchievementReportForm.tsx', import.meta.url), 'utf8');
  assert.match(page, /https:\/\/fotora\.ru\//);
  assert.match(page, /«Доказательства»/);
  assert.doesNotMatch(page, /allwebs|evidence\.txt/i);
});

test('achievement submissions enforce a ten-second server interval', async () => {
  const app = fixture({ cooldown: 10 });
  const blocked = await app.submit();
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('Retry-After'), '10');
  assert.equal((await blocked.json()).retryAfterSeconds, 10);
  assert.equal(app.sent.length, 0);
  const misconfigured = fixture({ cooldown: 11 });
  assert.equal((await misconfigured.submit()).status, 503);
  assert.equal(misconfigured.sent.length, 0);
});

test('browser timers separate achievement reports from the unchanged 150-second forms and survive reload', async () => {
  const storage = new Map<string, string>();
  let clock = now.getTime();
  let result: { error: null | { context: Response }; data?: unknown } = { error: null };
  const userId = 'cooldown-fixture-user';
  storage.set('application-cooldown:' + userId, String(clock + 150000));
  const client = () => {
    let remaining = 0;
    class TimerDate extends Date { static now() { return clock; } }
    const context = createContext({
      Date: TimerDate, Event, Response,
      localStorage: { getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value) },
      window: { dispatchEvent: () => {}, setInterval: () => 1, clearInterval: () => {},
        addEventListener: () => {}, removeEventListener: () => {} },
      useState: () => [0, (value: number) => { remaining = value; }],
      useEffect: (effect: () => unknown) => effect(),
      supabase: { functions: { invoke: async () => result } },
      getApplicationSession: async () => ({ session: { access_token: 'fixture-site-token' } }),
    });
    runInContext(compile('../src/lib/applicationCooldown.ts'), context);
    return {
      remaining: (scope = 'applications') => { context.useApplicationCooldown(userId, scope); return remaining; },
      invoke: (name: string) => context.invokeApplication(name, { body: {} }, userId),
    };
  };
  const browser = client();
  assert.equal(browser.remaining(), 150);
  assert.equal(browser.remaining('achievements'), 0);
  await browser.invoke('submit-achievement-report');
  assert.equal(browser.remaining('achievements'), 10);
  assert.equal(browser.remaining(), 150);
  clock += 3000;
  assert.equal(client().remaining('achievements'), 7);
  clock += 7000;
  assert.equal(client().remaining('achievements'), 0);
  await browser.invoke('submit-transfer');
  assert.equal(browser.remaining(), 150);
  assert.equal(browser.remaining('achievements'), 0);
  result = { error: { context: Response.json({ retryAfterSeconds: 37 }, { status: 429, headers: { 'Retry-After': '37' } }) } };
  await browser.invoke('submit-achievement-report');
  assert.equal(browser.remaining('achievements'), 37); // Preserve the separate abuse limit too.
  assert.equal(browser.remaining(), 150);
  const page = readFileSync(new URL('../src/pages/AchievementReportForm.tsx', import.meta.url), 'utf8');
  assert.match(page, /useApplicationCooldown\(user\?\.id, 'achievements'\)/);
  assert.match(page, /durationSeconds=\{10\}/);
});
