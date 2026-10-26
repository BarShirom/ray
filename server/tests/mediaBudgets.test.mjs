import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { createMediaService } from '../dist/media/service.js';
import { createMediaRouter } from '../dist/media/routes.js';
import { MediaError } from '../dist/media/types.js';

const unavailableStorage = new Proxy({}, { get() { assert.fail('Rejected completion must not call storage'); } });
const missing = error => error instanceof MediaError && error.status === 404;
const limited = error => error instanceof MediaError && error.status === 429 && Number.isInteger(error.retryAfter) && error.retryAfter > 0;

test('completion attempts are account-scoped, canonical, bounded and recover with a controlled clock', async () => {
  let now = 10_000, transactions = 0;
  const db = { async transaction() { transactions++; throw new MediaError(404, 'Image not found'); } };
  const service = createMediaService(db, unavailableStorage, 'dev/', () => now);
  const a = 'a'.repeat(24), b = 'b'.repeat(24);
  for (let attempt = 0; attempt < 10; attempt++) await assert.rejects(service.complete(a, randomUUID()), missing);
  assert.equal(transactions, 10);
  now += 59_001;
  await assert.rejects(service.complete(a.toUpperCase(), randomUUID()), error => limited(error) && error.retryAfter === 1);
  assert.equal(transactions, 10, 'Rate rejection happens before database or processing work');
  await assert.rejects(service.complete(b, randomUUID()), missing);
  now = 70_000;
  await assert.rejects(service.complete(a, randomUUID()), missing);
  assert.equal(transactions, 12, 'Exact minute boundary restores capacity without sleeping');
});

test('completion identity capacity is bounded and expired entries release capacity', async () => {
  let now = 0, transactions = 0;
  const service = createMediaService({ async transaction() { transactions++; throw new MediaError(404, 'Image not found'); } }, unavailableStorage, 'dev/', () => now);
  for (let owner = 0; owner < 1024; owner++) await assert.rejects(service.complete(owner.toString(16).padStart(24, '0'), randomUUID()), missing);
  await assert.rejects(service.complete('f'.repeat(24), randomUUID()), limited);
  assert.equal(transactions, 1024);
  await assert.rejects(service.complete('0'.repeat(24), randomUUID()), missing, 'Existing account can still use its own quota');
  now = 60_000;
  await assert.rejects(service.complete('f'.repeat(24), randomUUID()), missing);
  assert.equal(transactions, 1026);
});

test('existing per-process and per-owner worker ceilings reject before work and release after failure', async () => {
  const gates = [];
  let transactions = 0;
  const db = { transaction() { transactions++; return new Promise((_, reject) => gates.push(() => reject(new MediaError(404, 'Image not found')))); } };
  const service = createMediaService(db, unavailableStorage, 'dev/', () => 0);
  const first = service.complete('a'.repeat(24), randomUUID());
  const second = service.complete('b'.repeat(24), randomUUID());
  await assert.rejects(service.complete('a'.repeat(24), randomUUID()), error => limited(error) && error.retryAfter === 1);
  await assert.rejects(service.complete('c'.repeat(24), randomUUID()), error => limited(error) && error.retryAfter === 1);
  assert.equal(transactions, 2);
  const settled = Promise.allSettled([first, second]);
  for (const release of gates.splice(0)) release();
  assert.ok((await settled).every(result => result.status === 'rejected' && missing(result.reason)));
  const third = service.complete('c'.repeat(24), randomUUID());
  const rejected = assert.rejects(third, missing);
  gates.shift()();
  await rejected;
  assert.equal(transactions, 3);
});

test('media router forwards positive Retry-After without changing its bounded error body', async t => {
  const app = express();
  const deny = async () => { throw new MediaError(429, 'Image processing busy; try again shortly', 2.1); };
  app.use('/api/media', createMediaRouter({ issue: deny, complete: deny, content: deny }, (req, _res, next) => { req.user = { _id: 'a'.repeat(24) }; next(); }));
  app.use((error, _req, res, _next) => res.status(error.status).json({ message: error.message }));
  const listener = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  t.after(() => new Promise(resolve => { listener.close(resolve); listener.closeAllConnections(); }));
  for (const [method, suffix] of [['POST', 'uploads'], ['POST', randomUUID() + '/complete'], ['GET', randomUUID() + '/content']]) {
    const response = await fetch(`http://127.0.0.1:${listener.address().port}/api/media/${suffix}`, { method });
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '3');
    assert.deepEqual(await response.json(), { message: 'Image processing busy; try again shortly' });
  }
  assert.equal(new MediaError(429, 'Synthetic').retryAfter, 60);
  for (const invalid of [NaN, Infinity, -1, 0]) assert.ok(Number.isInteger(new MediaError(429, 'Synthetic', invalid).retryAfter));
});
