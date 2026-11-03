import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { request as httpRequest } from 'node:http';
import { privateResponse } from '../dist/middleware/privateResponse.js';
import { createAuthMiddleware, createStrictOptionalAuthMiddleware } from '../dist/middleware/authMiddleware.js';
import { requestParsers, requestErrorHandler } from '../dist/middleware/requestParsing.js';

const secret = 'synthetic-protected-response-secret-only';
const publicId = '111111111111111111111111';
const token = jwt.sign({ id: publicId }, secret, { expiresIn: '1h' });

async function fixture(t) {
  let identityMode = 'present', lookups = 0;
  const users = {
    async findIdentityByPublicId(id) {
      lookups++;
      assert.equal(id, publicId);
      if (identityMode === 'outage') throw new Error('SYNTHETIC_PRIVATE_DATABASE_DETAIL');
      return identityMode === 'missing' ? null : { _id: publicId, email: 'synthetic-private@example.invalid' };
    },
  };
  const auth = createAuthMiddleware(users, () => secret);
  const optional = createStrictOptionalAuthMiddleware(users, () => secret);
  const app = express();
  // Match the composition boundary: privacy headers precede parser/auth and
  // remain effective when a child forwards an error to the parent application.
  app.use('/protected', privateResponse);
  app.use(requestParsers());
  const child = express();
  child.disable('etag');
  child.use(privateResponse);
  const answer = (req, res) => res.json({ actor: req.user?._id ?? null,
    conditionalsPresent: !!(req.headers['if-none-match'] || req.headers['if-modified-since']) });
  child.get('/required', auth, answer);
  child.post('/required', auth, answer);
  child.get('/optional', optional, answer);
  child.get('/forwarded-error', (_req, _res, next) => next(new Error('SYNTHETIC_PRIVATE_DOMAIN_DETAIL')));
  app.use('/protected', child);
  app.get('/reports', (_req, res) => res.json({ publicReportFixture: true }));
  app.use(requestErrorHandler);
  const listener = app.listen(0, '127.0.0.1');
  await new Promise(resolve => listener.once('listening', resolve));
  t.after(() => new Promise(resolve => { listener.close(resolve); listener.closeAllConnections(); }));
  const base = `http://127.0.0.1:${listener.address().port}`;
  // Node fetch adds no-cache semantics to conditional requests. Use actual raw
  // HTTP here so the test exercises Express freshness with the supplied headers.
  const request = (path, options = {}) => new Promise((resolve, reject) => {
    const pending = httpRequest(base + path, { method: options.method ?? 'GET', headers: options.headers ?? {} }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        const headers = new Headers();
        for (let index = 0; index < response.rawHeaders.length; index += 2) headers.append(response.rawHeaders[index], response.rawHeaders[index + 1]);
        resolve({ status: response.statusCode, headers,
          body: raw && headers.get('content-type')?.includes('json') ? JSON.parse(raw) : raw });
      });
      response.on('error', reject);
    });
    pending.setTimeout(5000, () => pending.destroy(new Error('Synthetic HTTP fixture timed out')));
    pending.on('error', reject);
    pending.end(options.body);
  });
  return { request, setMode: mode => { identityMode = mode; }, lookups: () => lookups };
}

function protectedHeaders(response) {
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('pragma'), 'no-cache');
  assert.equal(response.headers.get('etag'), null);
  assert.notEqual(response.status, 304);
}

const bearer = value => ({ Authorization: `Bearer ${value}` });
const conditionals = { 'If-None-Match': '*', 'If-Modified-Since': new Date().toUTCString() };

test('protected headers survive parser rejection, auth responses and forwarded parent errors without conditional 304', async t => {
  t.mock.method(console, 'error', () => {});
  const { request } = await fixture(t);
  const malformed = await request('/protected/required', { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...conditionals }, body: '{"SYNTHETIC_PRIVATE_BODY":' });
  assert.equal(malformed.status, 400);assert.deepEqual(malformed.body, { message: 'Malformed request body' });
  const denied = await request('/protected/required', { headers: conditionals });
  assert.equal(denied.status, 401);
  const accepted = await request('/protected/required', { headers: { ...conditionals, ...bearer(token) } });
  assert.equal(accepted.status, 200);assert.deepEqual(accepted.body, { actor: publicId, conditionalsPresent: false });
  const forwarded = await request('/protected/forwarded-error', { headers: conditionals });
  assert.equal(forwarded.status, 500);assert.deepEqual(forwarded.body, { error: 'ServerError', message: 'Internal Server Error' });
  const head = await request('/protected/required', { method: 'HEAD', headers: { ...conditionals, ...bearer(token) } });
  assert.equal(head.status, 200);assert.equal(head.body, '');
  for (const response of [malformed, denied, accepted, forwarded, head]) {
    protectedHeaders(response);
    assert.doesNotMatch(JSON.stringify(response.body), /SYNTHETIC_PRIVATE|synthetic-private@example\.invalid/);
  }
});

test('required authentication distinguishes missing/invalid identities from a sanitized identity-store outage', async t => {
  t.mock.method(console, 'error', () => {});
  const api = await fixture(t);
  assert.equal((await api.request('/protected/required')).status, 401);
  for (const invalid of ['invalid', jwt.sign({ id: publicId }, 'synthetic-wrong-secret'),
    jwt.sign({ id: publicId }, secret, { expiresIn: -1 }), jwt.sign({ id: 'invalid-public-id' }, secret)]) {
    const response = await api.request('/protected/required', { headers: bearer(invalid) });
    assert.equal(response.status, 401);protectedHeaders(response);
  }
  assert.equal(api.lookups(), 0, 'invalid credentials never reach the identity store');
  const valid = await api.request('/protected/required', { headers: bearer(token) });
  assert.equal(valid.status, 200);assert.equal(valid.body.actor, publicId);
  api.setMode('missing');
  const missing = await api.request('/protected/required', { headers: bearer(token) });
  assert.equal(missing.status, 401);assert.deepEqual(missing.body, { error: 'User not found' });
  api.setMode('outage');
  const outage = await api.request('/protected/required', { headers: { ...bearer(token), ...conditionals } });
  assert.equal(outage.status, 500);assert.deepEqual(outage.body, { error: 'ServerError', message: 'Internal Server Error' });
  protectedHeaders(outage);assert.doesNotMatch(JSON.stringify(outage.body), /DATABASE|Authentication service|example\.invalid/);
});

test('strict optional authentication permits only absent credentials to become guest access', async t => {
  t.mock.method(console, 'error', () => {});
  const api = await fixture(t);
  const guest = await api.request('/protected/optional');
  assert.equal(guest.status, 200);assert.equal(guest.body.actor, null);assert.equal(api.lookups(), 0);
  const valid = await api.request('/protected/optional', { headers: bearer(token) });
  assert.equal(valid.status, 200);assert.equal(valid.body.actor, publicId);
  for (const Authorization of ['invalid', 'Basic synthetic', 'Bearer invalid', '']) {
    const invalid = await api.request('/protected/optional', { headers: { Authorization } });
    assert.equal(invalid.status, 401);protectedHeaders(invalid);
  }
  api.setMode('missing');
  assert.equal((await api.request('/protected/optional', { headers: bearer(token) })).status, 401);
  api.setMode('outage');
  const outage = await api.request('/protected/optional', { headers: bearer(token) });
  assert.equal(outage.status, 500);protectedHeaders(outage);
  assert.equal((await api.request('/protected/optional')).status, 200, 'absence remains guest even while authenticated lookup is unavailable');
  protectedHeaders(guest);protectedHeaders(valid);
});

test('private response boundary leaves independent Report response ETag and conditional behavior unchanged', async t => {
  const { request } = await fixture(t);
  const first = await request('/reports');
  assert.equal(first.status, 200);assert.deepEqual(first.body, { publicReportFixture: true });
  const etag = first.headers.get('etag');assert.ok(etag);
  assert.notEqual(first.headers.get('cache-control'), 'private, no-store');
  const conditional = await request('/reports', { headers: { 'If-None-Match': etag } });
  assert.equal(conditional.status, 304);assert.equal(conditional.body, '');assert.equal(conditional.headers.get('etag'), etag);
});
