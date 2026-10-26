import { isIP } from "node:net";
import type { Request, RequestHandler } from "express";

export type AbusePolicy = Readonly<{ limit: number; windowMs: number }>;
export const ABUSE_POLICIES = Object.freeze({
  ingress: Object.freeze({ limit: 600, windowMs: 60_000 }),
  globalIngress: Object.freeze({ limit: 6_000, windowMs: 60_000 }),
  login: Object.freeze({ limit: 120, windowMs: 15 * 60_000 }),
  registration: Object.freeze({ limit: 60, windowMs: 60 * 60_000 }),
  guestWrite: Object.freeze({ limit: 30, windowMs: 60 * 60_000 }),
  accountWrite: Object.freeze({ limit: 120, windowMs: 10 * 60_000 }),
  publicRead: Object.freeze({ limit: 300, windowMs: 60_000 }),
});
export type AbusePolicyName = keyof typeof ABUSE_POLICIES;
export type AbuseOptions = {
  now?: () => number;
  policies?: Partial<Record<AbusePolicyName, AbusePolicy>>;
  maxBucketsPerClass?: number;
};
export const RATE_LIMIT_MESSAGE = "Too many requests. Please try again later.";

type Decision = { allowed: boolean; retryAfterSeconds: number };
type Bucket = { count: number; resetAt: number };

function positiveInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid abuse-protection ${name}`);
}

// One bounded map per operation class. No timers, queue, live-bucket eviction or
// request/response references. Synchronous check+increment is atomic within this
// Node process; this state is neither shared across instances nor restart-durable.
export class BoundedWindowLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly policy: AbusePolicy;
  private lastNow = 0;
  private nextCleanup = 0;
  private firstExpiry = Infinity;

  constructor(
    policy: AbusePolicy,
    private readonly now: () => number = Date.now,
    private readonly maxBuckets = 10_000,
  ) {
    positiveInteger(policy.limit, "limit");
    positiveInteger(policy.windowMs, "window");
    positiveInteger(maxBuckets, "capacity");
    this.policy = { ...policy };
  }

  get size() { return this.buckets.size; }

  private cleanup(now: number) {
    this.firstExpiry = Infinity;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
      else this.firstExpiry = Math.min(this.firstExpiry, bucket.resetAt);
    }
    this.nextCleanup = now + Math.min(this.policy.windowMs, 60_000);
  }

  private evaluate(key: string, increment: boolean): Decision {
    const timestamp = this.now();
    if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new Error("Invalid abuse-protection clock");
    // A wall-clock correction must not replenish a requester's budget.
    const now = this.lastNow = Math.max(this.lastNow, timestamp);
    if (now >= this.nextCleanup || (this.buckets.size >= this.maxBuckets && now >= this.firstExpiry)) this.cleanup(now);
    let bucket = this.buckets.get(key);
    if (bucket && bucket.resetAt <= now) {
      this.buckets.delete(key);
      bucket = undefined;
    }
    if (!bucket) {
      if (this.buckets.size >= this.maxBuckets) {
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((this.firstExpiry - now) / 1000)) };
      }
      if (!increment) return { allowed: true, retryAfterSeconds: 0 };
      bucket = { count: 0, resetAt: now + this.policy.windowMs };
      this.buckets.set(key, bucket);
      this.firstExpiry = Math.min(this.firstExpiry, bucket.resetAt);
    }
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    if (bucket.count >= this.policy.limit) return { allowed: false, retryAfterSeconds };
    if (increment) bucket.count++;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  inspect(key: string): Decision { return this.evaluate(key, false); }
  consume(key: string): Decision { return this.evaluate(key, true); }
}

// Work only from the TCP peer. Express req.ip and all proxy headers are ignored,
// even when a legacy app has numeric trust proxy configured. A deployed reverse
// proxy therefore shares one coarse bucket until its topology is reviewed.
export function socketIdentity(req: Pick<Request, "socket">): string {
  const raw = req.socket.remoteAddress;
  if (!raw || raw.length > 128) return "ip:unknown";
  const address = raw.split("%", 1)[0];
  const family = isIP(address);
  if (family === 4) return `ip4:${address}`;
  if (family !== 6) return "ip:unknown";

  // Convert an embedded dotted IPv4 tail before expanding the validated IPv6.
  const tail = address.slice(address.lastIndexOf(":") + 1);
  const expandedTail = tail.includes(".") ? (() => {
    const octets = tail.split(".").map(Number);
    return `${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  })() : tail;
  const normalized = address.slice(0, address.lastIndexOf(":") + 1) + expandedTail;
  const halves = normalized.split("::");
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const words = (halves.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right] : left).map(part => parseInt(part, 16));
  if (words.slice(0, 5).every(word => word === 0) && words[5] === 0xffff) {
    return `ip4:${words[6] >> 8}.${words[6] & 255}.${words[7] >> 8}.${words[7] & 255}`;
  }
  // /56 groups temporary addresses and all /64 subnets within the same /56.
  return `ip6:${words.slice(0, 3).map(word => word.toString(16).padStart(4, "0")).join(":")}:${(words[3] & 0xff00).toString(16).padStart(4, "0")}/56`;
}

function accountIdentity(req: Request): string | undefined {
  const value = req.user?._id;
  return typeof value === "string" && value.length > 0 && value.length <= 128 ? `account:${value}` : undefined;
}

export function createAbuseProtection(options: AbuseOptions = {}) {
  const limiters = Object.fromEntries(Object.entries(ABUSE_POLICIES).map(([name, policy]) => [
    name, new BoundedWindowLimiter(options.policies?.[name as AbusePolicyName] ?? policy, options.now, name === "globalIngress" ? 1 : options.maxBucketsPerClass),
  ])) as Record<AbusePolicyName, BoundedWindowLimiter>;

  function reject(res: Parameters<RequestHandler>[1], result: Decision) {
    res.set({ "Retry-After": String(result.retryAfterSeconds), "Cache-Control": "no-store" });
    res.status(429).json({ message: RATE_LIMIT_MESSAGE });
  }

  const ingress: RequestHandler = (req, res, next) => {
    if (req.method === "OPTIONS") { next(); return; }
    const key = socketIdentity(req);
    const peer = limiters.ingress.inspect(key);
    if (!peer.allowed) { reject(res, peer); return; }
    const global = limiters.globalIngress.inspect("global");
    if (!global.allowed) { reject(res, global); return; }
    // No asynchronous work or interleaving occurs between these checks/commits.
    // Rejected peers do not consume global budget; global rejections debit none.
    limiters.ingress.consume(key);
    limiters.globalIngress.consume("global");
    next();
  };

  function middleware(name: AbusePolicyName, account: boolean): RequestHandler {
    return (req, res, next) => {
      if (req.method === "OPTIONS") { next(); return; }
      const actor = accountIdentity(req);
      if (name === "guestWrite" && actor) { next(); return; }
      if (account && !actor) {
        res.status(401).json({ error: "Authorization token required" });
        return;
      }
      const result = limiters[name].consume(account ? actor! : socketIdentity(req));
      if (!result.allowed) {
        reject(res, result);
        return;
      }
      next();
    };
  }

  return {
    ingress,
    login: middleware("login", false),
    registration: middleware("registration", false),
    guestWrite: middleware("guestWrite", false),
    accountWrite: middleware("accountWrite", true),
    publicRead: middleware("publicRead", false),
  };
}

export type AbuseProtection = ReturnType<typeof createAbuseProtection>;
