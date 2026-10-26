import assert from "node:assert/strict";
import test from "node:test";
import {
  ABUSE_POLICIES, BoundedWindowLimiter, RATE_LIMIT_MESSAGE,
  createAbuseProtection, socketIdentity,
} from "../dist/security/abuseProtection.js";

function request(address = "192.0.2.1", account, headers = {}) {
  const req = {
    method: "POST", socket: { remoteAddress: address }, headers,
    ...(account ? { user: { _id: account } } : {}),
  };
  Object.defineProperty(req, "ip", { get() { assert.fail("Express proxy-derived identity must not be read"); } });
  return req;
}

function invoke(middleware, req) {
  let status, body, continued = false;
  const headers = {};
  const res = {
    set(values) { Object.assign(headers, values); return this; },
    status(value) { status = value; return this; },
    json(value) { body = value; return this; },
  };
  middleware(req, res, () => { continued = true; });
  return { status, body, headers, continued };
}

const policyNames = ["ingress", "login", "registration", "guestWrite", "accountWrite", "publicRead"];

test("every request class allows its exact boundary, rejects excess and recovers without sleeps", () => {
  for (const name of policyNames) {
    let now = 10_000;
    const protection = createAbuseProtection({ now: () => now, policies: { [name]: { limit: 2, windowMs: 1500 } } });
    const req = request("192.0.2.1", name === "accountWrite" ? "account-a" : undefined);
    assert.equal(invoke(protection[name], req).continued, true, name);
    assert.equal(invoke(protection[name], req).continued, true, name);
    const rejected = invoke(protection[name], req);
    assert.equal(rejected.status, 429, name);
    assert.deepEqual(rejected.body, { message: RATE_LIMIT_MESSAGE });
    assert.deepEqual(rejected.headers, { "Retry-After": "2", "Cache-Control": "no-store" });
    assert.equal(rejected.continued, false);
    now += 1499;
    assert.equal(invoke(protection[name], req).headers["Retry-After"], "1");
    now++;
    assert.equal(invoke(protection[name], req).continued, true, `${name} reset`);
  }
});

test("synchronous concurrent calls cannot oversubscribe a bucket", async () => {
  const protection = createAbuseProtection({ now: () => 1000, policies: { accountWrite: { limit: 7, windowMs: 1000 } } });
  const results = await Promise.all(Array.from({ length: 50 }, async () => invoke(protection.accountWrite, request("192.0.2.1", "account-a"))));
  assert.equal(results.filter(result => result.continued).length, 7);
  assert.equal(results.filter(result => result.status === 429).length, 43);
});

test("capacity fails closed without evicting live identities and recovers at the earliest expiry", () => {
  let now = 1000;
  const limiter = new BoundedWindowLimiter({ limit: 2, windowMs: 5000 }, () => now, 2);
  assert.equal(limiter.consume("a").allowed, true);
  now += 1000;
  assert.equal(limiter.consume("b").allowed, true);
  assert.equal(limiter.size, 2);
  for (let index = 0; index < 100; index++) {
    assert.deepEqual(limiter.consume(`new-${index}`), { allowed: false, retryAfterSeconds: 4 });
  }
  assert.equal(limiter.size, 2);
  assert.equal(limiter.consume("a").allowed, true, "capacity must not block an existing identity within budget");
  assert.equal(limiter.consume("a").allowed, false, "new identities must not evict a full live bucket");
  now = 6000;
  assert.equal(limiter.consume("c").allowed, true);
  assert.equal(limiter.size, 2, "only expired a was removed; b remains live");
  assert.equal(limiter.consume("b").allowed, true);
  assert.equal(limiter.consume("b").allowed, false);
});

test("bounded idle cleanup removes expired entries and backward clock corrections do not reset quota", () => {
  let now = 1000;
  const limiter = new BoundedWindowLimiter({ limit: 1, windowMs: 1000 }, () => now, 3);
  limiter.consume("a"); limiter.consume("b"); limiter.consume("c");
  now = 500;
  assert.equal(limiter.consume("a").allowed, false);
  now = 2000;
  assert.equal(limiter.consume("d").allowed, true);
  assert.equal(limiter.size, 1);
});

test("global ingress bounds rotating IPs and denied peers cannot spend the global budget", () => {
  let now = 1000;
  const protection = createAbuseProtection({ now: () => now, policies: {
    ingress: { limit: 1, windowMs: 1000 }, globalIngress: { limit: 3, windowMs: 1000 },
  } });
  assert.equal(invoke(protection.ingress, request("192.0.2.1")).continued, true);
  for (let index = 0; index < 20; index++) assert.equal(invoke(protection.ingress, request("192.0.2.1")).status, 429);
  assert.equal(invoke(protection.ingress, request("192.0.2.2")).continued, true);
  assert.equal(invoke(protection.ingress, request("192.0.2.3")).continued, true);
  assert.equal(invoke(protection.ingress, request("192.0.2.4")).status, 429);
  now = 2000;
  assert.equal(invoke(protection.ingress, request("192.0.2.4")).continued, true);
});

test("global rejection does not allocate or debit the peer budget", () => {
  let now = 1000;
  const protection = createAbuseProtection({ now: () => now, maxBucketsPerClass: 2, policies: {
    ingress: { limit: 1, windowMs: 10_000 }, globalIngress: { limit: 1, windowMs: 1000 },
  } });
  assert.equal(invoke(protection.ingress, request("192.0.2.1")).continued, true);
  for (let index = 2; index < 100; index++) assert.equal(invoke(protection.ingress, request(`192.0.2.${index}`)).status, 429);
  now = 2000;
  assert.equal(invoke(protection.ingress, request("192.0.2.99")).continued, true);
});

test("socket IP identities ignore all supplied proxy, forwarding and client-IP headers", () => {
  const protection = createAbuseProtection({ now: () => 1000, policies: { login: { limit: 1, windowMs: 1000 } } });
  const first = request("192.0.2.1", undefined, { "x-forwarded-for": "198.51.100.1", forwarded: "for=198.51.100.1", "x-real-ip": "198.51.100.1" });
  assert.equal(invoke(protection.login, first).continued, true);
  const spoofed = request("192.0.2.1", undefined, { "x-forwarded-for": "203.0.113.2", forwarded: "for=203.0.113.2", "x-real-ip": "203.0.113.2" });
  assert.equal(invoke(protection.login, spoofed).status, 429);
  assert.equal(invoke(protection.login, request("192.0.2.2", undefined, first.headers)).continued, true);
});

test("IPv4 mapped IPv6 and equivalent IPv6 spellings cannot rotate identity", () => {
  const ipv4 = socketIdentity(request("192.0.2.129"));
  for (const address of ["::ffff:192.0.2.129", "::FFFF:c000:0281", "0:0:0:0:0:ffff:c000:281"]) {
    assert.equal(socketIdentity(request(address)), ipv4);
  }
  const ipv6 = socketIdentity(request("2001:db8:abcd:1200::1"));
  for (const address of ["2001:0DB8:ABCD:12ff:ffff:ffff:ffff:ffff", "2001:db8:abcd:12ab::192.0.2.1", "2001:db8:abcd:1200:0:0:0:1%eth0"]) {
    assert.equal(socketIdentity(request(address)), ipv6);
  }
  assert.notEqual(socketIdentity(request("2001:db8:abcd:1300::1")), ipv6);
  assert.equal(socketIdentity(request("::1")), socketIdentity(request("0:0:0:0:0:0:0:1")));
});

test("temporary IPv6 address and /64 subnet rotation within /56 spends the same quota", () => {
  const protection = createAbuseProtection({ now: () => 1000, policies: { guestWrite: { limit: 1, windowMs: 1000 } } });
  assert.equal(invoke(protection.guestWrite, request("2001:db8:1:ab00::1")).continued, true);
  assert.equal(invoke(protection.guestWrite, request("2001:db8:1:abff:abcd::1")).status, 429);
  assert.equal(invoke(protection.guestWrite, request("2001:db8:1:ac00::1")).continued, true);
});

test("unrecognized or missing socket identity uses one safe bounded fallback", () => {
  const protection = createAbuseProtection({ now: () => 1000, policies: { login: { limit: 1, windowMs: 1000 } } });
  assert.equal(socketIdentity(request("x".repeat(129))), "ip:unknown");
  assert.equal(invoke(protection.login, { ...request(), socket: {} }).continued, true);
  assert.equal(invoke(protection.login, request("unrecognized")).status, 429);
});

test("verified accounts behind a shared IP retain separate write budgets", () => {
  const protection = createAbuseProtection({ now: () => 1000, policies: { accountWrite: { limit: 1, windowMs: 1000 }, guestWrite: { limit: 1, windowMs: 1000 } } });
  assert.equal(invoke(protection.accountWrite, request("192.0.2.1", "account-a")).continued, true);
  assert.equal(invoke(protection.accountWrite, request("192.0.2.1", "account-b")).continued, true);
  assert.equal(invoke(protection.accountWrite, request("198.51.100.2", "account-a")).status, 429);
  assert.equal(invoke(protection.guestWrite, request("192.0.2.1")).continued, true);
  assert.equal(invoke(protection.guestWrite, request("192.0.2.1")).status, 429);
  assert.equal(invoke(protection.guestWrite, request("192.0.2.1", "account-a")).continued, true);
});

test("account identity never comes from unverified request body, headers or claimed email", () => {
  const protection = createAbuseProtection({ now: () => 1000 });
  const req = { ...request(), body: { _id: "victim", userId: "victim", email: "synthetic@example.invalid" }, headers: { authorization: "Bearer synthetic-not-a-token" } };
  const result = invoke(protection.accountWrite, req);
  assert.equal(result.status, 401);
  assert.equal(result.continued, false);
  assert.doesNotMatch(JSON.stringify(result), /victim|synthetic@example|synthetic-not/);
});

test("login and registration attempts count equally across emails and have separate budgets", () => {
  const protection = createAbuseProtection({ now: () => 1000, policies: { login: { limit: 2, windowMs: 1000 }, registration: { limit: 1, windowMs: 1000 } } });
  for (const email of ["first@example.invalid", "second@example.invalid"]) {
    assert.equal(invoke(protection.login, { ...request(), body: { email } }).continued, true);
  }
  assert.equal(invoke(protection.login, { ...request(), body: { email: "victim@example.invalid" } }).status, 429);
  assert.equal(invoke(protection.registration, request()).continued, true);
  assert.equal(invoke(protection.registration, request()).status, 429);
  assert.equal(invoke(protection.login, request("192.0.2.2")).continued, true);
});

test("OPTIONS does not consume budgets and every default policy remains finite", () => {
  const protection = createAbuseProtection({ now: () => 1000, policies: { login: { limit: 1, windowMs: 1000 } } });
  for (let index = 0; index < 5; index++) assert.equal(invoke(protection.login, { ...request(), method: "OPTIONS" }).continued, true);
  assert.equal(invoke(protection.login, request()).continued, true);
  assert.equal(invoke(protection.login, request()).status, 429);
  for (const policy of Object.values(ABUSE_POLICIES)) {
    assert.ok(Number.isSafeInteger(policy.limit) && policy.limit > 0);
    assert.ok(Number.isSafeInteger(policy.windowMs) && policy.windowMs > 0);
  }
});

test("invalid limiter settings are rejected rather than disabling protection", () => {
  for (const value of [0, -1, Infinity, NaN, 1.5]) {
    assert.throws(() => new BoundedWindowLimiter({ limit: value, windowMs: 1000 }));
    assert.throws(() => new BoundedWindowLimiter({ limit: 1, windowMs: value }));
    assert.throws(() => new BoundedWindowLimiter({ limit: 1, windowMs: 1000 }, Date.now, value));
  }
});
