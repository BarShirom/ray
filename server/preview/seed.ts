import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import type { createPostgres } from "../db/connection.js";
import { assertDatabaseIdentity, localConfig } from "../db/local-config.js";
import { users, feedingStations, feedingLogs, reports } from "../db/schema.js";
import { assertMigrationState } from "./migration-state.js";

const publicId = (n: number) => n.toString(16).padStart(24, "e");
const label = "SYNTHETIC DEMO";
export const demoPassword = "RayDemoOnly!2026";

export async function seedPreview(connection: ReturnType<typeof createPostgres>, url: string) {
  localConfig("preview", url);
  await assertDatabaseIdentity(connection.pool, "preview");
  await assertMigrationState(connection.pool);
  await insertSyntheticSeed(connection);
}

// Target-independent transaction tested only in the disposable DB. The CLI is
// guarded above. No updates/deletes, and never called automatically at startup.
export async function insertSyntheticSeed(connection: ReturnType<typeof createPostgres>) {
  await connection.db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(1010, 15)`);
    const people = [];
    for (let i = 1; i <= 2; i++) {
      const email = `demo${i}@ray.example.invalid`;
      let [row] = await tx.select().from(users).where(eq(users.publicId, publicId(i)));
      if (!row) {
        [row] = await tx.insert(users).values({ publicId: publicId(i), firstName: "Synthetic Demo", lastName: `Carer ${i}`, email,
          passwordHash: await bcrypt.hash(demoPassword, 10), companyPresent: false }).returning();
      }
      if (row.email !== email) throw new Error("Synthetic seed identifier conflict");
      people.push(row);
    }
    for (let i = 1; i <= 3; i++) {
      const name = `${label} station ${i}`;
      let [station] = await tx.select().from(feedingStations).where(eq(feedingStations.publicId, publicId(10 + i)));
      if (!station) {
        [station] = await tx.insert(feedingStations).values({ publicId: publicId(10 + i), name,
          location: { x: 34.78 + i * 0.004, y: 32.08 + i * 0.003 }, estimatedCats: i * 2, estimatedKittens: i - 1,
          notes: "Synthetic local demo; no real animals or location claim.", imagePresent: false, createdBy: people[0].id,
          legacyVersion: 0, legacyVersionPresent: true }).returning();
      }
      if (station.name !== name) throw new Error("Synthetic seed identifier conflict");
      const note = `${label} feeding ${i}`;
      const [log] = await tx.select().from(feedingLogs).where(eq(feedingLogs.publicId, publicId(20 + i)));
      if (log && (log.note !== note || log.stationId !== station.id)) throw new Error("Synthetic seed identifier conflict");
      if (!log) await tx.insert(feedingLogs).values({ publicId: publicId(20 + i), stationId: station.id, userId: people[1].id,
        period: "morning", food: true, water: i !== 2, note, legacyVersion: 0, legacyVersionPresent: true });
      const description = `${label} report ${i}: UI exercise only; no real incident or request for help.`;
      const [report] = await tx.select().from(reports).where(eq(reports.publicId, publicId(30 + i)));
      if (report && report.description !== description) throw new Error("Synthetic seed identifier conflict");
      if (!report) await tx.insert(reports).values({ publicId: publicId(30 + i), description,
        type: ["general", "food", "emergency"][i - 1], status: ["new", "in-progress", "resolved"][i - 1],
        location: { x: 34.779 + i * 0.004, y: 32.078 + i * 0.003 }, createdBy: people[0].id,
        createdByName: "Synthetic Demo Carer 1", assignedTo: i === 1 ? null : people[1].id,
        assignedToName: i === 1 ? null : "Synthetic Demo Carer 2", media: [], legacyVersion: 0, legacyVersionPresent: true });
    }
  });
}
