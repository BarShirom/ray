import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { Readable } from 'node:stream';
import { S3Client } from '@aws-sdk/client-s3';
import { createS3Storage } from '../dist/media/s3.js';
import { mediaConfig, assertMediaIdentity, MEDIA_ACCOUNT, MEDIA_BUCKET, MEDIA_ROLE, MEDIA_REGION } from '../dist/media/config.js';
import { normalizeImage, digest } from '../dist/media/image.js';
import { intentSchema, mediaStationSchema, mediaReportSchema } from '../dist/media/validation.js';
const env = { RAY_MEDIA_MODE:'s3', RAY_S3_BUCKET:MEDIA_BUCKET, RAY_S3_REGION:MEDIA_REGION, RAY_S3_PREFIX:'dev/', RAY_S3_PROFILE:'ray-s3-dev', RAY_S3_EXPECTED_ACCOUNT:MEDIA_ACCOUNT, RAY_S3_EXPECTED_ROLE:MEDIA_ROLE };
const config = mediaConfig(env);
const key='dev/incoming/11111111-1111-4111-8111-111111111111';
const output='dev/ready/11111111-1111-4111-8111-111111111111.webp';
const bytes=await sharp({create:{width:12,height:8,channels:3,background:'#4185ab'}}).png().toBuffer();
const intent={purpose:'station',contentType:'image/png',byteLength:bytes.length,checksum:digest(bytes)};
test('media activation requires exact reviewed configuration and restricted assumed role',()=>{
  assert.equal(mediaConfig({}),undefined); assert.equal(mediaConfig({RAY_MEDIA_MODE:'disabled',AWS_ENDPOINT_URL:'https://invalid'}),undefined);
  for(const name of Object.keys(env)) assert.throws(()=>mediaConfig({...env,[name]:'unexpected'}));
  for(const name of ['AWS_ENDPOINT_URL','AWS_ENDPOINT_URL_S3','AWS_ENDPOINT_URL_STS','RAY_S3_ENDPOINT']) assert.throws(()=>mediaConfig({...env,[name]:'https://evil.invalid'}));
  assert.doesNotThrow(()=>assertMediaIdentity({Account:MEDIA_ACCOUNT,Arn:`arn:aws:sts::${MEDIA_ACCOUNT}:assumed-role/RayMediaDevRole/synthetic-session`},config));
  for(const Arn of [`arn:aws:iam::${MEDIA_ACCOUNT}:root`,`arn:aws:sts::${MEDIA_ACCOUNT}:assumed-role/AccountFullAccessRole/session`,MEDIA_ROLE,`arn:aws:sts::${MEDIA_ACCOUNT}:assumed-role/RayMediaDevRole/`]) assert.throws(()=>assertMediaIdentity({Account:MEDIA_ACCOUNT,Arn},config));
  assert.throws(()=>assertMediaIdentity({Account:'000000000000',Arn:`arn:aws:sts::${MEDIA_ACCOUNT}:assumed-role/RayMediaDevRole/test`},config));
  assert.throws(()=>mediaConfig({...env,RAY_S3_TEST_RUN:'../outside'}));
  assert.equal(mediaConfig({...env,RAY_S3_TEST_RUN:'11111111-1111-4111-8111-111111111111',RAY_S3_LIVE_TEST_APPROVED:'synthetic-bounded-test'}).prefix,'dev/test-runs/11111111-1111-4111-8111-111111111111/');
});
test('strict intent and media attachment validation refuses client storage parameters and URLs',()=>{
  assert.equal(intentSchema.safeParse(intent).success,true);
  for(const extra of [{byteLength:0},{byteLength:8388609},{byteLength:1.2},{contentType:'image/gif'},{checksum:'bad'},{checksum:'A'.repeat(42)+'B='},{purpose:'avatar'},{key},{bucket:MEDIA_BUCKET},{filename:'a.png'}]) assert.equal(intentSchema.safeParse({...intent,...extra}).success,false);
  assert.equal(mediaStationSchema.safeParse({name:'Synthetic',location:{lat:0,lng:0},image:'https://example.invalid/a.png'}).success,false);
  const report={description:'SYNTHETIC',type:'general',location:{lat:0,lng:0}};
  assert.equal(mediaReportSchema.safeParse({...report,media:['/local/path']}).success,false);
  const id=key.split('/').at(-1);
  assert.equal(mediaReportSchema.safeParse({...report,mediaAssetIds:[id,id]}).success,false);
  assert.equal(mediaReportSchema.safeParse({...report,media:[]}).success,true);
});
test('actual offline SDK presigning binds PUT length, checksum, MIME, conditional write, owner and SSE',async t=>{
  const client=new S3Client({region:MEDIA_REGION,credentials:{accessKeyId:'SYNTHETICKEYNOTREAL',secretAccessKey:'synthetic-secret-not-a-credential',sessionToken:'synthetic-session'},ignoreConfiguredEndpointUrls:true,requestHandler:{handle(){assert.fail('No network permitted');}}});
  t.after(()=>client.destroy()); const storage=createS3Storage(client,config);
  const permission=await storage.signUpload(key,intent), url=new URL(permission.url);
  assert.equal(url.hostname,`${MEDIA_BUCKET}.s3.${MEDIA_REGION}.amazonaws.com`);
  assert.equal(decodeURIComponent(url.pathname),'/'+key); assert.equal(url.searchParams.get('X-Amz-Expires'),'300');
  const signed=url.searchParams.get('X-Amz-SignedHeaders').split(';');
  for(const name of ['host','content-length','content-type','if-none-match','x-amz-checksum-sha256','x-amz-server-side-encryption','x-amz-expected-bucket-owner']) assert.ok(signed.includes(name),name);
  assert.equal(permission.headers['if-none-match'],'*'); assert.equal(permission.headers['content-length'],undefined);
  assert.equal(permission.headers['x-amz-checksum-sha256'],intent.checksum);
  assert.equal(url.searchParams.has('x-amz-checksum-sha256'),false);
  const changed=new URL((await storage.signUpload(key,{...intent,byteLength:intent.byteLength+1})).url);
  assert.notEqual(changed.searchParams.get('X-Amz-Signature'),url.searchParams.get('X-Amz-Signature'));
  const read=new URL(await storage.signRead(output)); assert.equal(read.searchParams.get('X-Amz-Expires'),'60'); assert.equal(read.searchParams.get('response-content-type'),'image/webp');
  for(const invalid of ['prod/incoming/'+key.split('/').at(-1),'dev/../secret',output]) await assert.rejects(storage.signUpload(invalid,intent),e=>e.status===503&&!e.message.includes('synthetic-secret'));
  await assert.rejects(storage.signRead(key),e=>e.status===503);
  const scoped='dev/test-runs/22222222-2222-4222-8222-222222222222/ready/11111111-1111-4111-8111-111111111111.webp';
  assert.equal(new URL(await storage.signRead(scoped)).pathname,'/'+scoped,'persisted test attachments remain readable after changing issuance namespace');
  await assert.rejects(storage.signUpload(scoped,intent),e=>e.status===503);
});
test('bounded storage download checks HEAD, conditional GET, bytes and checksum; safely maps failures',async()=>{
  let head={ContentLength:bytes.length,ContentType:'image/png',ChecksumSHA256:digest(bytes),ETag:'synthetic-etag'}, body=bytes, calls=[];
  const client={async send(command){calls.push(command); if(command.constructor.name==='HeadObjectCommand') return head; return {ContentLength:bytes.length,Body:Readable.from([body])};}};
  const storage=createS3Storage(client,config);
  assert.deepEqual(await storage.source(key,intent),bytes); assert.equal(calls[1].input.IfMatch,'synthetic-etag'); assert.equal(calls[0].input.ExpectedBucketOwner,MEDIA_ACCOUNT);
  for(const wrong of [{ContentLength:bytes.length+1},{ChecksumSHA256:'wrong'},{ContentType:'image/jpeg'},{ETag:undefined}]) { const original=head;head={...head,...wrong};calls=[];await assert.rejects(storage.source(key,intent),e=>e.status===422);assert.equal(calls.length,1);head=original; }
  body=Buffer.alloc(bytes.length);await assert.rejects(storage.source(key,intent),e=>e.status===422);
  body=Buffer.alloc(bytes.length+1);await assert.rejects(storage.source(key,intent),e=>e.status===422);
  body=bytes.subarray(1);await assert.rejects(storage.source(key,intent),e=>e.status===422);
  await assert.rejects(createS3Storage({send:async()=>{throw Object.assign(new Error('secret-storage-detail'),{name:'NoSuchKey'});}},config).source(key,intent),e=>e.status===409);
  await assert.rejects(createS3Storage({send:async()=>{throw new Error('secret-storage-detail');}},config).source(key,intent),e=>e.status===503&&!e.message.includes('secret-storage-detail'));
});
test('immutable output retry accepts only the exact existing normalized object',async()=>{
  const normalized=await normalizeImage(bytes,'image/png');let matching=true;
  const storage=createS3Storage({send:async command=>{if(command.constructor.name==='PutObjectCommand'){assert.equal(command.input.IfNoneMatch,'*');assert.equal(command.input.ContentType,'image/webp');throw Object.assign(new Error(),{name:'PreconditionFailed'});}return {ChecksumSHA256:matching?normalized.checksum:'bad',ContentLength:normalized.data.length,ContentType:'image/webp'};}},config);
  await storage.putOutput(output,normalized.data,normalized.checksum);matching=false;await assert.rejects(storage.putOutput(output,normalized.data,normalized.checksum),e=>e.status===503);
});
test('synthetic JPEG/PNG/WebP normalize orientation, dimensions and strip metadata',async()=>{
  for(const format of ['jpeg','png','webp']) {
    const input=await sharp({create:{width:40,height:20,channels:3,background:'#3366aa'}}).withMetadata({orientation:6}).withExif({IFD0:{Artist:'SYNTHETIC ONLY'},IFD3:{GPSLatitudeRef:'N',GPSLatitude:'32/1 0/1 0/1'}})[format]().toBuffer();
    const normalized=await normalizeImage(input,'image/'+format); const meta=await sharp(normalized.data).metadata();
    assert.equal(meta.format,'webp');assert.equal(meta.width,20);assert.equal(meta.height,40);assert.equal(meta.exif,undefined);assert.equal(meta.icc,undefined);assert.equal(meta.xmp,undefined);assert.equal(meta.orientation,undefined);assert.equal(normalized.checksum,digest(normalized.data));
  }
  const large=await sharp({create:{width:2000,height:1000,channels:3,background:'#fff'}}).png().toBuffer();const resized=await normalizeImage(large,'image/png');assert.equal(resized.width,1600);assert.equal(resized.height,800);
});
test('rejects corrupt bytes, misleading MIME, unsupported/animated formats and byte/pixel excess',async()=>{
  for(const [data,mime] of [[bytes,'image/jpeg'],[Buffer.from('<svg/>'),'image/png'],[Buffer.from('GIF89a'),'image/gif'],[bytes.subarray(0,30),'image/png'],[Buffer.alloc(8388609),'image/png'],[Buffer.alloc(0),'image/png']]) await assert.rejects(normalizeImage(data,mime),e=>e.status===422);
  const animation=await sharp(Buffer.concat([Buffer.alloc(48,0),Buffer.alloc(48,255)]),{raw:{width:4,height:8,channels:3,pageHeight:4}}).webp({loop:0,delay:[10,10]}).toBuffer();
  assert.equal((await sharp(animation).metadata()).pages,2);await assert.rejects(normalizeImage(animation,'image/webp'),e=>e.status===422);
  const apng=Buffer.concat([bytes.subarray(0,33),Buffer.from([0,0,0,8]),Buffer.from('acTL'),Buffer.alloc(12),bytes.subarray(33)]);await assert.rejects(normalizeImage(apng,'image/png'),e=>e.status===422);
  const huge=await sharp({create:{width:5000,height:4001,channels:3,background:'#fff'}}).png().toBuffer();assert.ok(huge.length<8388608);await assert.rejects(normalizeImage(huge,'image/png'),e=>e.status===422);
});
