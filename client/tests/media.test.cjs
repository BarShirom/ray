const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');
const { createHash } = require('node:crypto');
require.extensions['.ts'] = (module, filename) => {
  const source=fs.readFileSync(filename,'utf8').replace('import.meta.env.VITE_API_URL',JSON.stringify('http://127.0.0.1:4001')).replace('import.meta.env.MODE',JSON.stringify('postgres'));
  module._compile(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,filename);
};
const { uploadImages, validateImages, mediaEnabled }=require('../src/api/media.ts');
const file=()=>new File(['SYNTHETIC image bytes; validation occurs on server'],'synthetic.png',{type:'image/png'});
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const permission=id=>({assetId:id,url:'https://synthetic-s3.invalid/'+id,headers:{'content-type':'image/png','if-none-match':'*','x-amz-checksum-sha256':'synthetic'},uploadExpiresAt:new Date(Date.now()+300000).toISOString()});
test('image limits and signed-in requirement reject before requests',async t=>{
  t.mock.method(global,'fetch',()=>assert.fail('No request allowed'));
  for(const f of [new File(['a'],'x.gif',{type:'image/gif'}),new File([],'x.png',{type:'image/png'}),new File([new Uint8Array(8388609)],'x.png',{type:'image/png'})])assert.throws(()=>validateImages([f],'report'));
  assert.throws(()=>validateImages([file(),file()],'station'));assert.throws(()=>validateImages(Array.from({length:4},file),'report'));
  await assert.rejects(uploadImages([file()],'report',null,new WeakMap(),()=>{}),/Sign in/);
});
test('capability fails closed for unavailable/disabled server',async t=>{
  let result=json({enabled:false});t.mock.method(global,'fetch',async()=>result);
  assert.equal(await mediaEnabled(new AbortController().signal),false);result=json({enabled:true});assert.equal(await mediaEnabled(new AbortController().signal),true);
  result=json({enabled:true},503);assert.equal(await mediaEnabled(new AbortController().signal),false);
});
test('raw File PUT has signed headers and no Ray token; IDs returned only after completion',async t=>{
  const selected=file(),steps=[],calls=[],cache=new WeakMap();
  t.mock.method(global,'fetch',async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/uploads')){assert.equal(options.headers.Authorization,'Bearer synthetic-token');const body=JSON.parse(options.body);assert.deepEqual(Object.keys(body).sort(),['byteLength','checksum','contentType','purpose']);assert.equal(body.checksum,createHash('sha256').update(Buffer.from(await selected.arrayBuffer())).digest('base64'));return json(permission('synthetic-id'),201);}
    if(url.startsWith('https://')){assert.equal(options.method,'PUT');assert.equal(options.body,selected);assert.equal(options.credentials,'omit');assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers['content-length'],undefined);return new Response(null,{status:200});}
    return json({assetId:'synthetic-id',state:'ready'});
  });
  assert.deepEqual(await uploadImages([selected],'station','synthetic-token',cache,s=>steps.push(s)),['synthetic-id']);assert.equal(calls.length,3);assert.ok(steps.some(s=>s.includes('Uploading')));assert.ok(steps.some(s=>s.includes('Verifying')));
  await uploadImages([selected],'station','synthetic-token',cache,()=>{});assert.equal(calls.length,3,'retry parent submission reuses ready asset');
});
test('uncertain upload retry accepts 412 only after server validation; failed completion can retry',async t=>{
  const selected=file(),cache=new WeakMap();let uploads=0,puts=0,completes=0;
  t.mock.method(global,'fetch',async(url)=>{
    if(url.endsWith('/uploads')){uploads++;return json(permission('id'),201);}
    if(url.startsWith('https://')){puts++;if(puts===1)throw new Error('do not leak signed URL');return new Response(null,{status:412});}
    completes++;return completes===1?json({message:'Retry verification'},503):json({state:'ready'});
  });
  await assert.rejects(uploadImages([selected],'station','token',cache,()=>{}),/transfer failed/);
  await assert.rejects(uploadImages([selected],'station','token',cache,()=>{}),/Retry verification/);
  assert.deepEqual(await uploadImages([selected],'station','token',cache,()=>{}),['id']);assert.equal(uploads,1);assert.equal(puts,2);assert.equal(completes,2);
});
test('report partial progress persists in memory and a changed account cannot reuse assets',async t=>{
  const selected=[file(),file()],cache=new WeakMap();let intents=0,completes=0,fail=true;
  t.mock.method(global,'fetch',async(url)=>{if(url.endsWith('/uploads'))return json(permission('id-'+(++intents)),201);if(url.startsWith('https://'))return new Response(null,{status:200});completes++;if(completes===2&&fail)return json({message:'Busy'},429);return json({state:'ready'});});
  await assert.rejects(uploadImages(selected,'report','user-a',cache,()=>{}),/Busy/);fail=false;
  assert.deepEqual(await uploadImages(selected,'report','user-a',cache,()=>{}),['id-1','id-2']);assert.equal(intents,2);assert.equal(completes,3);
  await uploadImages([selected[0]],'report','user-b',cache,()=>{});assert.equal(intents,3);
});
test('expired permission produces no PUT and permits an explicit fresh retry',async t=>{
  let attempts=0;const selected=file(),cache=new WeakMap();
  t.mock.method(global,'fetch',async(url)=>{if(url.endsWith('/uploads')){attempts++;return json({...permission('id'),uploadExpiresAt:attempts===1?'2000-01-01T00:00:00Z':new Date(Date.now()+300000).toISOString()},201);}if(url.startsWith('https://'))return new Response(null,{status:200});return json({state:'ready'});});
  await assert.rejects(uploadImages([selected],'station','token',cache,()=>{}),/expired/);assert.deepEqual(await uploadImages([selected],'station','token',cache,()=>{}),['id']);assert.equal(attempts,2);
});
