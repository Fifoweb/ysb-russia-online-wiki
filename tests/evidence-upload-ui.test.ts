import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import * as React from 'react';
import { jsx, jsxs } from 'react/jsx-runtime';
import { act, create, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';
import ts from 'typescript';
import { evidenceProvider, evidenceUploadHint, planEvidenceUploads, providerName } from '../src/lib/evidenceUploadPlan';
import { MAX_SELECTED_IMAGES, MAX_IMAGE_BYTES, evidenceHostingUrl, fotoraAlbumUrl } from '../supabase/functions/_shared/evidenceImages';

const album='https://fotora.ru/uploaded/?ID=TESTALBUM123';
const png=new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'));
const photos=(count:number,start=0)=>Array.from({length:count},(_,index)=>new File([new Uint8Array([...png,index+start])],`screenshot-${index+start}.png`,{type:'image/png',lastModified:index+start}));
function compile(path:string){return ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText.replace(/^import .*$/gm,'').replace(/export default /g,'').replace(/export /g,'');}
const dataContext=createContext({MAX_IMAGE_BYTES,MAX_SELECTED_IMAGES,evidenceHostingUrl,File});
runInContext(compile('../src/lib/evidenceUpload.ts'),dataContext);
const uploadData=runInContext('({IMAGE_ACCEPT,imageFileError,insertEvidenceUrls,removeEvidenceUrl})',dataContext);

async function fixture(multiple=true, initial='Ручная ссылка\nhttps://example.test/manual.png'){
  const calls:{files:File[];provider:string;count:number;signal:AbortSignal;resolve:(value:{urls:string[];expiresAt:null})=>void;reject:(error:Error)=>void}[]=[];
  const context=createContext({...React,_jsx:jsx,_jsxs:jsxs,_Fragment:React.Fragment,crypto:webcrypto,URL,File,AbortController,
    useAuth:()=>({user:{id:'test-user'}}), ...uploadData,evidenceProvider,evidenceUploadHint,planEvidenceUploads,providerName,MAX_SELECTED_IMAGES,fotoraAlbumUrl,
    ArrowClockwise:()=>null,CheckCircle:()=>null,ClipboardText:()=>null,FileImage:()=>null,Images:()=>null,UploadSimple:()=>null,X:()=>null,
    uploadEvidenceBatch:(files:File[],provider:string,count:number,_id:string,signal:AbortSignal)=>new Promise((resolve,reject)=>calls.push({files,provider,count,signal,resolve,reject})),
  });
  runInContext(compile('../src/components/EvidenceUploadsProvider.tsx'),context);
  runInContext(compile('../src/components/EvidenceUpload.tsx'),context);
  const getStatus=runInContext('useEvidenceUploadStatus',context);
  function Host(){const[value,setValue]=React.useState(initial);const status=getStatus();return React.createElement(React.Fragment,null,
    React.createElement(context.EvidenceUpload,{value,onChange:setValue,multiple,maxFiles:10,maxLength:1000},React.createElement('textarea',{value,onChange:(event:{target:{value:string}})=>setValue(event.target.value)})),
    React.createElement('output',{'data-reason':true},status.reason??''));}
  let renderer!:ReactTestRenderer;
  await act(async()=>{renderer=create(React.createElement(context.EvidenceUploadsProvider,null,React.createElement(Host)));});
  const button=(label:string)=>renderer.root.findAllByType('button').find(node=>node.children.filter(child=>typeof child==='string').join('')===label)!;
  const add=async(files:File[])=>{await act(async()=>renderer.root.findByType('input').props.onChange({target:{files,value:'selected'}}));};
  const click=async(node:ReactTestInstance)=>{assert.ok(node,'button exists');assert.ok(!node.props.disabled,'button enabled');await act(async()=>node.props.onClick());};
  const finish=async(index:number,urls:string[])=>{await act(async()=>{calls[index].resolve({urls,expiresAt:null});await Promise.resolve();});};
  const field=()=>renderer.root.findByType('textarea').props.value as string;
  const reason=()=>renderer.root.findByType('output').children.join('');
  const close=async()=>{await act(async()=>renderer.unmount());};
  return{renderer,calls,button,add,click,finish,field,reason,close};
}

test('adding photos in portions keeps Fotora for every selection size; Fotora inserts one album and removal preserves manual links',async()=>{
  const app=await fixture();
  await app.add(photos(8));assert.equal(app.calls.length,0);assert.match(app.reason(),/Загрузить выбранные/);
  await app.add(photos(2,8));assert.match(app.renderer.root.findByProps({className:'evidence-upload-plan'}).findByType('span').children.join(''),/Fotora/);
  await app.add(photos(1,10));assert.equal(app.calls.length,0);assert.equal(app.renderer.root.findByProps({className:'evidence-upload-plan'}).findByType('span').children.join(''),'Выбрано 11 фото · Fotora');
  await app.click(app.button('Загрузить выбранные'));assert.equal(app.calls.length,1);assert.equal(app.calls[0].provider,'fotora');assert.equal(app.calls[0].files.length,11);assert.equal(app.calls[0].count,11);
  await app.finish(0,[album]);assert.equal(app.field(),'Ручная ссылка\nhttps://example.test/manual.png\n'+album);assert.equal(app.reason(),'');
  const remove=app.renderer.root.findAllByType('button').find(node=>node.props['aria-label']==='Убрать из формы: Альбом Fotora · 11 фото')!;
  await app.click(remove);assert.equal(app.field(),'Ручная ссылка\nhttps://example.test/manual.png');await app.close();
});

test('ten selected photos use one Fotora batch, and unmount aborts the upload',async()=>{
  const app=await fixture();await app.add(photos(10));await app.click(app.button('Загрузить выбранные'));
  assert.equal(app.calls.length,1);assert.equal(app.calls[0].provider,'fotora');assert.equal(app.calls[0].files.length,10);
  await app.close();assert.equal(app.calls[0].signal.aborted,true);
});

test('new Fotora additions do not reupload completed photos or overwrite existing Allwebs links',async()=>{
  const old='https://allwebs.ru/images/2026/one.png',first='https://fotora.ru/uploaded/?ID=FIRSTALBUM123';
  const app=await fixture(true,old);await app.add(photos(2));await app.click(app.button('Загрузить выбранные'));
  await app.finish(0,[first]);
  await app.add(photos(9,2));await app.click(app.button('Загрузить выбранные'));
  assert.equal(app.calls.length,2);assert.equal(app.calls[1].provider,'fotora');assert.equal(app.calls[1].files.length,9);assert.equal(app.calls[1].count,11);
  await app.finish(1,[album]);assert.equal(app.field(),old+'\n'+first+'\n'+album);await app.close();
});

test('single-image controls preserve edits made while uploading and require an explicit insertion',async()=>{
  const app=await fixture(false,'https://example.test/original.png');await app.add(photos(1));await app.click(app.button('Загрузить выбранные'));
  await act(async()=>app.renderer.root.findByType('textarea').props.onChange({target:{value:'https://example.test/edited.png'}}));
  assert.equal(app.calls[0].provider,'fotora');assert.equal(app.calls[0].count,1);const uploaded=album;await app.finish(0,[uploaded]);assert.equal(app.field(),'https://example.test/edited.png');assert.ok(app.reason());
  await app.click(app.button('Подставить ссылки'));assert.equal(app.field(),uploaded);assert.equal(app.reason(),'');await app.close();
});
