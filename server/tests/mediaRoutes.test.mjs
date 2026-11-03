import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createMediaRouter } from '../dist/media/routes.js';
import { MediaError } from '../dist/media/types.js';
import { requestParsers, requestErrorHandler } from '../dist/middleware/requestParsing.js';
import { privateResponse } from '../dist/middleware/privateResponse.js';

const assetId = '11111111-1111-4111-8111-111111111111';
const ownerId = '111111111111111111111111';

test('media completion accepts only an empty object and no query before asset/owner service lookup', async t => {
  const calls = [];
  const service = {
    async complete(owner, id) {
      calls.push({ owner, id });
      return { assetId: id, state: 'ready', expiresAt: '2030-01-01T00:00:00.000Z' };
    },
  };
  const authenticated = (req, _res, next) => { req.user = { _id: ownerId }; next(); };
  const app = express();
  app.use('/api/media', privateResponse);
  app.use(requestParsers());
  app.use('/api/media', createMediaRouter(service, authenticated, authenticated));
  app.use((error, _req, res, next) => {
    if (error instanceof MediaError) { res.status(error.status).json({ message: error.message }); return; }
    next(error);
  });
  app.use(requestErrorHandler);
  const listener = app.listen(0, '127.0.0.1');
  await new Promise(resolve => listener.once('listening', resolve));
  t.after(() => new Promise(resolve => { listener.close(resolve); listener.closeAllConnections(); }));
  const base = `http://127.0.0.1:${listener.address().port}/api/media/${assetId}/complete`;
  const post = async (body, suffix = '') => {
    // Omit Content-Type with an absent body: Express normalizes an empty JSON
    // request to {}, which is equivalent to the accepted empty-object contract.
    const response = await fetch(base + suffix, { method: 'POST',
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), signal: AbortSignal.timeout(5000) });
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
  for (const [body, query] of [[undefined, ''], [[], ''], [{ state: 'ready' }, ''], [{ ownerId: 'another-user' }, ''], [{}, '?ownerId=another-user'], [{}, '?retry=1']]) {
    const response = await post(body, query);
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('etag'), null);
    assert.equal(calls.length, 0, 'invalid input cannot trigger owner lookup, completion, storage or processing');
  }
  const accepted = await post({});
  assert.equal(accepted.status, 200);
  assert.deepEqual(accepted.body, { assetId, state: 'ready', expiresAt: '2030-01-01T00:00:00.000Z' });
  assert.deepEqual(calls, [{ owner: ownerId, id: assetId }]);
});
