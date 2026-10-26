import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { openTestDatabase } from './database.mjs';
import { applyLocalMigrations } from '../../dist/db/migrate.js';
import { createPostgres } from '../../dist/db/connection.js';
import { createMediaService } from '../../dist/media/service.js';
import { MediaError, MAX_BYTES, MEDIA_DAILY_BYTES, MEDIA_DAILY_INTENTS } from '../../dist/media/types.js';

const intent = { purpose: 'station', contentType: 'image/png', byteLength: 1, checksum: Buffer.alloc(32).toString('base64') };
const quota = error => error instanceof MediaError && error.status === 429 && Number.isInteger(error.retryAfter) && error.retryAfter > 0;

test('durable media issuance reservations with real disposable PostgreSQL and no storage requests', async t => {
  const owned = await openTestDatabase(t);
  await applyLocalMigrations(owned, 'test', owned.url);
  const first = createPostgres({ connectionString: owned.url, max: 3, application_name: 'ray-budget-first' });
  const second = createPostgres({ connectionString: owned.url, max: 3, application_name: 'ray-budget-second' });
  t.after(async () => { await first.close(); await second.close(); });
  let signed = 0;
  const storage = {
    async signUpload() { signed++; return { url: 'https://synthetic.invalid/upload', headers: {} }; },
    source() { assert.fail('No real or mocked image transfer is required for issuance tests'); },
    putOutput() { assert.fail('No output write'); }, signRead() { assert.fail('No read'); }, deleteObject() { assert.fail('No cleanup'); },
  };
  const service = createMediaService(first.db, storage);
  const other = createMediaService(second.db, storage);
  const actor = async () => {
    const publicId = randomBytes(12).toString('hex');
    const { rows } = await owned.pool.query(`INSERT INTO users(public_id,first_name,last_name,email,password_hash)
      VALUES($1,'Synthetic','Budget',$2,'synthetic-unused-hash') RETURNING id`, [publicId, randomUUID() + '@example.invalid']);
    return { id: rows[0].id, publicId };
  };
  const count = async user => Number((await owned.pool.query('SELECT count(*) AS n FROM media_assets WHERE owner_id=$1', [user.id])).rows[0].n);
  const seed = async (user, amount, bytes = 1, state = 'deleted', expired = false) => {
    const { rows } = await owned.pool.query(`WITH fixtures AS (SELECT gen_random_uuid() AS id FROM generate_series(1,$2::integer))
      INSERT INTO media_assets(id,owner_id,purpose,source_key,output_key,content_type,byte_length,checksum,state,
        upload_expires_at,expires_at,created_at,output_bytes,output_checksum,width,height)
      SELECT id,$1,'station','dev/incoming/'||id,'dev/ready/'||id||'.webp','image/png',$3,$4,$5,
        clock_timestamp() + CASE WHEN $6 THEN interval '-2 hours' ELSE interval '5 minutes' END,
        clock_timestamp() + CASE WHEN $6 THEN interval '-1 hour' ELSE interval '1 hour' END,
        clock_timestamp()-interval '2 minutes',
        CASE WHEN $5='ready' THEN 1 END, CASE WHEN $5='ready' THEN $4 END,
        CASE WHEN $5='ready' THEN 1 END, CASE WHEN $5='ready' THEN 1 END FROM fixtures RETURNING id`,
    [user.id, amount, bytes, intent.checksum, state, expired]);
    return rows.map(row => row.id);
  };

  await t.test('all states, attachment and expiry count; rejected work neither inserts nor signs; restart and rolling recovery', async () => {
    const user = await actor();
    await seed(user, MEDIA_DAILY_INTENTS - 4);
    await seed(user, 1, 1, 'failed');
    await seed(user, 1, 1, 'pending', true);
    const [attached] = await seed(user, 1, 1, 'ready');
    await service.stations.create({ name: 'SYNTHETIC budget station', location: { lat: 32, lng: 34 }, createdBy: user.publicId, imageAssetId: attached });
    await service.issue(user.publicId, intent);
    assert.equal(await count(user), MEDIA_DAILY_INTENTS);
    const before = signed;
    await assert.rejects(service.issue(user.publicId, intent), error => quota(error) && error.retryAfter > 80_000);
    await assert.rejects(other.issue(user.publicId, intent), quota, 'A separate service and pool cannot reset the reservation');
    assert.equal(await count(user), MEDIA_DAILY_INTENTS);
    assert.equal(signed, before);
    await owned.pool.query("UPDATE media_assets SET created_at=clock_timestamp()-interval '24 hours 1 second' WHERE owner_id=$1", [user.id]);
    await other.issue(user.publicId, intent);
    assert.equal(await count(user), MEDIA_DAILY_INTENTS + 1, 'Database-clock rolling window recovers without sleeping');
  });

  await t.test('declared source bytes allow the exact boundary, reject one extra byte and do not affect another account', async () => {
    const user = await actor(), separate = await actor();
    await seed(user, MEDIA_DAILY_BYTES / MAX_BYTES - 1, MAX_BYTES, 'failed');
    const allowed = await service.issue(user.publicId, { ...intent, byteLength: MAX_BYTES });
    const total = (await owned.pool.query('SELECT sum(byte_length)::integer AS bytes FROM media_assets WHERE owner_id=$1', [user.id])).rows[0].bytes;
    assert.equal(total, MEDIA_DAILY_BYTES);
    const before = signed, rows = await count(user);
    await assert.rejects(other.issue(user.publicId, intent), error => quota(error) && error.retryAfter > 80_000);
    assert.equal(signed, before); assert.equal(await count(user), rows);
    await service.issue(separate.publicId, { ...intent, byteLength: MAX_BYTES });
    await owned.pool.query("UPDATE media_assets SET state='failed' WHERE id=$1", [allowed.assetId]);
    await assert.rejects(service.issue(user.publicId, intent), quota, 'Failure does not refund reserved bytes');
    await owned.pool.query("UPDATE media_assets SET created_at=clock_timestamp()-interval '24 hours 1 second' WHERE id=(SELECT id FROM media_assets WHERE owner_id=$1 AND id<>$2 ORDER BY created_at LIMIT 1)", [user.id, allowed.assetId]);
    await other.issue(user.publicId, { ...intent, byteLength: MAX_BYTES });
  });

  await t.test('existing per-user lock gives one winner across independent instances at the daily count boundary', async () => {
    const user = await actor();
    await seed(user, MEDIA_DAILY_INTENTS - 1);
    const before = signed;
    const outcomes = await Promise.allSettled([service.issue(user.publicId, intent), other.issue(user.publicId, intent)]);
    assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
    assert.ok(outcomes.filter(result => result.status === 'rejected').every(result => quota(result.reason)));
    assert.equal(await count(user), MEDIA_DAILY_INTENTS);
    assert.equal(signed, before + 1, 'Only the transaction winner reaches signing');
  });

  await t.test('queued issuance reserves at admission time after the owner lock, without backdating its rolling window', async () => {
    const user = await actor();
    const gate = await owned.pool.connect();
    let locked = false, outcome;
    try {
      await gate.query('BEGIN'); locked = true;
      await gate.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user.id]);
      outcome = service.issue(user.publicId, intent).then(value => ({ value }), error => ({ error }));
      let blocked = false;
      for (let observation = 0; observation < 200; observation++) {
        const { rows } = await gate.query(`SELECT pid FROM pg_stat_activity
          WHERE application_name='ray-budget-first' AND wait_event_type='Lock'
          AND pg_backend_pid()=ANY(pg_blocking_pids(pid))`);
        if (rows.length) { blocked = true; break; }
      }
      assert.equal(blocked, true, 'Observe the actual queued owner row lock without sleeping');
      const { rows: [{ boundary }] } = await gate.query('SELECT clock_timestamp()::timestamptz(3) AS boundary');
      await gate.query('COMMIT'); locked = false;
      const result = await outcome;
      assert.equal(result.error, undefined);
      const { rows: [{ created_at: createdAt }] } = await gate.query('SELECT created_at FROM media_assets WHERE id=$1', [result.value.assetId]);
      assert.ok(createdAt.getTime() >= boundary.getTime(), 'Reservation timestamp must not predate the observed blocked-admission boundary');
    } finally {
      if (locked) await gate.query('ROLLBACK');
      gate.release();
      if (outcome) await outcome;
    }
  });
});
