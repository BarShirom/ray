import { randomBytes } from "node:crypto";
import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { createPostgres } from "../db/connection.js";
import { feedingLogs as logs, feedingStations as stations, mediaAssets, users } from "../db/schema.js";
import { FeedingStationInactiveError, FeedingStationMissingError, safeFeedingPersistence } from "../feedingLogs/feedingPersistenceErrors.js";
import type { AuthIdentity } from "../users/userStore.js";
import { MediaError } from "../media/types.js";
import { mediaContentUrl } from "../media/contentUrl.js";
import type { CreateFeedingStation, FeedingStationRecord } from "./feedingStationStore.js";
import { createPostgresFeedingStationStore } from "./postgresFeedingStationStore.js";
import { lockAndAuthorizeStation, resolveStationPrincipalFromVerifiedIdentity, stationViewPredicate, type StationPolicyTransaction } from "./stationAuthorization.js";
import { StationAuthenticationError, StationCursorError, StationMediaUnavailableError, type FeedingRecency, type OwnFeedingLog, type StationDetail, type StationDiscovery, type StationPage, type StationPrivacyStore } from "./stationPrivacyStore.js";

type Database = ReturnType<typeof createPostgres>["db"];
export type CreateStationInTransaction = (tx: StationPolicyTransaction, input: CreateFeedingStation) => Promise<FeedingStationRecord>;

const discoveryColumns = {
  publicId: stations.publicId, name: stations.name, location: stations.location,
  estimatedCats: stations.estimatedCats, estimatedKittens: stations.estimatedKittens,
  visibility: stations.visibility, createdBy: stations.createdBy, active: stations.active,
};
type DiscoveryRow = Pick<typeof stations.$inferSelect, keyof typeof discoveryColumns>;
const ownLogColumns = {
  publicId: logs.publicId, fedAt: logs.fedAt, food: logs.food, water: logs.water,
  period: logs.period, periodPresent: logs.periodPresent,
  note: logs.note, notePresent: logs.notePresent,
  createdAt: logs.createdAt, updatedAt: logs.updatedAt,
};
type OwnLogRow = Pick<typeof logs.$inferSelect, keyof typeof ownLogColumns>;

function discovery(row: DiscoveryRow, actorId: string): StationDiscovery {
  return {
    _id: row.publicId, name: row.name,
    location: { lat: row.location.y, lng: row.location.x },
    estimatedCats: row.estimatedCats, estimatedKittens: row.estimatedKittens,
    visibility: row.visibility,
    permissions: { canManage: row.createdBy === actorId, canFeed: row.active },
  };
}
function ownLog(row: OwnLogRow, stationPublicId: string): OwnFeedingLog {
  return {
    _id: row.publicId, stationId: stationPublicId,
    fedAt: row.fedAt.toISOString(), food: row.food, water: row.water,
    ...(row.periodPresent ? { period: row.period as OwnFeedingLog["period"] } : {}),
    ...(row.notePresent ? { note: row.note } : {}),
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}
function pageOf<T extends { _id: string }>(items: T[], limit: number): StationPage<T> {
  const more = items.length > limit;
  const page = items.slice(0, limit);
  return { items: page, ...(more ? { nextCursor: page[page.length - 1]._id } : {}) };
}
export function feedingRecency(value: Date | null, asOf: Date): FeedingRecency {
  if (!value) return "no-record";
  const age = asOf.getTime() - value.getTime();
  if (age < 2 * 3600000) return "under-2h";
  if (age < 6 * 3600000) return "2-to-6h";
  if (age < 12 * 3600000) return "6-to-12h";
  if (age < 24 * 3600000) return "12-to-24h";
  return "older";
}
// Aggregate driver values can be Date objects or timestamp strings. Date's
// ordinary string coercion drops milliseconds, which changes bucket boundaries.
export function feedingTimestamp(value: unknown): Date | null {
  return value == null ? null : value instanceof Date
    ? new Date(value.getTime()) : new Date(String(value));
}

// Drizzle exceptions may carry bound coordinates, notes or credentials. Preserve
// only the explicitly safe domain errors; sanitize all persistence failures.
async function safe<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    if (error instanceof StationAuthenticationError || error instanceof StationCursorError || error instanceof StationMediaUnavailableError || error instanceof MediaError) throw error;
    return safeFeedingPersistence(async () => { throw error; });
  }
}

async function actor(tx: StationPolicyTransaction, identity: AuthIdentity) {
  const principal = await resolveStationPrincipalFromVerifiedIdentity(tx, identity);
  if (!principal) throw new StationAuthenticationError();
  // This is an internal FK for author-filtered writes/reads, never a response
  // identity and never a client-supplied actor. The policy remains centralized.
  const [user] = await tx.select({ id: users.id }).from(users)
    .where(eq(users.publicId, identity._id.toLowerCase())).limit(1);
  if (!user) throw new StationAuthenticationError();
  return { principal, userId: user.id };
}

async function detailProjection(tx: StationPolicyTransaction, stationId: string, actorId: string): Promise<StationDetail> {
  const [row] = await tx.select({ ...discoveryColumns, notes: stations.notes,
    notesPresent: stations.notesPresent, imageAssetId: mediaAssets.id })
    .from(stations).leftJoin(mediaAssets, and(
      eq(mediaAssets.stationId, stations.id), eq(mediaAssets.purpose, "station"),
      eq(mediaAssets.state, "ready"), isNull(mediaAssets.reportId),
    )).where(eq(stations.id, stationId)).limit(1);
  if (!row) throw new FeedingStationMissingError();
  return { ...discovery(row, actorId), active: row.active,
    ...(row.notesPresent ? { notes: row.notes } : {}),
    ...(row.imageAssetId ? { image: mediaContentUrl(row.imageAssetId) } : {}),
  };
}

/** Protected HTTP store. Authorization and protected SQL share a single live
 * READ COMMITTED transaction. No policy result escapes it for later reuse. */
export function createPostgresStationPrivacyStore(db: Database, createInTransaction?: CreateStationInTransaction): StationPrivacyStore {
  const createStation: CreateStationInTransaction = createInTransaction ?? (async (tx, input) => {
    if (input.imageAssetId !== undefined) throw new StationMediaUnavailableError();
    return createPostgresFeedingStationStore(tx).create(input);
  });
  return {
    list: (identity, page) => safe(() => db.transaction(async tx => {
      const { principal, userId } = await actor(tx, identity);
      const scope = and(eq(stations.active, true), stationViewPredicate(tx, principal));
      let cursor: SQL | undefined;
      if (page.after) {
        // Keep PostgreSQL's full timestamp precision. Passing through a JS Date
        // would truncate historical microseconds and skip rows at page edges.
        const [anchor] = await tx.select({ id: stations.id, createdAt: sql<string>`${stations.createdAt}::text` })
          .from(stations).where(and(scope, eq(stations.publicId, page.after))).limit(1);
        if (!anchor) throw new StationCursorError();
        cursor = sql`(${stations.createdAt}, ${stations.id}) < (${anchor.createdAt}::timestamptz, ${anchor.id}::uuid)`;
      }
      // Hidden rows are excluded in SQL before ordering and limit. No count,
      // hidden-anchor lookup, application filtering or N+1 policy queries.
      const rows = await tx.select(discoveryColumns).from(stations)
        .where(and(scope, cursor)).orderBy(desc(stations.createdAt), desc(stations.id)).limit(page.limit + 1);
      return pageOf(rows.map(row => discovery(row, userId)), page.limit);
    })),
    detail: (identity, stationPublicId) => safe(() => db.transaction(async tx => {
      const { principal, userId } = await actor(tx, identity);
      const access = await lockAndAuthorizeStation(tx, principal, stationPublicId);
      return access ? detailProjection(tx, access.stationId, userId) : null;
    })),
    create: (identity, input) => safe(() => db.transaction(async tx => {
      const { principal, userId } = await actor(tx, identity);
      const created = await createStation(tx, { ...input, createdBy: identity._id.toLowerCase() });
      const access = await lockAndAuthorizeStation(tx, principal, created.publicId);
      if (!access) throw new FeedingStationMissingError();
      return detailProjection(tx, access.stationId, userId);
    })),
    ownLogs: (identity, stationPublicId, page) => safe(() => db.transaction(async tx => {
      const { principal, userId } = await actor(tx, identity);
      const access = await lockAndAuthorizeStation(tx, principal, stationPublicId);
      if (!access) throw new FeedingStationMissingError();
      const scope = and(eq(logs.stationId, access.stationId), eq(logs.userId, userId));
      let cursor: SQL | undefined;
      if (page.after) {
        const [anchor] = await tx.select({ id: logs.id,
          fedAt: sql<string>`${logs.fedAt}::text`, createdAt: sql<string>`${logs.createdAt}::text` })
          .from(logs).where(and(scope, eq(logs.publicId, page.after))).limit(1);
        if (!anchor) throw new StationCursorError();
        cursor = sql`(${logs.fedAt}, ${logs.createdAt}, ${logs.id}) < (${anchor.fedAt}::timestamptz, ${anchor.createdAt}::timestamptz, ${anchor.id}::uuid)`;
      }
      const rows = await tx.select(ownLogColumns).from(logs).where(and(scope, cursor))
        .orderBy(desc(logs.fedAt), desc(logs.createdAt), desc(logs.id)).limit(page.limit + 1);
      return pageOf(rows.map(row => ownLog(row, stationPublicId.toLowerCase())), page.limit);
    })),
    summary: (identity, stationPublicId) => safe(() => db.transaction(async tx => {
      const { principal } = await actor(tx, identity);
      const access = await lockAndAuthorizeStation(tx, principal, stationPublicId);
      if (!access) throw new FeedingStationMissingError();
      // Capture once after lock wait; transaction now() may precede revocation
      // or concurrent feeding commits. Never return this precise instant.
      const clock = await tx.execute<{ as_of: string }>(sql`select clock_timestamp() as as_of`);
      const asOf = new Date(clock.rows[0].as_of);
      const [latest] = await tx.select({
        food: sql<string | null>`max(case when ${logs.food} then ${logs.fedAt} end)`.mapWith(feedingTimestamp),
        water: sql<string | null>`max(case when ${logs.water} then ${logs.fedAt} end)`.mapWith(feedingTimestamp),
      }).from(logs).where(and(eq(logs.stationId, access.stationId), sql`${logs.fedAt} <= ${asOf.toISOString()}::timestamptz`));
      return { food: { recency: feedingRecency(latest.food, asOf) }, water: { recency: feedingRecency(latest.water, asOf) } };
    })),
    createFeeding: (identity, stationPublicId, input) => safe(() => db.transaction(async tx => {
      const { principal, userId } = await actor(tx, identity);
      const access = await lockAndAuthorizeStation(tx, principal, stationPublicId);
      if (!access) throw new FeedingStationMissingError();
      const [station] = await tx.select({ active: stations.active }).from(stations)
        .where(eq(stations.id, access.stationId)).limit(1);
      if (!station?.active) throw new FeedingStationInactiveError();
      const [row] = await tx.insert(logs).values({
        publicId: randomBytes(12).toString("hex"), stationId: access.stationId, userId,
        fedAt: input.fedAt, food: input.food, water: input.water,
        period: input.period ?? null, periodPresent: input.period !== undefined,
        note: input.note == null ? null : input.note.trim(), notePresent: input.note !== undefined,
        legacyVersion: 0, legacyVersionPresent: true,
      }).returning(ownLogColumns);
      return ownLog(row, stationPublicId.toLowerCase());
    })),
  };
}
