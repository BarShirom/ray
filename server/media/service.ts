import { randomUUID } from "node:crypto";
import { and, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { createPostgres } from "../db/connection.js";
import { mediaAssets as assets, users, feedingStations, reports } from "../db/schema.js";
import { MediaError, UPLOAD_SECONDS, type Intent, type MediaStorage, type Purpose } from "./types.js";
import { normalizeImage } from "./image.js";
import { intentSchema, assetIdSchema } from "./validation.js";
import { createPostgresFeedingStationStore } from "../feedingStations/postgresFeedingStationStore.js";
import { createPostgresReportStore } from "../reports/postgresReportStore.js";
import type { FeedingStationStore } from "../feedingStations/feedingStationStore.js";
import type { ReportStore } from "../reports/reportStore.js";

type Database = ReturnType<typeof createPostgres>["db"];
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Asset = typeof assets.$inferSelect;
const unattached = and(isNull(assets.stationId), isNull(assets.reportId));
const contentUrl = (id: string) => `http://127.0.0.1:4001/api/media/${id}/content`;
const safe = async <T>(fn: () => Promise<T>): Promise<T> => {
  try { return await fn(); } catch (e) {
    if (e instanceof MediaError) throw e;
    throw new MediaError(503, "Media operation unavailable; please try again");
  }
};
const publicAsset = (row: Asset) => ({ assetId: row.id, state: row.state, expiresAt: row.expiresAt.toISOString() });

export function createMediaService(db: Database, storage: MediaStorage, prefix = "dev/") {
  if (!/^dev\/(test-runs\/[0-9a-f-]{36}\/)?$/.test(prefix)) throw new Error("Invalid media prefix");
  let active = 0;
  const activeUsers = new Set<string>();
  const completionRates = new Map<string, { until: number; count: number }>();
  const rate = (owner: string) => {
    const now = Date.now();
    for (const [id, item] of completionRates) if (item.until <= now) completionRates.delete(id);
    const item = completionRates.get(owner);
    if (item && item.count >= 10 || !item && completionRates.size >= 1024) throw new MediaError(429, "Too many image completion attempts; try again in a minute");
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
  const stations: FeedingStationStore = { ...createPostgresFeedingStationStore(db),
    create: input => safe(() => db.transaction(async tx => {
      if (input.image !== undefined) throw new MediaError(400, "Use imageAssetId, not an image URL");
      const ids = await claimable(tx, input.imageAssetId ? [input.imageAssetId] : [], "station", input.createdBy);
      const station = await createPostgresFeedingStationStore(tx).create({ ...input, image: ids[0] ? contentUrl(ids[0]) : undefined });
      if (ids[0]) {
        const [parent] = await tx.select({ id: feedingStations.id }).from(feedingStations).where(eq(feedingStations.publicId, station.publicId));
        await tx.update(assets).set({ stationId: parent.id }).where(eq(assets.id, ids[0]));
      }
      return station;
    })),
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
  return {
    stations, reports: reportStore,
    issue: (owner: string, input: Intent) => safe(async () => {
      const parsed = intentSchema.safeParse(input);
      if (!parsed.success) throw new MediaError(400, "Use JPEG, PNG or WebP, 1 byte to 8 MiB, a SHA-256 checksum and station/report purpose");
      const intent = parsed.data;
      const row = await db.transaction(async tx => {
        const uuid = await ownerId(tx, owner);
        // Serialize per-user issuance to enforce quotas even across processes.
        await tx.select({ id: users.id }).from(users).where(eq(users.id, uuid)).for("update");
        const [counts] = await tx.select({ outstanding: sql<number>`count(*) filter (where ${unattached} AND ${assets.expiresAt} > now() AND ${assets.state} IN ('pending','processing','ready'))::integer`,
          recent: sql<number>`count(*) filter (where ${assets.createdAt} > now() - interval '1 minute')::integer` }).from(assets).where(eq(assets.ownerId, uuid));
        if (counts.outstanding >= 6 || counts.recent >= 10) throw new MediaError(429, "Image upload quota reached; finish existing uploads or wait before trying again");
        const id = randomUUID();
        const [created] = await tx.insert(assets).values({ id, ownerId: uuid, ...intent,
          sourceKey: `${prefix}incoming/${id}`, outputKey: `${prefix}ready/${id}.webp`,
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
      rate(owner);
      if (active >= 2 || activeUsers.has(owner)) throw new MediaError(429, "Image processing busy; try again shortly");
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
          if (found.attempts >= 5 || found.lastAttemptAt && now - found.lastAttemptAt.getTime() < 2000) throw new MediaError(429, "Image completion limit reached; wait or select it again");
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
    content: (id: string) => safe(async () => {
      if (!assetIdSchema.safeParse(id).success) throw new MediaError(400, "Invalid asset ID");
      const [row] = await db.select().from(assets).where(and(eq(assets.id, id), eq(assets.state, "ready")));
      // Existing parent detail reads are public, including inactive stations. Resolve
      // that same parent visibility instead of using ID knowledge as authorization.
      if (!row) throw new MediaError(404, "Image not found");
      const parent = row.stationId ? await db.select({ id: feedingStations.id }).from(feedingStations).where(eq(feedingStations.id, row.stationId))
        : row.reportId ? await db.select({ id: reports.id }).from(reports).where(eq(reports.id, row.reportId)) : [];
      if (!parent.length) throw new MediaError(404, "Image is not attached to a public resource");
      return storage.signRead(row.outputKey);
    }),
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
