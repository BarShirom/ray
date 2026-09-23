import { randomBytes } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { createPostgres } from "../db/connection.js";
import { reports, users } from "../db/schema.js";
import { isPublicId } from "../utils/publicId.js";
import type { ReportRecord, ReportStore, ReportUserSummary } from "./reportStore.js";

type Database = ReturnType<typeof createPostgres>["db"];
const creator = alias(users, "report_creator");
const assignee = alias(users, "report_assignee");
const userColumns = <TName extends string>(user: ReturnType<typeof alias<typeof users, TName>>) => ({
  publicId: user.publicId, firstName: user.firstName, lastName: user.lastName,
  legacyName: user.legacyName, legacyNamePresent: user.legacyNamePresent,
});

function read(db: Pick<Database, "select">) {
  return db.select({
    publicId: reports.publicId, description: reports.description, type: reports.type,
    status: reports.status, location: reports.location, media: reports.media,
    createdByName: reports.createdByName, assignedToName: reports.assignedToName,
    createdAt: reports.createdAt, updatedAt: reports.updatedAt,
    legacyVersion: reports.legacyVersion, legacyVersionPresent: reports.legacyVersionPresent,
    createdBy: userColumns(creator), assignedTo: userColumns(assignee),
  }).from(reports).leftJoin(creator, eq(reports.createdBy, creator.id))
    .leftJoin(assignee, eq(reports.assignedTo, assignee.id));
}
type Row = Awaited<ReturnType<typeof read>>[number];
function summary(user: Row["createdBy"]): ReportUserSummary | null {
  if (!user) return null;
  return { publicId: user.publicId, firstName: user.firstName, lastName: user.lastName,
    ...(user.legacyNamePresent ? { name: user.legacyName } : {}) };
}
function record(row: Row): ReportRecord {
  return {
    publicId: row.publicId, description: row.description, type: row.type, status: row.status,
    location: { lat: row.location.y, lng: row.location.x }, media: [...row.media],
    createdBy: summary(row.createdBy), assignedTo: summary(row.assignedTo),
    createdByName: row.createdByName, assignedToName: row.assignedToName,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
    ...(row.legacyVersionPresent ? { legacyVersion: row.legacyVersion } : {}),
  };
}
function canonicalId(id: string): string {
  // Preserve report claim/resolve's existing malformed-ID 500 path, without a
  // database cast error (or SQL details) escaping to the controller.
  if (!isPublicId(id)) throw new Error("Invalid report relationship or public ID");
  return id.toLowerCase();
}
async function userId(db: Pick<Database, "select">, publicId: string): Promise<string> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, canonicalId(publicId))).limit(1);
  if (!row) throw new Error("Referenced report user missing");
  return row.id;
}
async function readOne(db: Pick<Database, "select">, id: string): Promise<ReportRecord> {
  const [row] = await read(db).where(eq(reports.id, id)).limit(1);
  if (!row) throw new Error("Report disappeared during protected operation");
  return record(row);
}
async function safePersistence<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch {
    // Never retain Drizzle's query, parameters, cause or server details.
    const error = new Error("Report persistence operation failed");
    error.name = "PersistenceError";
    throw error;
  }
}

// pg returns COUNT's int8 as text. Bound the exact integer before Number conversion.
export function reportCount(value: string | bigint | number): number {
  if (typeof value === "number" && !Number.isSafeInteger(value)) throw new Error("Unsafe report count");
  const exact = BigInt(value);
  if (exact < 0n || exact > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Unsafe report count");
  return Number(exact);
}
const counts = {
  total: sql<string>`count(*)`,
  resolved: sql<string>`count(*) filter (where ${reports.status} = 'resolved')`,
  inProgress: sql<string>`count(*) filter (where ${reports.status} = 'in-progress')`,
};
function personalCounts(row: { total: string; resolved: string; inProgress: string }) {
  return { total: reportCount(row.total), resolved: reportCount(row.resolved), inProgress: reportCount(row.inProgress) };
}

// Importing opens no connections. Caller owns the supplied Drizzle database.
export function createPostgresReportStore(db: Database): ReportStore {
  return {
    create: (input) => safePersistence(() => db.transaction(async (tx) => {
      const createdBy = input.createdBy === null ? null : await userId(tx, input.createdBy);
      const [row] = await tx.insert(reports).values({
        publicId: randomBytes(12).toString("hex"), description: input.description, type: input.type,
        location: { x: input.location.lng, y: input.location.lat }, media: input.media ?? [],
        status: "new", createdBy, createdByName: input.createdByName,
        assignedTo: null, assignedToName: null, legacyVersion: 0, legacyVersionPresent: true,
      }).returning({ id: reports.id });
      return readOne(tx, row.id);
    })),
    listAll: () => safePersistence(async () => (await read(db).orderBy(desc(reports.createdAt))).map(record)),
    listAssignedTo: (publicId) => safePersistence(async () =>
      (await read(db).where(eq(assignee.publicId, canonicalId(publicId))).orderBy(desc(reports.createdAt))).map(record)),
    claim: (publicId, actor) => safePersistence(() => db.transaction(async (tx) => {
      // Lock the report alone, not nullable joined users. Recheck after any wait.
      const [row] = await tx.select({ id: reports.id, status: reports.status, assignedToName: reports.assignedToName })
        .from(reports).where(eq(reports.publicId, canonicalId(publicId))).limit(1).for("update");
      if (!row) return { kind: "not-found" };
      if (row.status !== "new") return { kind: "not-new" };
      const assignedTo = await userId(tx, actor.publicId);
      await tx.update(reports).set({ status: "in-progress", assignedTo,
        assignedToName: actor.name ?? row.assignedToName ?? null }).where(eq(reports.id, row.id));
      return { kind: "claimed", report: await readOne(tx, row.id) };
    })),
    resolve: (publicId, actorId) => safePersistence(() => db.transaction(async (tx) => {
      const [row] = await tx.select({ id: reports.id, assignedTo: reports.assignedTo }).from(reports)
        .where(eq(reports.publicId, canonicalId(publicId))).limit(1).for("update");
      if (!row) return { kind: "not-found" };
      const [actor] = await tx.select({ id: users.id }).from(users)
        .where(eq(users.publicId, canonicalId(actorId))).limit(1);
      if (!actor || row.assignedTo !== actor.id) return { kind: "not-assignee" };
      // Repeated resolution is allowed, including assigned historical 'new' rows.
      // Scalar Mongo saves do not automatically increment __v; retain its value.
      await tx.update(reports).set({ status: "resolved" }).where(eq(reports.id, row.id));
      return { kind: "resolved", report: await readOne(tx, row.id) };
    })),
    getGlobalStats: () => safePersistence(async () => {
      const [row] = await db.select({ ...counts, new: sql<string>`count(*) filter (where ${reports.status} = 'new')` }).from(reports);
      return { ...personalCounts(row), new: reportCount(row.new) };
    }),
    getAssignedStats: (publicId) => safePersistence(async () => {
      const [row] = await db.select(counts).from(reports).innerJoin(assignee, eq(reports.assignedTo, assignee.id))
        .where(eq(assignee.publicId, canonicalId(publicId)));
      return personalCounts(row);
    }),
  };
}
