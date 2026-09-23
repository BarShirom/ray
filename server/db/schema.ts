import { sql } from "drizzle-orm";
import { boolean, check, geometry, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const identity = () => ({
  id: uuid("id").defaultRandom().primaryKey(),
  publicId: text("public_id").notNull().unique(),
});
const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
});
// SQL triggers maintain updated_at for every writer; see the custom migration.
// Drizzle 0.45.2 omits SRID in generated SQL. Migration 0001 explicitly uses
// geometry(Point,4326); preserve that typmod when reviewing future migrations.
const location = () => geometry("location", { type: "point", mode: "xy", srid: 4326 }).notNull();

export const users = pgTable("users", {
  ...identity(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  company: text("company"),
  // Existing SQL rows retain their visible value (including explicit null).
  // New UserStore writes encode omission explicitly; no source history is inferred.
  companyPresent: boolean("company_present").notNull().default(true),
  legacyName: text("legacy_name"),
  legacyNamePresent: boolean("legacy_name_present").notNull().default(false),
  ...timestamps(),
}, (t) => [check("users_public_id_hex", sql`${t.publicId} ~ '^[0-9a-f]{24}$'`)]);

export const reports = pgTable("reports", {
  ...identity(),
  description: text("description").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("new"),
  location: location(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
  createdByName: text("created_by_name"),
  assignedToName: text("assigned_to_name"),
  media: text("media").array().notNull().default(sql`ARRAY[]::text[]`),
  ...timestamps(),
}, (t) => [
  check("reports_public_id_hex", sql`${t.publicId} ~ '^[0-9a-f]{24}$'`),
  check("reports_type_allowed", sql`${t.type} IN ('emergency', 'food', 'general')`),
  check("reports_status_allowed", sql`${t.status} IN ('new', 'in-progress', 'resolved')`),
  check("reports_location_valid", sql`NOT ST_IsEmpty(${t.location}) AND ST_X(${t.location}) BETWEEN -180 AND 180 AND ST_Y(${t.location}) BETWEEN -90 AND 90`),
  index("reports_created_at_idx").on(t.createdAt.desc()),
  index("reports_assigned_to_created_at_idx").on(t.assignedTo, t.createdAt.desc()),
  index("reports_created_by_idx").on(t.createdBy),
  index("reports_status_idx").on(t.status),
  index("reports_location_geography_idx").using("gist", sql`(${t.location}::geography)`),
]);

export const feedingStations = pgTable("feeding_stations", {
  ...identity(),
  name: text("name").notNull(),
  location: location(),
  estimatedCats: integer("estimated_cats").notNull().default(0),
  estimatedKittens: integer("estimated_kittens").notNull().default(0),
  image: text("image"),
  notes: text("notes"),
  createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  active: boolean("active").notNull().default(true),
  ...timestamps(),
}, (t) => [
  check("feeding_stations_public_id_hex", sql`${t.publicId} ~ '^[0-9a-f]{24}$'`),
  check("feeding_stations_name_nonblank", sql`${t.name} ~ '[^[:space:]]'`),
  check("feeding_stations_cats_nonnegative", sql`${t.estimatedCats} >= 0`),
  check("feeding_stations_kittens_nonnegative", sql`${t.estimatedKittens} >= 0`),
  check("feeding_stations_location_valid", sql`NOT ST_IsEmpty(${t.location}) AND ST_X(${t.location}) BETWEEN -180 AND 180 AND ST_Y(${t.location}) BETWEEN -90 AND 90`),
  index("feeding_stations_created_by_idx").on(t.createdBy),
  index("feeding_stations_active_created_at_idx").on(t.createdAt.desc()).where(sql`${t.active} = true`),
  index("feeding_stations_location_geography_idx").using("gist", sql`(${t.location}::geography)`),
]);

export const feedingLogs = pgTable("feeding_logs", {
  ...identity(),
  stationId: uuid("station_id").notNull().references(() => feedingStations.id, { onDelete: "restrict" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  fedAt: timestamp("fed_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  period: text("period"),
  food: boolean("food").notNull().default(true),
  water: boolean("water").notNull().default(false),
  note: text("note"),
  ...timestamps(),
}, (t) => [
  check("feeding_logs_public_id_hex", sql`${t.publicId} ~ '^[0-9a-f]{24}$'`),
  check("feeding_logs_period_allowed", sql`${t.period} IN ('morning', 'noon', 'evening')`),
  index("feeding_logs_user_id_idx").on(t.userId),
  index("feeding_logs_station_history_idx").on(t.stationId, t.fedAt.desc(), t.createdAt.desc(), t.id.desc()),
]);
