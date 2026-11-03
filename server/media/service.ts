import { randomUUID } from "node:crypto";
import { and, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { createPostgres } from "../db/connection.js";
import { mediaAssets as assets, users, feedingStations, reports } from "../db/schema.js";
import { MediaError, UPLOAD_SECONDS, READ_SECONDS, MEDIA_DAILY_INTENTS, MEDIA_DAILY_BYTES, type Intent, type MediaStorage, type Purpose } from "./types.js";
import { normalizeImage } from "./image.js";
import { intentSchema, assetIdSchema } from "./validation.js";
import { createPostgresFeedingStationStore } from "../feedingStations/postgresFeedingStationStore.js";
import { createPostgresReportStore } from "../reports/postgresReportStore.js";
import type { FeedingStationStore, CreateFeedingStation } from "../feedingStations/feedingStationStore.js";
import type { ReportStore } from "../reports/reportStore.js";
import type { AuthIdentity } from "../users/userStore.js";
import { lockAndAuthorizeStation, resolveStationPrincipalFromVerifiedIdentity } from "../feedingStations/stationAuthorization.js";
import { mediaContentUrl as contentUrl } from "./contentUrl.js";

type Database = ReturnType<typeof createPostgres>["db"];
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Asset = typeof assets.$inferSelect;
const unattached = and(isNull(assets.stationId), isNull(assets.reportId));
const safe = async <T>(fn: () => Promise<T>): Promise<T> => {
  try { return await fn(); } catch (e) {
    if (e instanceof MediaError) throw e;
    throw new MediaError(503, "Media operation unavailable; please try again");
  }
};
const publicAsset = (row: Asset) => ({ assetId: row.id, state: row.state, expiresAt: row.expiresAt.toISOString() });

export function createMediaService(db: Database, storage: MediaStorage, prefix = "dev/", completionClock: () => number = Date.now, readClock: () => number = Date.now) {
  if (!/^dev\/(test-runs\/[0-9a-f-]{36}\/)?$/.test(prefix)) throw new Error("Invalid media prefix");
  let active = 0;
  const activeUsers = new Set<string>();
  const completionRates = new Map<string, { until: number; count: number }>();
  const rate = (owner: string) => {
    const now = completionClock();
    for (const [id, item] of completionRates) if (item.until <= now) completionRates.delete(id);
    const item = completionRates.get(owner);
    if (item && item.count >= 10 || !item && completionRates.size >= 1024) throw new MediaError(429, "Too many image completion attempts; try again in a minute", item ? (item.until - now) / 1000 : 60);
    completionRates.set(owner, item ? { ...item, count: item.count + 1 } : { until: now + 60_000, count: 1 });
  };
  async function ownerId(conn: Pick<Database, "select">, publicId: string) {
    const [owner] = await conn.select({ id: users.id }).from(users).where(eq(users.publicId, publicId.toLowerCase()));
    if (!owner) throw new MediaError(401, "Sign in to use images");
    return owner.id;
  }
  async function ownAsset(tx: Transaction, id: string, owner: string) {
    if (!assetIdSchema.safeParse(id).success) throw new MediaError(400, "Invalid asset ID");
    const [row] = await tx.select().from(assets).where(eq(assets.id, id)).for("update");
    if (!row) throw new MediaError(404, "Image not found");
    if (row.ownerId !== await ownerId(tx, owner)) throw new MediaError(403, "This image belongs to another user");
    return row;
  }
  async function claimable(tx: Transaction, ids: string[], purpose: Purpose, owner: string | null) {
    if (!ids.length) return [];
    if (!owner) throw new MediaError(401, "Sign in to attach images");
    ids = ids.map(id => id.toLowerCase());
    if (ids.length > (purpose === "station" ? 1 : 3) || new Set(ids).size !== ids.length || ids.some(id => !assetIdSchema.safeParse(id).success)) throw new MediaError(400, "Invalid image attachment list");
    const ownerUuid = await ownerId(tx, owner);
    const rows = await tx.select().from(assets).where(inArray(assets.id, ids)).orderBy(assets.id).for("update");
    if (rows.length !== ids.length) throw new MediaError(404, "Image not found");
    const [clock] = await tx.select({ now: sql<Date>`clock_timestamp()` }).from(assets).limit(1);
    for (const row of rows) {
      if (row.ownerId !== ownerUuid) throw new MediaError(403, "This image belongs to another user");
      if (row.purpose !== purpose || row.state !== "ready" || row.stationId || row.reportId || row.expiresAt.getTime() <= new Date(clock.now).getTime()) throw new MediaError(409, "Image is not ready, has expired or is already attached");
    }
    return ids;
  }
  async function createStationInTransaction(tx: Transaction, input: CreateFeedingStation) {
    if (input.image !== undefined) throw new MediaError(400, "Use imageAssetId, not an image URL");
    const ids = await claimable(tx, input.imageAssetId ? [input.imageAssetId] : [], "station", input.createdBy);
    const station = await createPostgresFeedingStationStore(tx).create({ ...input, image: ids[0] ? contentUrl(ids[0]) : undefined });
    if (ids[0]) {
      const [parent] = await tx.select({ id: feedingStations.id }).from(feedingStations).where(eq(feedingStations.publicId, station.publicId));
      await tx.update(assets).set({ stationId: parent.id }).where(eq(assets.id, ids[0]));
    }
    return station;
  }
  const stations: FeedingStationStore = { ...createPostgresFeedingStationStore(db),
    create: input => safe(() => db.transaction(tx => createStationInTransaction(tx, input))),
  };
  const reportStore: ReportStore = { ...createPostgresReportStore(db),
    create: input => safe(() => db.transaction(async tx => {
      if (input.media?.length) throw new MediaError(400, "Use mediaAssetIds, not media URLs");
      const ids = await claimable(tx, input.mediaAssetIds ?? [], "report", input.createdBy);
      const report = await createPostgresReportStore(tx).create({ ...input, media: ids.map(contentUrl) });
      if (ids.length) {
        const [parent] = await tx.select({ id: reports.id }).from(reports).where(eq(reports.publicId, report.publicId));
        for (let position = 0; position < ids.length; position++) await tx.update(assets).set({ reportId: parent.id, position }).where(eq(assets.id, ids[position]));
      }
      return report;
    })),
  };
  const notFound = () => new MediaError(404, "Image not found");
  async function authorizeStationAsset(tx: Transaction, row: Asset, viewer: AuthIdentity | null) {
    if (!row.stationId || row.reportId || row.purpose !== "station" || !viewer) throw notFound();
    const [parent] = await tx.select({ publicId: feedingStations.publicId }).from(feedingStations)
      .where(eq(feedingStations.id, row.stationId)).limit(1);
    if (!parent) throw notFound();
    const principal = await resolveStationPrincipalFromVerifiedIdentity(tx, viewer);
    if (!await lockAndAuthorizeStation(tx, principal, parent.publicId)) throw notFound();
    // The station lock precedes this fresh attachment check. A copied URL or
    // upload ownership never substitutes for the actual parent policy.
    const [current] = await tx.select({ id: assets.id }).from(assets).where(and(
      eq(assets.id, row.id), eq(assets.stationId, row.stationId), isNull(assets.reportId),
      eq(assets.purpose, "station"), eq(assets.state, "ready"), eq(assets.outputKey, row.outputKey),
    )).limit(1);
    if (!current) throw notFound();
  }
  async function readCapability(id: string, viewer: AuthIdentity | null, stationOnly: boolean) {
    if (!assetIdSchema.safeParse(id).success) throw new MediaError(400, "Invalid asset ID");
    const [row] = await db.select().from(assets).where(and(eq(assets.id, id), eq(assets.state, "ready"))).limit(1);
    if (!row) throw notFound();
    if (row.stationId) {
      // Initial denial must perform no signing. The result is checked again after
      // signing, since revocation/visibility may change while external work waits.
      await db.transaction(tx => authorizeStationAsset(tx, row, viewer));
    } else {
      if (stationOnly || row.purpose !== "report" || !row.reportId) throw notFound();
      const [parent] = await db.select({ id: reports.id }).from(reports).where(eq(reports.id, row.reportId)).limit(1);
      if (!parent) throw notFound();
    }
    // Conservatively include signer latency in the nominal lifetime. Rounding
    // down matches SigV4 second precision; a slow signer cannot extend this receipt.
    const expiresAt = Math.floor(readClock() / 1000) * 1000 + READ_SECONDS * 1000;
    const url = await storage.signRead(row.outputKey);
    if (row.stationId) await db.transaction(async tx => {
      await authorizeStationAsset(tx, row, viewer);
      if (readClock() >= expiresAt) throw new MediaError(409, "Image read permission expired; request it again");
    });
    else {
      const [current] = await db.select({ id: assets.id }).from(assets).innerJoin(reports, eq(reports.id, assets.reportId))
        .where(and(eq(assets.id, row.id), eq(assets.reportId, row.reportId!), isNull(assets.stationId), eq(assets.purpose, "report"), eq(assets.state, "ready"), eq(assets.outputKey, row.outputKey))).limit(1);
      if (!current) throw notFound();
    }
    if (readClock() >= expiresAt) throw new MediaError(409, "Image read permission expired; request it again");
    return url;
  }
  return {
    stations, reports: reportStore,
    createStationInTransaction: (tx: Transaction, input: CreateFeedingStation) => safe(() => createStationInTransaction(tx, input)),
    issue: (owner: string, input: Intent) => safe(async () => {
      const parsed = intentSchema.safeParse(input);
      if (!parsed.success) throw new MediaError(400, "Use JPEG, PNG or WebP, 1 byte to 8 MiB, a SHA-256 checksum and station/report purpose");
      const intent = parsed.data;
      const row = await db.transaction(async tx => {
        const uuid = await ownerId(tx, owner);
        // Serialize per-user issuance to enforce quotas even across processes.
        await tx.select({ id: users.id }).from(users).where(eq(users.id, uuid)).for("update");
        const [clock] = await tx.select({ now: sql<Date>`clock_timestamp()` }).from(users).where(eq(users.id, uuid));
        const now = new Date(clock.now).getTime();
        const minuteStart = new Date(now - 60_000), dayStart = new Date(now - 86_400_000);
        const pending = and(unattached, gt(assets.expiresAt, new Date(now)), sql`${assets.state} IN ('pending','processing','ready')`);
        const recent = gt(assets.createdAt, minuteStart), daily = gt(assets.createdAt, dayStart);
        const [counts] = await tx.select({
          outstanding: sql<number>`count(*) filter (where ${pending})::integer`,
          outstandingExpiry: sql<Date | null>`min(${assets.expiresAt}) filter (where ${pending})`,
          recent: sql<number>`count(*) filter (where ${recent})::integer`,
          recentStart: sql<Date | null>`min(${assets.createdAt}) filter (where ${recent})`,
          daily: sql<number>`count(*) filter (where ${daily})::integer`,
          dailyBytes: sql<number>`coalesce(sum(${assets.byteLength}) filter (where ${daily}), 0)::double precision`,
          dailyStart: sql<Date | null>`min(${assets.createdAt}) filter (where ${daily})`,
        }).from(assets).where(eq(assets.ownerId, uuid));
        // All states count toward the rolling budgets: attachment, expiry,
        // signing failure and cleanup must not refund issuance capacity.
        const quota = (until: Date | null, window = 0) => new MediaError(429,
          "Image upload quota reached; finish existing uploads or wait before trying again",
          until ? (new Date(until).getTime() + window - now) / 1000 : 60);
        if (counts.outstanding >= 6) throw quota(counts.outstandingExpiry);
        if (counts.recent >= 10) throw quota(counts.recentStart, 60_000);
        if (counts.daily >= MEDIA_DAILY_INTENTS || counts.dailyBytes + intent.byteLength > MEDIA_DAILY_BYTES) throw quota(counts.dailyStart, 86_400_000);
        const id = randomUUID();
        const [created] = await tx.insert(assets).values({ id, ownerId: uuid, ...intent,
          sourceKey: `${prefix}incoming/${id}`, outputKey: `${prefix}ready/${id}.webp`,
          // The transaction may have waited for this owner's lock. Reserve at
          // admission time, not PostgreSQL now()'s older transaction timestamp.
          createdAt: sql`clock_timestamp()`,
          uploadExpiresAt: sql`clock_timestamp() + interval '5 minutes'`, expiresAt: sql`clock_timestamp() + interval '1 hour'` }).returning();
        return created;
      });
      try {
        const permission = await storage.signUpload(row.sourceKey, intent);
        // Conservatively start the stored URL lifetime AFTER signing has finished.
        const uploadExpiresAt = new Date(Date.now() + UPLOAD_SECONDS * 1000);
        await db.update(assets).set({ uploadExpiresAt }).where(eq(assets.id, row.id));
        return { ...publicAsset(row), ...permission, uploadExpiresAt: uploadExpiresAt.toISOString(), expiresIn: UPLOAD_SECONDS };
      } catch (e) {
        await db.update(assets).set({ state: "failed" }).where(eq(assets.id, row.id));
        throw e;
      }
    }),
    complete: (owner: string, id: string) => safe(async () => {
      owner = owner.toLowerCase();
      rate(owner);
      if (active >= 2 || activeUsers.has(owner)) throw new MediaError(429, "Image processing busy; try again shortly", 1);
      active++; activeUsers.add(owner);
      let row: Asset | undefined;
      try {
        row = await db.transaction(async tx => {
          const found = await ownAsset(tx, id, owner);
          if (found.state === "ready" && (found.stationId || found.reportId)) return found;
          const [clock] = await tx.select({ now: sql<string>`clock_timestamp()` }).from(assets).limit(1);
          const now = new Date(clock.now).getTime();
          if (found.expiresAt.getTime() <= now) throw new MediaError(410, "Image intent expired; select the image again");
          if (found.state === "ready") return found;
          if (["failed", "deleting", "deleted"].includes(found.state)) throw new MediaError(409, "Image cannot be completed; select it again");
          if (found.processingUntil && found.processingUntil.getTime() > now) throw new MediaError(409, "Image verification already in progress");
          if (found.attempts >= 5 || found.lastAttemptAt && now - found.lastAttemptAt.getTime() < 2000) throw new MediaError(429, "Image completion limit reached; wait or select it again",
            found.attempts >= 5 ? (found.expiresAt.getTime() - now) / 1000 : (found.lastAttemptAt!.getTime() + 2000 - now) / 1000);
          const [claimed] = await tx.update(assets).set({ state: "processing", lease: randomUUID(), processingUntil: sql`clock_timestamp() + interval '1 minute'`, attempts: found.attempts + 1, lastAttemptAt: sql`clock_timestamp()` }).where(eq(assets.id, id)).returning();
          return claimed;
        });
        if (row.state === "ready") return publicAsset(row);
        const bytes = await storage.source(row.sourceKey, { purpose: row.purpose as Purpose, contentType: row.contentType, byteLength: row.byteLength, checksum: row.checksum });
        const output = await normalizeImage(bytes, row.contentType);
        await storage.putOutput(row.outputKey, output.data, output.checksum);
        const [ready] = await db.update(assets).set({ state: "ready", outputBytes: output.data.length, outputChecksum: output.checksum, width: output.width, height: output.height, lease: null, processingUntil: null })
          .where(and(eq(assets.id, id), eq(assets.state, "processing"), eq(assets.lease, row.lease!), gt(assets.processingUntil, sql`clock_timestamp()`), gt(assets.expiresAt, sql`clock_timestamp()`))).returning();
        if (!ready) throw new MediaError(409, "Image verification lease expired; retry completion");
        return publicAsset(ready);
      } catch (e) {
        if (row?.lease) await db.update(assets).set({ state: e instanceof MediaError && e.status === 422 ? "failed" : "pending", lease: null, processingUntil: null })
          .where(and(eq(assets.id, row.id), eq(assets.state, "processing"), eq(assets.lease, row.lease)));
        throw e;
      } finally { active--; activeUsers.delete(owner); }
    }),
    content: (id: string, viewer: AuthIdentity | null = null) => safe(() => readCapability(id, viewer, false)),
    readUrl: (id: string, viewer: AuthIdentity) => safe(async () => ({ url: await readCapability(id, viewer, true), expiresIn: READ_SECONDS })),
    // Dry run is read-only. Apply takes an exact reviewed UUID list (max 100), never
    // bucket listing. A deleting tombstone excludes attachment/completion races.
    cleanup: (ids?: string[]) => safe(async () => {
      const eligible = and(unattached, lt(assets.expiresAt, sql`clock_timestamp() - interval '24 hours'`), lt(assets.uploadExpiresAt, sql`clock_timestamp() - interval '24 hours'`),
        or(isNull(assets.processingUntil), lt(assets.processingUntil, sql`clock_timestamp()`)));
      if (ids === undefined) return db.select({ assetId: assets.id, sourceKey: assets.sourceKey, outputKey: assets.outputKey }).from(assets).where(and(eligible, sql`${assets.state} <> 'deleted'`)).orderBy(assets.id).limit(100);
      if (ids.length > 100 || ids.some(id => !assetIdSchema.safeParse(id).success)) throw new MediaError(400, "Cleanup requires at most 100 exact asset UUIDs");
      const done = [];
      for (const id of new Set(ids)) {
        const [row] = await db.update(assets).set({ state: "deleting", lease: null }).where(and(eq(assets.id, id), eligible, sql`${assets.state} <> 'deleted'`)).returning();
        if (!row) continue;
        await storage.deleteObject(row.sourceKey);
        await storage.deleteObject(row.outputKey);
        await db.update(assets).set({ state: "deleted" }).where(and(eq(assets.id, id), eq(assets.state, "deleting"), unattached));
        done.push({ assetId: id, sourceKey: row.sourceKey, outputKey: row.outputKey });
      }
      return done;
    }),
  };
}
export type MediaService = ReturnType<typeof createMediaService>;
