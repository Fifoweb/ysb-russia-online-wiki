import assert from 'node:assert/strict';
import test from 'node:test';
import { submissionOutcome, withSubmissionMotion } from '../src/lib/submissionMotion';

test('only confirmed delivery gets a success animation', async () => {
  assert.equal((await submissionOutcome({ data: { ok: true }, error: null })).status, 'sent');
  assert.equal((await submissionOutcome({ data: { delivery_status: 'sent' }, error: null })).status, 'sent');
  for (const data of [null, {}, { ok: false }]) assert.equal((await submissionOutcome({ data, error: null })).status, 'unconfirmed');
  assert.equal((await submissionOutcome({ data: null, error: new Error('offline') })).status, 'unconfirmed');
});

test('validation, cooldown and uncertain outcomes stay distinct and leave the form response readable', async () => {
  for (const [code, body, phase] of [
    [400, { error: 'Проверьте данные.' }, 'error'],
    [401, { error: 'Войдите через Discord.' }, 'error'],
    [429, { error: 'Повторите позже.' }, 'pending'],
    [503, { error: 'Не удалось подтвердить результат.' }, 'unconfirmed'],
    [502, { error: 'Проверьте канал.', uncertain: true }, 'unknown'],
  ] as const) {
    const response = Response.json(body, { status: code });
    const outcome = await submissionOutcome({ data: null, error: { context: response } });
    assert.equal(outcome.status, phase);
    assert.equal(outcome.message, body.error);
    assert.deepEqual(await response.json(), body);
  }
});

test('presentation preserves the exact transport result and never retries requests', async () => {
  let requests = 0;
  const response = { data: { ok: true, alreadySent: true }, error: null };
  const result = await withSubmissionMotion('submit-vacation', async () => { requests++; return response; });
  assert.equal(result, response);
  assert.equal(requests, 1);
  const failure = new Error('offline');
  await assert.rejects(withSubmissionMotion('submit-application', async () => { requests++; throw failure; }), error => error === failure);
  assert.equal(requests, 2);
});

test('a broken animation cannot prevent the server call or change its outcome', async () => {
  const scope = globalThis as unknown as { document?: unknown };
  const previous = scope.document;
  scope.document = { createElement() { throw new Error('unavailable presentation'); } };
  const result = { data: null, error: { context: Response.json({ error: 'Invalid data' }, { status: 400 }) } };
  let requests = 0;
  try {
    assert.equal(await withSubmissionMotion('submit-vacation', async () => { requests++; return result; }), result);
    assert.equal(requests, 1);
  } finally { if (previous === undefined) delete scope.document; else scope.document = previous; }
});
