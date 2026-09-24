import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { openTestDatabase } from './database.mjs';
import { createPostgres } from '../../dist/db/connection.js';
import { applyLocalMigrations } from '../../dist/db/migrate.js';
import { createPreviewApp } from '../../dist/preview/app.js';
import { createMediaService } from '../../dist/media/service.js';
import { MediaError } from '../../dist/media/types.js';
import { digest } from '../../dist/media/image.js';
const secret='synthetic-media-integration-secret-only';
const png=await sharp({create:{width:16,height:8,channels:3,background:'#caca21'}}).png().toBuffer();
const intent={purpose:'station',contentType:'image/png',byteLength:png.length,checksum:digest(png)};
const station={name:'SYNTHETIC media test station',location:{lat:32,lng:34},estimatedCats:0,estimatedKittens:0};
const report={description:'SYNTHETIC media test report',type:'general',location:{lat:32,lng:34}};
test('S3 media HTTP/service integration with real disposable PostgreSQL and storage double',async t=>{
  const owned=await openTestDatabase(t); await applyLocalMigrations(owned,'test',owned.url);
  const connection=createPostgres({connectionString:owned.url,max:8,application_name:'ray-media-test'});
  t.after(()=>connection.close());
  const objects=new Map(),writes=[],deletes=[];let failOutput=false, failSign=false, pauseSource, failDelete=false, checkTransactions=true;
  async function outsideTransaction(){if(!checkTransactions)return;const r=await owned.pool.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name='ray-media-test' AND state='idle in transaction'");assert.equal(r.rows[0].count,0,'No SQL transaction held during storage operations');}
  const storage={
    async signUpload(key){await outsideTransaction();if(failSign) throw new Error('PRIVATE-SDK-DETAIL');return {url:'https://synthetic.invalid/'+key,headers:{}};},
    async source(key,expected){await outsideTransaction();if(pauseSource) await pauseSource;const data=objects.get(key);if(!data) throw new MediaError(409,'Upload missing');if(data.length!==expected.byteLength||digest(data)!==expected.checksum) throw new MediaError(422,'Checksum mismatch');return data;},
    async putOutput(key,data){await outsideTransaction();if(failOutput) throw new Error('PRIVATE-SDK-DETAIL');objects.set(key,data);writes.push(key);},
    async signRead(key){await outsideTransaction();return 'https://synthetic.invalid/'+key+'?read='+randomUUID();},
    async deleteObject(key){await outsideTransaction();if(failDelete && key.includes("/ready/"))throw new Error("PRIVATE-DELETE-DETAIL");deletes.push(key);objects.delete(key);},
  };
  const service=createMediaService(connection.db,storage);
  const listener=await new Promise(resolve=>{const s=createPreviewApp(connection,secret,storage).listen(0,'127.0.0.1',()=>resolve(s));});
  t.after(()=>new Promise(resolve=>{listener.close(resolve);listener.closeAllConnections();}));
  const base='http://127.0.0.1:'+listener.address().port;
  const req=async(method,path,body,token)=>{const r=await fetch(base+path,{method,redirect:'manual',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const text=await r.text();return {status:r.status,headers:r.headers,body:r.headers.get('content-type')?.includes('json')?JSON.parse(text):text};};
  const user=async()=>{const r=await req('POST','/api/auth/register',{firstName:'Synthetic',lastName:'Media',email:randomUUID()+'@example.invalid',password:'SyntheticMedia123!'});assert.equal(r.status,201);return {token:r.body.token,id:jwt.verify(r.body.token,secret).id??jwt.verify(r.body.token,secret)._id};};
  const row=async id=>(await connection.pool.query('SELECT * FROM media_assets WHERE id=$1',[id])).rows[0];
  const issue=async(u,purpose='station')=>{const r=await req('POST','/api/media/uploads',{...intent,purpose},u.token);assert.equal(r.status,201,JSON.stringify(r.body));objects.set((await row(r.body.assetId)).source_key,png);return r.body.assetId;};
  const complete=async(u,id)=>{const r=await req('POST',`/api/media/${id}/complete`,{},u.token);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.state,'ready');return r;};
  let a=await user(),b=await user(),attached;
  await t.test('disabled composition exposes no upload capability and returns 503',async()=>{
    const disabled=await new Promise(resolve=>{const s=createPreviewApp(connection,secret).listen(0,'127.0.0.1',()=>resolve(s));});
    try {const origin='http://127.0.0.1:'+disabled.address().port;assert.equal((await (await fetch(origin+'/api/media/capabilities')).json()).enabled,false);assert.equal((await fetch(origin+'/api/media/uploads',{method:'POST'})).status,503);}finally{await new Promise(resolve=>{disabled.close(resolve);disabled.closeAllConnections();});}
  });
  await t.test('real authentication, disabled routes, guest no-image creation and strict inputs',async()=>{
    assert.equal((await req('GET','/api/media/capabilities')).body.enabled,true);
    assert.equal((await req('POST','/api/media/uploads',intent)).status,401);
    assert.equal((await req('POST','/api/reports',report)).status,201);
    assert.equal((await req('POST','/api/reports',{...report,mediaAssetIds:[randomUUID()]})).status,401);
    assert.equal((await req('POST','/api/feeding-stations',{...station,image:'https://evil.invalid/a.jpg'},a.token)).status,400);
    assert.equal((await req('POST','/api/reports',{...report,media:['/path/to/private']},a.token)).status,400);
    assert.equal((await req('POST','/api/media/uploads',{...intent,byteLength:8388609},a.token)).status,400);
    assert.equal((await req('POST','/api/media/uploads',{...intent,key:'dev/anything'},a.token)).status,400);
  });
  await t.test('owner-only completion/attachment and private pending/ready unattached objects',async()=>{
    const id=await issue(a);
    assert.equal((await req('GET',`/api/media/${id}/content`)).status,404);
    assert.equal((await req('POST',`/api/media/${id}/complete`,{},b.token)).status,403);
    assert.equal((await req('POST','/api/feeding-stations',{...station,imageAssetId:id},a.token)).status,409);
    await complete(a,id);
    assert.equal((await req('GET',`/api/media/${id}/content`)).status,404);
    assert.equal((await req('POST','/api/feeding-stations',{...station,imageAssetId:id},b.token)).status,403);
    assert.equal((await req('POST','/api/reports',{...report,mediaAssetIds:[id]},a.token)).status,409);
    const before=writes.length;await complete(a,id);assert.equal(writes.length,before);
    const made=await req('POST','/api/feeding-stations',{...station,imageAssetId:id},a.token);assert.equal(made.status,201,JSON.stringify(made.body));
    assert.equal(made.body.image,`http://127.0.0.1:4001/api/media/${id}/content`);attached=id;
    const read=await req('GET',`/api/media/${id}/content`);assert.equal(read.status,302);assert.match(read.headers.get('location'),/ready/);assert.equal(read.headers.get('cache-control'),'no-store');assert.equal(read.headers.get('referrer-policy'),'no-referrer');
    const again=await req('GET',`/api/media/${id}/content`);assert.notEqual(again.headers.get('location'),read.headers.get('location'));
    await connection.pool.query('UPDATE feeding_stations SET active=false WHERE public_id=$1',[made.body._id]);
    assert.equal((await req('GET',`/api/media/${id}/content`)).status,302);
    assert.equal((await req('GET','/api/feeding-stations/'+made.body._id)).body.image,made.body.image);
    assert.equal(await createMediaService(connection.db,storage).content(id).then(()=>true),true,'new service instance resolves persisted relationship');
  });
  await t.test('ordered report images and fresh public read resolution',async()=>{
    const u=await user(),ids=[];for(let i=0;i<3;i++){const id=await issue(u,'report');await complete(u,id);ids.push(id);}
    assert.equal((await req('POST','/api/reports',{...report,mediaAssetIds:[...ids,randomUUID()]},u.token)).status,400);
    assert.equal((await req('POST','/api/reports',{...report,mediaAssetIds:[ids[0],ids[0]]},u.token)).status,400);
    const made=await req('POST','/api/reports',{...report,mediaAssetIds:ids.reverse()},u.token);assert.equal(made.status,201,JSON.stringify(made.body));
    assert.deepEqual(made.body.media,ids.map(id=>`http://127.0.0.1:4001/api/media/${id}/content`));
    const stored=await connection.pool.query('SELECT id,position FROM media_assets WHERE report_id=(SELECT id FROM reports WHERE public_id=$1) ORDER BY position',[made.body._id]);assert.deepEqual(stored.rows.map(r=>r.id),ids);
    assert.deepEqual((await req('GET','/api/reports')).body.find(r=>r._id===made.body._id).media,made.body.media);
    for(const id of ids) assert.equal((await req('GET',`/api/media/${id}/content`)).status,302);
  });
  await t.test('concurrent duplicate attachment has one winner and no extra parent',async()=>{
    const u=await user(),id=await issue(u);await complete(u,id);
    const before=(await connection.pool.query('SELECT count(*) FROM feeding_stations')).rows[0].count;
    const responses=await Promise.all([1,2].map(()=>req('POST','/api/feeding-stations',{...station,imageAssetId:id},u.token)));
    assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);assert.equal(Number((await connection.pool.query('SELECT count(*) FROM feeding_stations')).rows[0].count),Number(before)+1);
  });
  await t.test('parent failure and attachment failure each roll back parent and claim',async()=>{
    const u=await user(),id=await issue(u);await complete(u,id);
    const uid=(await connection.pool.query('SELECT public_id FROM users WHERE id=(SELECT owner_id FROM media_assets WHERE id=$1)',[id])).rows[0].public_id;
    const before=(await connection.pool.query('SELECT count(*) FROM feeding_stations')).rows[0].count;
    await assert.rejects(service.stations.create({...station,name:'',createdBy:uid,imageAssetId:id}),e=>e.status===503);
    assert.equal((await row(id)).station_id,null);
    await connection.pool.query("ALTER TABLE media_assets ADD CONSTRAINT synthetic_attach_failure CHECK (station_id IS NULL OR id <> '"+id+"'::uuid)");
    try {assert.equal((await req('POST','/api/feeding-stations',{...station,imageAssetId:id},u.token)).status,503);}finally{await connection.pool.query('ALTER TABLE media_assets DROP CONSTRAINT synthetic_attach_failure');}
    assert.equal((await row(id)).station_id,null);assert.equal((await connection.pool.query('SELECT count(*) FROM feeding_stations')).rows[0].count,before);
  });
  await t.test('missing, expired, corrupt and checksum failures cannot become attachable',async()=>{
    const u=await user();
    assert.equal((await req('POST',`/api/media/${randomUUID()}/complete`,{},u.token)).status,404);
    const missing=await issue(u);objects.delete((await row(missing)).source_key);assert.equal((await req('POST',`/api/media/${missing}/complete`,{},u.token)).status,409);assert.equal((await row(missing)).state,'pending');
    const expired=await issue(u);await connection.pool.query("UPDATE media_assets SET upload_expires_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE id=$1",[expired]);assert.equal((await req('POST',`/api/media/${expired}/complete`,{},u.token)).status,410);
    const mismatch=await issue(u);objects.set((await row(mismatch)).source_key,Buffer.alloc(png.length));assert.equal((await req('POST',`/api/media/${mismatch}/complete`,{},u.token)).status,422);assert.equal((await row(mismatch)).state,'failed');
    const corrupted=Buffer.from('not-a-real-image');const r=await req('POST','/api/media/uploads',{...intent,byteLength:corrupted.length,checksum:digest(corrupted)},u.token);assert.equal(r.status,201);objects.set((await row(r.body.assetId)).source_key,corrupted);assert.equal((await req('POST',`/api/media/${r.body.assetId}/complete`,{},u.token)).status,422);
    assert.equal((await req('POST','/api/feeding-stations',{...station,imageAssetId:mismatch},u.token)).status,409);
  });
  await t.test('partial storage/DB failures return safe errors and retry without false ready',async()=>{
    const u=await user(),id=await issue(u);failOutput=true;
    const failed=await req('POST',`/api/media/${id}/complete`,{},u.token);assert.equal(failed.status,503);assert.ok(!JSON.stringify(failed.body).includes('PRIVATE'));assert.equal((await row(id)).state,'pending');failOutput=false;
    await connection.pool.query("UPDATE media_assets SET last_attempt_at=now()-interval '3 seconds' WHERE id=$1",[id]);
    await connection.pool.query("ALTER TABLE media_assets ADD CONSTRAINT synthetic_ready_failure CHECK (state <> 'ready' OR id <> '"+id+"'::uuid)");
    try {assert.equal((await req('POST',`/api/media/${id}/complete`,{},u.token)).status,503);}finally{await connection.pool.query('ALTER TABLE media_assets DROP CONSTRAINT synthetic_ready_failure');}
    assert.equal((await row(id)).state,'pending');assert.ok(objects.has((await row(id)).output_key));
    await connection.pool.query("UPDATE media_assets SET last_attempt_at=now()-interval '3 seconds' WHERE id=$1",[id]);await complete(u,id);
    failSign=true;try{assert.equal((await req('POST','/api/media/uploads',intent,u.token)).status,503);}finally{failSign=false;}
  });
  await t.test('per-owner outstanding quota is race-safe and failed issuance rate remains bounded',async()=>{
    checkTransactions=false;
    const u=await user();const outcomes=await Promise.all(Array.from({length:9},()=>req('POST','/api/media/uploads',intent,u.token)));assert.equal(outcomes.filter(r=>r.status===201).length,6);assert.equal(outcomes.filter(r=>r.status===429).length,3);
    const v=await user();failSign=true;try{for(let i=0;i<10;i++)assert.equal((await req('POST','/api/media/uploads',intent,v.token)).status,503);assert.equal((await req('POST','/api/media/uploads',intent,v.token)).status,429);}finally{failSign=false;checkTransactions=true;}
  });
  await t.test('processing concurrency, leases and completion rate limits reject excess work',async()=>{
    checkTransactions=false;
    const u=await user(),v=await user(),w=await user();const ids=await Promise.all([u,v,w].map(x=>issue(x)));
    let release;pauseSource=new Promise(resolve=>{release=resolve;});
    const first=req('POST',`/api/media/${ids[0]}/complete`,{},u.token);
    const second=req('POST',`/api/media/${ids[1]}/complete`,{},v.token);
    for(let i=0;i<100;i++){const rows=await connection.pool.query("SELECT count(*)::int AS n FROM media_assets WHERE id=ANY($1::uuid[]) AND state='processing'",[ids]);if(rows.rows[0].n===2)break;await new Promise(r=>setTimeout(r,10));}
    try {assert.equal((await req('POST',`/api/media/${ids[2]}/complete`,{},w.token)).status,429);assert.equal((await req('POST',`/api/media/${ids[0]}/complete`,{},u.token)).status,429);}finally{release();pauseSource=undefined;}
    assert.equal((await first).status,200);assert.equal((await second).status,200);
    for(let i=0;i<8;i++)assert.equal((await req('POST',`/api/media/${randomUUID()}/complete`,{},u.token)).status,404);
    assert.equal((await req('POST',`/api/media/${randomUUID()}/complete`,{},u.token)).status,429);
    await connection.pool.query("UPDATE media_assets SET state='processing',lease=$2,processing_until=now()+interval '1 minute' WHERE id=$1",[ids[2],randomUUID()]);
    assert.equal((await req('POST',`/api/media/${ids[2]}/complete`,{},w.token)).status,409);
    await connection.pool.query("UPDATE media_assets SET processing_until=now()-interval '1 minute',last_attempt_at=now()-interval '3 seconds' WHERE id=$1",[ids[2]]);await complete(w,ids[2]);checkTransactions=true;
  });
  await t.test('database constraints prevent non-ready, duplicate-position and cross-parent attachment',async()=>{
    const u=await user(),id=await issue(u),r=await row(attached);const sql=connection.pool;
    await assert.rejects(sql.query('UPDATE media_assets SET station_id=$2 WHERE id=$1',[id,r.station_id]),e=>e.code==='23514');
    await assert.rejects(sql.query("UPDATE media_assets SET state='ready' WHERE id=$1",[id]),e=>e.code==='23514');
    await complete(u,id);await assert.rejects(sql.query('UPDATE media_assets SET station_id=$2 WHERE id=$1',[id,r.station_id]),e=>e.code==='23505');
    const reportRows=(await sql.query('SELECT * FROM media_assets WHERE report_id IS NOT NULL ORDER BY position')).rows;
    await assert.rejects(sql.query('UPDATE media_assets SET position=NULL WHERE id=$1',[reportRows[0].id]),e=>e.code==='23514');
    await assert.rejects(sql.query('UPDATE media_assets SET position=0 WHERE id=$1',[reportRows[1].id]),e=>e.code==='23505');
    await assert.rejects(sql.query('UPDATE media_assets SET report_id=$2,position=0 WHERE id=$1',[attached,reportRows[0].report_id]),e=>e.code==='23514');
    await assert.rejects(sql.query('UPDATE media_assets SET owner_id=$2 WHERE id=$1',[id,randomUUID()]),e=>e.code==='23503');
  });
  await t.test('dry-run and idempotent exact orphan cleanup exclude attached, valid and processing media',async()=>{
    const u=await user(),id=await issue(u),valid=await issue(u),processing=await issue(u);
    await connection.pool.query("UPDATE media_assets SET upload_expires_at=now()-interval '27 hours',expires_at=now()-interval '26 hours' WHERE id=ANY($1::uuid[])",[[id,attached,processing]]);
    await connection.pool.query("UPDATE media_assets SET processing_until=now()+interval '1 minute' WHERE id=$1",[processing]);
    const before=deletes.length,candidates=await service.cleanup();assert.equal(deletes.length,before);assert.ok(candidates.some(r=>r.assetId===id));for(const excluded of [attached,valid,processing])assert.ok(!candidates.some(r=>r.assetId===excluded));
    failDelete=true;await assert.rejects(service.cleanup([id]),e=>e.status===503&&!e.message.includes('PRIVATE'));failDelete=false;assert.equal((await row(id)).state,'deleting');assert.equal(deletes.length,before+1);
    assert.deepEqual((await service.cleanup([id,attached,valid,processing])).map(r=>r.assetId),[id]);assert.equal(deletes.length,before+3);assert.equal((await row(id)).state,'deleted');
    assert.deepEqual(await service.cleanup([id]),[]);assert.equal(deletes.length,before+3);assert.equal((await req('GET',`/api/media/${attached}/content`)).status,302);
  });
});
