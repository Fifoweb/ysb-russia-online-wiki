import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
import { FunctionRegion } from '@supabase/supabase-js';
import { evidenceHostingUrl, fotoraAlbumUrl, MAX_ALBUM_BYTES } from '../supabase/functions/_shared/evidenceImages';
import { evidenceProvider, planEvidenceUploads } from '../src/lib/evidenceUploadPlan';

const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64'));
const albumUrl = 'https://fotora.ru/uploaded/?ID=TESTALBUM123';
function compile(path: string) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    transformers: { before: [() => file => ts.factory.updateSourceFile(file, file.statements.filter(statement => !ts.isImportDeclaration(statement)))] },
  }).outputText.replace(/export /g, '');
}

test('all selection sizes temporarily use Fotora; every album respects the byte budget without losing order', () => {
  for (const count of [1, 9, 10]) assert.equal(evidenceProvider(count), 'fotora');
  for (const count of [11, 12, 50]) assert.equal(evidenceProvider(count), 'fotora');
  const files = Array.from({ length: 50 }, (_, id) => ({ id, size: 3 * 1024 * 1024 }));
  const albums = planEvidenceUploads(files, 'fotora');
  assert.deepEqual(albums.flat(), files);assert.ok(albums.every(group => group.reduce((sum,file)=>sum+file.size,0)<=MAX_ALBUM_BYTES));
  assert.equal(planEvidenceUploads(files.slice(0,10),'allwebs').length,10);
});

test('Fotora album URLs are canonical and reject private actions, alternate hosts and extra parameters', () => {
  assert.equal(fotoraAlbumUrl('https://fotora.ru/uploaded?ID=TESTALBUM123'),albumUrl);
  assert.equal(evidenceHostingUrl(albumUrl),albumUrl);
  for(const value of ['http://fotora.ru/uploaded/?ID=TESTALBUM123',albumUrl+'&download_images=1',albumUrl+'#delete',
    'https://fotora.ru.evil.test/uploaded/?ID=TESTALBUM123','https://user:secret@fotora.ru/uploaded/?ID=TESTALBUM123',
    'https://fotora.ru/create-album/','https://fotora.ru/uploaded/?ID=%2fetc%2fpasswd']) assert.equal(fotoraAlbumUrl(value),null);
});

function protocolFixture(options: { failAt?: number; captcha?: boolean; redirect?: string; galleryCount?: number; photoCount?: number; direct?: boolean } = {}) {
  const calls: { url: string; method: string; cookie: string | null; form?: FormData }[] = [];
  let closed = false;
  const context = createContext({ Request, Response, Headers, FormData, File, Blob, URL, AbortSignal, Uint8Array, DataView, TextDecoder, Map,
    Deno: { createHttpClient: () => ({ close() { closed = true; } }) },
    fetch: async (url: string, init: RequestInit) => {
      const headers=new Headers(init.headers),form=init.body ? await new Request(url,init).formData() : undefined;
      calls.push({url,method:init.method!,cookie:headers.get('cookie'),form});
      if(calls.length===options.failAt)throw new Error('private-cookie-marker');
      if(calls.length===1)return new Response('<form><input name="uploadFiles[]">'+(options.captcha?'<div class="cf-turnstile"></div>':'')+'</form>',{headers:{'Set-Cookie':'PHPSESSID=private-cookie-marker; Path=/; Secure; HttpOnly'}});
      if(calls.length===2)return new Response('<script>window.location.href="'+(options.direct?'/uploaded?ID=TESTALBUM123':'/create-album')+'";</script>');
      if(options.direct&&calls.length===3)return new Response('<img class="uploaded-image">');
      if(calls.length===3)return new Response('<form id="createAlbumForm">'+'<input id="imageComment">'.repeat(options.photoCount??2)+'</form>');
      if(calls.length===4)return new Response(`<script>window.location.href="${options.redirect??'/uploaded?ID=TESTALBUM123'}";</script>`);
      return new Response('<img class="uploaded-image">'.repeat(options.galleryCount??options.photoCount??2)+'<span>Дата удаления:</span> 04.12.2099');
    },
  });
  runInContext(compile('../supabase/functions/_shared/evidenceImages.ts'),context);
  runInContext(compile('../supabase/functions/_shared/fotora.ts'),context);
  const photos=Array.from({length:options.photoCount??2},(_,index)=>({bytes:new Uint8Array([...png,index]),hash:String(index).repeat(64),mime:'image/png',extension:'png'}));
  return { run:()=>context.uploadFotoraAlbum(photos), calls, closed:()=>closed };
}

test('Fotora follows the real guest album flow, preserves photos and never exposes or forwards guest cookies to the public gallery', async () => {
  const app=protocolFixture(); const result=await app.run();
  assert.equal(result.url,albumUrl);assert.equal(result.expiresAt,'2099-12-04T00:00:00.000Z');assert.equal(app.calls.length,5);assert.equal(app.closed(),true);
  assert.ok(app.calls.every(call=>call.url.startsWith('https://fotora.ru/')));
  assert.ok(app.calls.slice(1,4).every(call=>call.cookie==='PHPSESSID=private-cookie-marker'));assert.equal(app.calls[4].cookie,null);
  const images=app.calls[1].form!.getAll('uploadFiles[]') as File[];
  assert.equal(images.length,2);assert.deepEqual(new Uint8Array(await images[1].arrayBuffer()),new Uint8Array([...png,1]));
  assert.match(images[0].name,/^screenshot-[a-f0-9]{16}\.png$/);
  assert.equal(app.calls[3].form!.get('allComments'),'["",""]');assert.equal(app.calls[3].form!.has('createAlbum'),true);
  assert.doesNotMatch(JSON.stringify(result),/cookie|PHPSESSID|private-marker/);
});

test('Fotora failures and future captcha challenges stop safely, never retry file POSTs and close the transport', async () => {
  for(const options of [{failAt:1},{failAt:2},{captcha:true},{redirect:'https://evil.test/album'},{galleryCount:1}]) {
    const app=protocolFixture(options);
    await assert.rejects(app.run(),error=>{assert.doesNotMatch(String(error),/private-cookie-marker/);return true;});
    assert.equal(app.closed(),true);assert.ok(app.calls.filter(call=>call.method==='POST'&&call.url==='https://fotora.ru/').length<=1);
    assert.ok(app.calls.every(call=>call.url.startsWith('https://fotora.ru/')));
    if(options.captcha)assert.equal(app.calls.length,1);
  }
});

function albumFixture(options: { anonymous?: boolean; identity?: boolean; attempt?: number; dbDown?: boolean; reservations?: string[]; cachedUrl?: string; completeAlbum?: boolean; syncDown?: boolean; hostingError?: 'failed'|'uncertain' } = {}) {
  let handler!: (request: Request)=>Promise<Response>,reserveIndex=0;
  const calls: {name:string;params:Record<string,unknown>}[]=[],hosted:unknown[][]=[],logs:unknown[]=[];
  class HostingError extends Error { constructor(public uncertain:boolean){super('private-cookie-marker');} }
  const client={auth:{getUser:async()=>({error:null,data:{user:options.anonymous?null:{id:'00000000-0000-4000-8000-000000000001',
    user_metadata:{sub:'123456789012345678'},identities:options.identity===false?[]:[{provider:'discord',identity_data:{sub:'123456789012345678'}}]}}})},
    rpc:async(name:string,params:Record<string,unknown>)=>{
      calls.push({name,params});if(options.dbDown)return{data:null,error:new Error('private-secret-marker')};
      if(name==='claim_evidence_upload_attempt')return{data:options.attempt??0,error:null};
      if(name==='is_complete_evidence_album')return{data:options.completeAlbum!==false,error:null};
      if(name==='reserve_evidence_upload')return{data:{result:options.reservations?.[reserveIndex++]??'reserved',ticket:'ticket',url:options.cachedUrl??albumUrl,expiresAt:'2099-12-04T00:00:00.000Z'},error:null};
      return{data:!options.syncDown,error:null};
    }};
  const env:Record<string,string>={SUPABASE_URL:'https://example.test',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'private-secret-marker'};
  const context=createContext({Deno:{serve:(value:typeof handler)=>handler=value,env:{get:(key:string)=>env[key]}},createClient:()=>client,
    Request,Response,Headers,FormData,File,Blob,URL,AbortSignal,Uint8Array,DataView,TextDecoder,crypto:webcrypto,
    FotoraUploadError:HostingError,uploadFotoraAlbum:async(photos:unknown[])=>{hosted.push(photos);if(options.hostingError)throw new HostingError(options.hostingError==='uncertain');return{url:albumUrl,expiresAt:'2099-12-04T00:00:00.000Z'};},
    console:{error:(...values:unknown[])=>logs.push(values)},
  });
  runInContext(compile('../supabase/functions/_shared/evidenceImages.ts'),context);
  runInContext(compile('../supabase/functions/upload-evidence-album/index.ts'),context);
  const submit=(files:Uint8Array[]=[new Uint8Array([...png,0]),new Uint8Array([...png,1])],selectionCount=11)=>{
    const form=new FormData();form.set('selectionCount',String(selectionCount));files.forEach((bytes,index)=>form.append('files',new Blob([bytes],{type:'image/png'}),`private-name-${index}.png`));
    return handler(new Request('https://example.test/upload',{method:'POST',body:form}));
  };
  return{submit,handler,calls,hosted,logs};
}

test('album auth, request quotas, invalid images, duplicates and oversized groups are rejected before Fotora', async () => {
  for(const [options,status] of [[{anonymous:true},401],[{identity:false},403],[{attempt:5},429],[{dbDown:true},503]] as const){
    const app=albumFixture(options);assert.equal((await app.submit()).status,status);assert.equal(app.hosted.length,0);
    if(options.anonymous||options.identity===false)assert.equal(app.calls.length,0);
  }
  for(const [files,count,status] of [[[png],0,400],[[new TextEncoder().encode('<svg/>')],11,400],[[png,png],11,400],[[new Uint8Array(10*1024*1024+1)],11,413]] as const){
    const app=albumFixture();assert.equal((await app.submit([...files],count)).status,status);assert.equal(app.hosted.length,0);
  }
});

test('bulk uploads use the shared hash cache across hosts, settle all new photos and never spend report cooldowns', async () => {
  const existing='https://allwebs.ru/images/2026/11/03/old.png';
  const app=albumFixture({reservations:['ready','reserved'],cachedUrl:existing});const response=await app.submit();assert.equal(response.status,200);
  const data=await response.json();assert.deepEqual(data.urls,[existing,albumUrl]);assert.equal(app.hosted[0].length,1);
  assert.equal(app.calls.filter(call=>call.name==='settle_evidence_upload').length,1);
  assert.ok(app.calls.every(call=>!call.name.includes('application')&&!call.name.includes('achievement')));
  assert.doesNotMatch(JSON.stringify(data)+JSON.stringify(app.logs),/private-name|private-secret|cookie/);
  const cached=albumFixture({reservations:['ready','ready']});assert.equal((await cached.submit()).status,200);assert.equal(cached.hosted.length,0);
  const subset=albumFixture({reservations:['ready','reserved'],completeAlbum:false});const rejected=await subset.submit();
  assert.equal(rejected.status,409);assert.equal((await rejected.json()).retryable,false);assert.equal(subset.hosted.length,0);assert.equal(subset.calls.at(-1)?.params.p_status,'failed');
});

test('a blocked member releases unused reservations; ambiguous hosting outcomes are not retried; confirmed links survive sync failures', async () => {
  const blocked=albumFixture({reservations:['reserved','pending']});assert.equal((await blocked.submit()).status,409);assert.equal(blocked.hosted.length,0);
  assert.equal(blocked.calls.at(-1)?.params.p_status,'failed');
  const duplicate=albumFixture({reservations:['duplicate']});const denied=await duplicate.submit();
  assert.equal(denied.status,409);assert.equal((await denied.json()).retryable,false);assert.equal(duplicate.hosted.length,0);
  for(const status of ['failed','uncertain'] as const){const app=albumFixture({hostingError:status});const response=await app.submit();assert.equal(response.status,status==='failed'?503:502);assert.equal(app.hosted.length,1);assert.ok(app.calls.filter(call=>call.name==='settle_evidence_upload').every(call=>call.params.p_status===status));}
  const sync=albumFixture({syncDown:true});const response=await sync.submit();assert.equal(response.status,200);const data=await response.json();assert.deepEqual(data.urls,[albumUrl]);assert.equal(data.syncPending,true);assert.equal(sync.hosted.length,1);
});


test('Fotora accepts one image through either an album draft or a direct public result',async()=>{
  for(const direct of [false,true]){
    const app=protocolFixture({photoCount:1,direct});const result=await app.run();
    assert.equal(result.url,albumUrl);assert.equal(app.closed(),true);
    assert.equal((app.calls[1].form!.getAll('uploadFiles[]')).length,1);
    assert.equal(app.calls.at(-1)?.cookie,null);
  }
});

test('Fotora endpoint accepts one to ten images with the same quota and verification checks',async()=>{
  for(const count of [1,2,10]){
    const app=albumFixture();const files=Array.from({length:count},(_,index)=>new Uint8Array([...png,index]));
    const response=await app.submit(files,count);assert.equal(response.status,200);
    assert.equal(app.hosted[0].length,count);assert.deepEqual((await response.json()).urls,[albumUrl]);
  }
});

test('hosting calls use the verified European region and preserve session authentication',async()=>{
  for(const provider of ['allwebs','fotora']){
    const calls:{name:string;options:any}[]=[];
    const context=createContext({FunctionRegion,File,FormData,MAX_IMAGE_BYTES:10*1024*1024,MAX_SELECTED_IMAGES:50,evidenceHostingUrl,
      getApplicationSession:async()=>({session:{access_token:'offline-session'}}),
      supabase:{functions:{invoke:async(name:string,options:any)=>{calls.push({name,options});return{data:provider==='allwebs'?{url:'https://allwebs.ru/images/2026/test.png'}:{urls:[albumUrl]},error:null}}}}});
    runInContext(compile('../src/lib/evidenceUpload.ts'),context);
    const result=await context.uploadEvidenceBatch([new File([png],'offline.png',{type:'image/png'})],provider,1,'offline-user',new AbortController().signal);
    assert.equal(calls[0].options.region,'eu-central-1');assert.equal(calls[0].options.headers.Authorization,'Bearer offline-session');assert.equal(result.urls.length,1);
  }
});
