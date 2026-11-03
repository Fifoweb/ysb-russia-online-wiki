import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';

function fixture(options: { authenticated?: boolean; status?: string; invalidDate?: boolean; rpcError?: boolean; transportError?: boolean; noStorage?: boolean } = {}) {
  const id = '00000000-0000-4000-8000-00000000ec01';
  const calls: unknown[] = [], changes: unknown[] = [];
  const returned = '2026-11-03T20:30:00.000Z';
  const context = createContext({ Promise, Date, Error, Event,
    getApplicationSession: async (userId: string) => {
      assert.equal(userId, 'owner');
      return options.authenticated === false ? { error: 'Войдите через Discord.' } : { session: { user: { id: userId } } };
    },
    supabase: { rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      if (options.transportError) throw new Error('private-marker');
      return { data: { id, status: options.status || 'ended', returned_at: options.invalidDate ? 'invalid' : returned, cancelled_at: options.invalidDate ? 'invalid' : returned }, error: options.rpcError ? 'private-marker' : null };
    } },
    localStorage: { setItem: (key: string, value: string) => { if (options.noStorage) throw new Error(); changes.push({ key, value }); } },
    window: { dispatchEvent: (event: Event) => changes.push(event.type) },
  });
  const source = ts.transpileModule(readFileSync(new URL('../src/lib/endVacation.ts', import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText.replace(/^import .*$/gm, '').replace(/export /g, '');
  runInContext(source, context);
  return { calls, changes, returned, end: () => runInContext(`endVacation('owner','${id}')`, context), cancel: () => runInContext(`cancelVacation('owner','${id}')`, context) };
}

test('early return requires the current account session and only sends the request ID', async () => {
  const app = fixture();
  assert.equal(await app.end(), app.returned);
  assert.deepEqual(JSON.parse(JSON.stringify(app.calls)), [{ name: 'end_my_vacation', args: { p_id: '00000000-0000-4000-8000-00000000ec01' } }]);
  assert.equal(app.changes.at(-1), 'vacations-changed');
  assert.ok(!JSON.stringify(app.changes).includes('owner'));
  const guest = fixture({ authenticated: false });
  await assert.rejects(guest.end(), /Войдите через Discord/);
  assert.deepEqual(guest.calls, []);
});

test('failed or invalid early return never broadcasts a successful update', async () => {
  for (const options of [{ status: 'not_found' }, { status: 'not_active' }, { invalidDate: true }, { rpcError: true }, { transportError: true }]) {
    const app = fixture(options);
    await assert.rejects(app.end(), error => error instanceof Error && !error.message.includes('private-marker'));
    assert.deepEqual(app.changes, []);
  }
});

test('blocked storage still permits confirmation and same-tab dashboard refresh', async () => {
  const app = fixture({ noStorage: true });
  assert.equal(await app.end(), app.returned);
  assert.deepEqual(app.changes, ['vacations-changed']);
});

test('cancellation uses the owner-only RPC and validates confirmation before dashboard invalidation', async () => {
  const app = fixture({ status: 'cancelled' });
  assert.equal(await app.cancel(), app.returned);
  assert.deepEqual(JSON.parse(JSON.stringify(app.calls)), [{ name: 'cancel_my_vacation', args: { p_id: '00000000-0000-4000-8000-00000000ec01' } }]);
  assert.equal(app.changes.at(-1), 'vacations-changed');
  for (const options of [{ authenticated: false }, { status: 'not_upcoming' }, { status: 'not_found' }, { status: 'cancelled', invalidDate: true }, { rpcError: true }]) {
    const invalid = fixture(options);
    await assert.rejects(invalid.cancel());
    assert.deepEqual(invalid.changes, []);
  }
});
