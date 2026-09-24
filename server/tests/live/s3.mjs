// Explicitly opt-in, bounded REAL S3 probe. Never part of npm test/test:postgres.
// Browser preflight and product flows require the separate manual checklist.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { mediaConfig } from '../../dist/media/config.js';
import { openS3Storage } from '../../dist/media/s3.js';
import { digest, normalizeImage } from '../../dist/media/image.js';
import { createPostgres } from '../../dist/db/connection.js';
import { assertDatabaseIdentity, localConfigFromEnv } from '../../dist/db/local-config.js';
let opened;
try {
  if(process.env.RAY_S3_LIVE_TEST_APPROVED!=='synthetic-bounded-test'||!process.env.RAY_S3_TEST_RUN) throw new Error('Activation gate');
  const config=mediaConfig();
  if(!config||!config.prefix.startsWith('dev/test-runs/'))throw new Error('Test namespace required');
  const args=process.argv.slice(2);if(args.length && (args.length!==1||args[0]!=='--cleanup'))throw new Error('Invalid command');
  const directory=join(tmpdir(),'ray-s3-'+process.env.RAY_S3_TEST_RUN),manifestPath=join(directory,'manifest.json');
  if(args[0]==='--cleanup') {
    const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
    if(manifest.bucket!==config.bucket||manifest.prefix!==config.prefix||!Array.isArray(manifest.keys)||manifest.keys.length!==3||manifest.keys.some(key=>!key.startsWith(config.prefix))||Date.now()<Date.parse(manifest.cleanupAfter))throw new Error('Manifest mismatch or upload permissions still valid');
    // Probe objects must never be domain media. Refuse if ANY DB row references them.
    const connection=createPostgres(localConfigFromEnv('preview'));
    try {
      await assertDatabaseIdentity(connection.pool,'preview');
      const found=await connection.pool.query('SELECT id FROM media_assets WHERE source_key=ANY($1::text[]) OR output_key=ANY($1::text[])', [manifest.keys]);
      if(found.rowCount)throw new Error('Use guarded domain orphan cleanup instead');
    } finally {await connection.close();}
    opened=await openS3Storage(config);
    for(const key of manifest.keys)await opened.storage.deleteObject(key);
    console.log('Deleted only the three reviewed probe keys. Attached form images were not touched.');
  } else {
    // Refuse reuse. Manifest precedes all writes, including a failed negative test.
    await mkdir(directory);
    const first=randomUUID(),second=randomUUID();
    const source=config.prefix+'incoming/'+first,negative=config.prefix+'incoming/'+second,output=config.prefix+'ready/'+first+'.webp';
    const manifest={bucket:config.bucket,prefix:config.prefix,keys:[source,negative,output],cleanupAfter:new Date(Date.now()+15*60_000).toISOString()};
    await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
    const bytes=await sharp({create:{width:64,height:48,channels:3,background:'#369ac4'}}).png().toBuffer();
    assert.ok(bytes.length<16384);await writeFile(join(directory,'SYNTHETIC-ray-image.png'),bytes,{flag:'wx'});
    opened=await openS3Storage(config);const storage=opened.storage;
    const intent={purpose:'station',contentType:'image/png',byteLength:bytes.length,checksum:digest(bytes)};
    const put=async(permission,data=bytes,headers=permission.headers)=>fetch(permission.url,{method:'PUT',headers,body:data,signal:AbortSignal.timeout(15000)});
    const permission=await storage.signUpload(source,intent);
    assert.equal((await put(permission)).status,200);
    assert.equal((await put(permission)).status,412);
    const attack=await storage.signUpload(negative,intent);
    assert.equal((await put(attack,bytes,{...attack.headers,'content-type':'image/jpeg'})).status,403);
    assert.equal((await put(attack,bytes,{...attack.headers,'x-amz-checksum-sha256':digest(Buffer.from('wrong'))})).status,403);
    assert.equal((await put(attack,Buffer.concat([bytes,Buffer.from('extra')]))).status,403);
    const actual=await storage.source(source,intent);const normalized=await normalizeImage(actual,'image/png');
    await storage.putOutput(output,normalized.data,normalized.checksum);await storage.putOutput(output,normalized.data,normalized.checksum);
    const read=await fetch(await storage.signRead(output),{signal:AbortSignal.timeout(15000)});assert.equal(read.status,200);assert.equal(digest(Buffer.from(await read.arrayBuffer())),normalized.checksum);
    const unsigned=`https://${config.bucket}.s3.${config.region}.amazonaws.com/${output}`;
    assert.equal((await fetch(unsigned,{signal:AbortSignal.timeout(15000)})).status,403);
    // Conservatively delay cleanup beyond every URL generated during this probe.
    manifest.cleanupAfter=new Date(Date.now()+15*60_000).toISOString();await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
    console.log('Node S3 probe passed. Browser preflight, browser Content-Length and form checklist remain required.');
    console.log('Synthetic fixture and exact cleanup manifest: '+directory);
  }
} catch {
  console.error('Live S3 verification refused or failed. Review activation, caller identity, bucket settings and the exact manifest. No raw SDK errors or signed URLs printed. A failed probe is NOT approval to change cloud settings.');
  process.exitCode=1;
} finally {opened?.close();}
