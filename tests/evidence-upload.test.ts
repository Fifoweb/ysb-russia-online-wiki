import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
import { allwebsImageUrl, allwebsExpiration, inspectEvidenceImage, MAX_IMAGE_BYTES } from '../supabase/functions/_shared/evidenceImages';

const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64'));
const imageUrl = 'https://allwebs.ru/images/2026/11/03/proof.png';
function compile(path: string) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    transformers: { before: [() => file => ts.factory.updateSourceFile(file, file.statements.filter(statement => !ts.isImportDeclaration(statement)))] },
  }).outputText.replace(/export /g, '');
}

test('image verification checks bytes and dimensions instead of trusting names or MIME types', () => {
  assert.deepEqual(inspectEvidenceImage(png), { mime: 'image/png', extension: 'png', width: 1, height: 1 });
  assert.equal(inspectEvidenceImage(new TextEncoder().encode('<svg onload="alert(1)"></svg>')), null);
  assert.equal(inspectEvidenceImage(new Uint8Array([137,80,78,71])), null);
  const huge = png.slice(); new DataView(huge.buffer).setUint32(16, 100_000);
  assert.equal(inspectEvidenceImage(huge), null);
  const jpeg = new Uint8Array([255,216,255,192,0,11,8,0,20,0,30,1,1,17,0,255,217]);
  assert.deepEqual(inspectEvidenceImage(jpeg), { mime: 'image/jpeg', extension: 'jpg', width: 30, height: 20 });
  const webp = new Uint8Array(30); const view = new DataView(webp.buffer);
  view.setUint32(0,0x52494646);view.setUint32(4,22,true);view.setUint32(8,0x57454250);view.setUint32(12,0x56503858);
  assert.equal(inspectEvidenceImage(webp)?.mime, 'image/webp');
  webp[20] = 2; assert.equal(inspectEvidenceImage(webp), null);
});

test('hosting results allow only original HTTPS images and never deletion URLs or arbitrary hosts', () => {
  assert.equal(allwebsImageUrl(imageUrl), imageUrl);
  for (const url of ['http://allwebs.ru/images/a.png','https://allwebs.ru.evil.test/images/a.png','https://evil.test/images/a.png',
    'https://allwebs.ru/image/a/delete/token','https://allwebs.ru/images/a.svg',imageUrl+'?token=secret','https://user:pass@allwebs.ru/images/a.png']) assert.equal(allwebsImageUrl(url), null);
  assert.equal(allwebsExpiration('2099-11-03 09:30:00'), '2099-11-03T09:30:00.000Z');
  assert.equal(allwebsExpiration('2000-11-03 09:30:00'), null);
});

function fixture(options: { anonymous?: boolean; identity?: boolean; attempt?: number; dbDown?: boolean;
  reservation?: string; hostingHttp?: number; networkError?: boolean; invalidResult?: boolean; syncDown?: boolean } = {}) {
  let handler!: (request: Request) => Promise<Response>;
  const calls: { name: string; params: Record<string, unknown> }[] = [];
  const sent: { url: string; body: FormData; headers: Record<string, string> }[] = [];
  const logs: unknown[] = [];
  const client = {
    auth: { getUser: async () => ({ error: null, data: { user: options.anonymous ? null : { id: '00000000-0000-4000-8000-000000000001',
      user_metadata: { sub: '123456789012345678' }, identities: options.identity === false ? [] : [{ provider: 'discord', identity_data: { sub: '123456789012345678' } }] } } }) },
    rpc: async (name: string, params: Record<string, unknown>) => {
      calls.push({ name, params });
      if (options.dbDown) return { data: null, error: new Error('private-secret-marker') };
      if (name === 'claim_evidence_upload_attempt') return { data: options.attempt ?? 0, error: null };
      if (name === 'reserve_evidence_upload') return { data: { result: options.reservation ?? 'reserved', ticket: 'ticket', url: imageUrl, expiresAt: '2099-01-01T00:00:00Z' }, error: null };
      if (name === 'settle_evidence_upload') return { data: !options.syncDown, error: null };
      throw new Error('Unexpected RPC');
    },
  };
  const env: Record<string,string> = { SUPABASE_URL: 'https://example.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'private-secret-marker', ALLWEBS_API_KEY: 'hosting-secret-marker' };
  const context = createContext({ Deno: { serve: (value: typeof handler) => { handler = value; }, env: { get: (key: string) => env[key] } },
    createClient: () => client, crypto: webcrypto, Request, Response, Headers, FormData, Blob, URL, AbortSignal, Uint8Array, DataView, TextDecoder,
    console: { error: (...args: unknown[]) => logs.push(args) },
    fetch: async (url: string, init: RequestInit) => {
      sent.push({ url, body: init.body as FormData, headers: init.headers as Record<string,string> });
      if (options.networkError) throw new Error('hosting-secret-marker');
      return Response.json(options.invalidResult ? { status_code: 200, image: { url: 'https://evil.test/image.png' } } :
        { status_code: 200, image: { url: imageUrl, expiration_date_gmt: '2099-11-03 09:30:00', delete_url: 'https://allwebs.ru/image/delete/private-delete-marker' } }, { status: options.hostingHttp ?? 200 });
    },
  });
  runInContext(compile('../supabase/functions/_shared/evidenceImages.ts'),context);
  runInContext(compile('../supabase/functions/upload-evidence-image/index.ts'),context);
  const submit = (bytes: Uint8Array = png, headers: Record<string,string> = {}) => handler(new Request('https://example.test/upload', {
    method: 'POST', headers: { authorization: 'Bearer site-fixture', 'Content-Type': 'image/png', ...headers }, body: bytes,
  }));
  return { submit, sent, calls, logs };
}

test('anonymous and forged-identity callers cannot read bodies, spend database quotas or contact Allwebs', async () => {
  for (const [options, status] of [[{ anonymous: true },401],[{ identity: false },403]] as const) {
    const app = fixture(options); assert.equal((await app.submit()).status,status); assert.equal(app.calls.length,0); assert.equal(app.sent.length,0);
  }
});

test('size, format, request limits and unavailable guards fail before hosting uploads', async () => {
  for (const [options, headers, bytes, status] of [
    [{ attempt: 17 }, {}, png,429], [{ dbDown: true }, {}, png,503], [{}, {'Content-Type':'text/html'},png,415],
    [{}, {'Content-Length':String(MAX_IMAGE_BYTES+1)},png,413], [{}, {},new Uint8Array(MAX_IMAGE_BYTES+1),413],
    [{}, {},new TextEncoder().encode('<html>fake.png</html>'),400], [{ reservation: 'pending' },{},png,409],
    [{ reservation: 'uncertain' },{},png,409], [{ reservation: 'limit' },{},png,429],
  ] as const) {
    const app=fixture(options);const response=await app.submit(bytes,headers);assert.equal(response.status,status);assert.equal(app.sent.length,0);
    assert.doesNotMatch(await response.text(),/private-secret-marker/);
  }
});

test('uploads preserve original bytes, use a generated filename and commit a reusable result without exposing credentials', async () => {
  const app=fixture();const response=await app.submit();assert.equal(response.status,200);
  const body=await response.json();assert.equal(body.url,imageUrl);assert.equal(body.expiresAt,'2099-11-03T09:30:00.000Z');
  assert.equal(app.sent.length,1);assert.equal(app.sent[0].url,'https://allwebs.ru/api/1/upload');
  const original=app.sent[0].body.get('source') as File;
  assert.deepEqual(new Uint8Array(await original.arrayBuffer()),png);assert.match(original.name,/^screenshot-[a-f0-9]{16}\.png$/);
  assert.equal(app.calls.find(call=>call.name==='settle_evidence_upload')?.params.p_status,'ready');
  assert.ok(app.calls.every(call=>!call.name.includes('application')&&!call.name.includes('achievement')));
  assert.doesNotMatch(JSON.stringify(body)+JSON.stringify(app.logs),/secret-marker|delete-marker/);
});

test('cached files never contact Allwebs twice and uncertain outcomes are never automatically retried', async () => {
  const cached=fixture({reservation:'ready'});assert.equal((await cached.submit()).status,200);assert.equal(cached.sent.length,0);
  for(const options of [{networkError:true},{invalidResult:true},{hostingHttp:503}]) {
    const app=fixture(options);const response=await app.submit();assert.equal(response.status,502);assert.equal(app.sent.length,1);
    assert.equal(app.calls.filter(call=>call.name==='settle_evidence_upload').at(-1)?.params.p_status,'uncertain');
    assert.doesNotMatch(await response.text()+JSON.stringify(app.logs),/secret-marker|delete-marker/);
  }
  const known=fixture({hostingHttp:400});await known.submit();assert.equal(known.calls.at(-1)?.params.p_status,'failed');
});

test('a temporary database settlement outage retains the confirmed link and retries only database writes', async () => {
  const app=fixture({syncDown:true});const response=await app.submit();assert.equal(response.status,200);
  const body=await response.json();assert.equal(body.url,imageUrl);assert.equal(body.syncPending,true);assert.equal(app.sent.length,1);
  assert.equal(app.calls.filter(call=>call.name==='settle_evidence_upload').length,3);
});

test('link insertion preserves manual text, avoids duplicates and respects single/multiple field limits', () => {
  const context=createContext({ allwebsImageUrl, MAX_IMAGE_BYTES });
  runInContext(compile('../src/lib/evidenceUpload.ts'),context);
  const insert=(value:string,url:string,multiple:boolean,max:number,count=50)=>context.insertEvidenceUrl(value,url,multiple,max,count);
  assert.equal(insert('Описание работы',imageUrl,true,1000),'Описание работы\n'+imageUrl);
  assert.equal(insert(imageUrl,imageUrl,true,1000),imageUrl);
  assert.equal(insert('https://example.test/old',imageUrl,false,300),imageUrl);
  assert.equal(insert('x'.repeat(999),imageUrl,true,1000),null);
  assert.equal(insert('https://example.test/old',imageUrl,true,1000,1),null);
});
