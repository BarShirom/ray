import { randomBytes } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { createPostgres } from "../db/connection.js";
import { feedingStations as stations, users } from "../db/schema.js";
import { safeFeedingPersistence } from "../feedingLogs/feedingPersistenceErrors.js";
import type { FeedingStationRecord, FeedingStationStore } from "./feedingStationStore.js";

const columns = {
  publicId: stations.publicId, name: stations.name, location: stations.location,
  estimatedCats: stations.estimatedCats, estimatedKittens: stations.estimatedKittens,
  image: stations.image, imagePresent: stations.imagePresent,
  notes: stations.notes, notesPresent: stations.notesPresent,
  active: stations.active, createdAt: stations.createdAt, updatedAt: stations.updatedAt,
  legacyVersion: stations.legacyVersion, legacyVersionPresent: stations.legacyVersionPresent,
};
type Row = Pick<typeof stations.$inferSelect, keyof typeof columns> & { createdBy: string };

function record(row: Row): FeedingStationRecord {
  return {
    publicId: row.publicId, name: row.name,
    location: { lat: row.location.y, lng: row.location.x },
    estimatedCats: row.estimatedCats, estimatedKittens: row.estimatedKittens,
    ...(row.imagePresent ? { image: row.image } : {}),
    ...(row.notesPresent ? { notes: row.notes } : {}),
    createdBy: row.createdBy, active: row.active,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
    ...(row.legacyVersionPresent ? { legacyVersion: row.legacyVersion } : {}),
  };
}

// Connection and migration lifecycle belong to the caller.
export function createPostgresFeedingStationStore(db: Pick<ReturnType<typeof createPostgres>["db"], "select" | "insert">): FeedingStationStore {
  const read = () => db.select({ ...columns, createdBy: users.publicId }).from(stations)
    .innerJoin(users, eq(stations.createdBy, users.id));
  return {
    create: (input) => safeFeedingPersistence(async () => {
      const [creator] = await db.select({ id: users.id, publicId: users.publicId }).from(users)
        .where(eq(users.publicId, input.createdBy.toLowerCase())).limit(1);
      if (!creator) throw new Error("Referenced user missing");
      const [row] = await db.insert(stations).values({
        publicId: randomBytes(12).toString("hex"), name: input.name.trim(),
        location: { x: input.location.lng, y: input.location.lat },
        estimatedCats: input.estimatedCats, estimatedKittens: input.estimatedKittens,
        image: input.image ?? null, imagePresent: input.image !== undefined,
        notes: input.notes ?? null, notesPresent: input.notes !== undefined,
        createdBy: creator.id, active: true, legacyVersion: 0, legacyVersionPresent: true,
      }).returning(columns);
      return record({ ...row, createdBy: creator.publicId });
    }),
    listActive: () => safeFeedingPersistence(async () =>
      (await read().where(eq(stations.active, true)).orderBy(desc(stations.createdAt))).map(record)),
    findByPublicId: (publicId) => safeFeedingPersistence(async () => {
      const [row] = await read().where(eq(stations.publicId, publicId.toLowerCase())).limit(1);
      return row ? record(row) : null;
    }),
  };
}
