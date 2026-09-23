import { randomBytes } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { createPostgres } from "../db/connection.js";
import { feedingLogs as logs, feedingStations as stations, users } from "../db/schema.js";
import { FeedingStationInactiveError, FeedingStationMissingError, safeFeedingPersistence } from "./feedingPersistenceErrors.js";
import type { FeedingLogRecord, FeedingLogStore } from "./feedingLogStore.js";

const columns = {
  publicId: logs.publicId, fedAt: logs.fedAt, food: logs.food, water: logs.water,
  period: logs.period, periodPresent: logs.periodPresent, note: logs.note, notePresent: logs.notePresent,
  createdAt: logs.createdAt, updatedAt: logs.updatedAt,
  legacyVersion: logs.legacyVersion, legacyVersionPresent: logs.legacyVersionPresent,
};
type Row = Pick<typeof logs.$inferSelect, keyof typeof columns> & { stationId: string; userId: string };

function record(row: Row): FeedingLogRecord {
  return {
    publicId: row.publicId, stationId: row.stationId, userId: row.userId,
    fedAt: row.fedAt, food: row.food, water: row.water,
    ...(row.periodPresent ? { period: row.period } : {}),
    ...(row.notePresent ? { note: row.note } : {}),
    createdAt: row.createdAt, updatedAt: row.updatedAt,
    ...(row.legacyVersionPresent ? { legacyVersion: row.legacyVersion } : {}),
  };
}

export function createPostgresFeedingLogStore(db: ReturnType<typeof createPostgres>["db"]): FeedingLogStore {
  return {
    create: (input) => safeFeedingPersistence(() => db.transaction(async (tx) => {
      // FOR SHARE permits concurrent feeding readers but conflicts with active
      // updates. Every query, including the insert, uses this transaction client.
      const [station] = await tx.select({ id: stations.id, publicId: stations.publicId, active: stations.active })
        .from(stations).where(eq(stations.publicId, input.stationId.toLowerCase())).limit(1).for("share");
      if (!station) throw new FeedingStationMissingError();
      if (!station.active) throw new FeedingStationInactiveError();
      const [user] = await tx.select({ id: users.id, publicId: users.publicId }).from(users)
        .where(eq(users.publicId, input.userId.toLowerCase())).limit(1);
      if (!user) throw new Error("Referenced user missing");
      const [row] = await tx.insert(logs).values({
        publicId: randomBytes(12).toString("hex"), stationId: station.id, userId: user.id,
        fedAt: input.fedAt, food: input.food, water: input.water,
        period: input.period ?? null, periodPresent: input.period !== undefined,
        note: input.note == null ? null : input.note.trim(), notePresent: input.note !== undefined,
        legacyVersion: 0, legacyVersionPresent: true,
      }).returning(columns);
      return record({ ...row, stationId: station.publicId, userId: user.publicId });
    })),
    listForStation: (stationId) => safeFeedingPersistence(async () => {
      const rows = await db.select({ ...columns, stationId: stations.publicId, userId: users.publicId }).from(logs)
        .innerJoin(stations, eq(logs.stationId, stations.id)).innerJoin(users, eq(logs.userId, users.id))
        .where(eq(stations.publicId, stationId.toLowerCase()))
        .orderBy(desc(logs.fedAt), desc(logs.createdAt), desc(logs.id));
      return rows.map(record);
    }),
  };
}
