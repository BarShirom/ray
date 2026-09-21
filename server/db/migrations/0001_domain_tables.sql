CREATE TABLE "feeding_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" text NOT NULL,
	"station_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"fed_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"period" text,
	"food" boolean DEFAULT true NOT NULL,
	"water" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feeding_logs_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "feeding_logs_public_id_hex" CHECK ("feeding_logs"."public_id" ~ '^[0-9a-f]{24}$'),
	CONSTRAINT "feeding_logs_period_allowed" CHECK ("feeding_logs"."period" IN ('morning', 'noon', 'evening'))
);
--> statement-breakpoint
CREATE TABLE "feeding_stations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" text NOT NULL,
	"name" text NOT NULL,
	"location" geometry(Point,4326) NOT NULL,
	"estimated_cats" integer DEFAULT 0 NOT NULL,
	"estimated_kittens" integer DEFAULT 0 NOT NULL,
	"image" text,
	"notes" text,
	"created_by" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feeding_stations_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "feeding_stations_public_id_hex" CHECK ("feeding_stations"."public_id" ~ '^[0-9a-f]{24}$'),
	CONSTRAINT "feeding_stations_name_nonblank" CHECK ("feeding_stations"."name" ~ '[^[:space:]]'),
	CONSTRAINT "feeding_stations_cats_nonnegative" CHECK ("feeding_stations"."estimated_cats" >= 0),
	CONSTRAINT "feeding_stations_kittens_nonnegative" CHECK ("feeding_stations"."estimated_kittens" >= 0),
	CONSTRAINT "feeding_stations_location_valid" CHECK (NOT ST_IsEmpty("feeding_stations"."location") AND ST_X("feeding_stations"."location") BETWEEN -180 AND 180 AND ST_Y("feeding_stations"."location") BETWEEN -90 AND 90)
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" text NOT NULL,
	"description" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"location" geometry(Point,4326) NOT NULL,
	"created_by" uuid,
	"assigned_to" uuid,
	"created_by_name" text,
	"assigned_to_name" text,
	"media" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "reports_public_id_hex" CHECK ("reports"."public_id" ~ '^[0-9a-f]{24}$'),
	CONSTRAINT "reports_type_allowed" CHECK ("reports"."type" IN ('emergency', 'food', 'general')),
	CONSTRAINT "reports_status_allowed" CHECK ("reports"."status" IN ('new', 'in-progress', 'resolved')),
	CONSTRAINT "reports_location_valid" CHECK (NOT ST_IsEmpty("reports"."location") AND ST_X("reports"."location") BETWEEN -180 AND 180 AND ST_Y("reports"."location") BETWEEN -90 AND 90)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"company" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_public_id_hex" CHECK ("users"."public_id" ~ '^[0-9a-f]{24}$')
);
--> statement-breakpoint
ALTER TABLE "feeding_logs" ADD CONSTRAINT "feeding_logs_station_id_feeding_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."feeding_stations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feeding_logs" ADD CONSTRAINT "feeding_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feeding_stations" ADD CONSTRAINT "feeding_stations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feeding_logs_user_id_idx" ON "feeding_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "feeding_logs_station_history_idx" ON "feeding_logs" USING btree ("station_id","fed_at" DESC NULLS LAST,"created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "feeding_stations_created_by_idx" ON "feeding_stations" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "feeding_stations_active_created_at_idx" ON "feeding_stations" USING btree ("created_at" DESC NULLS LAST) WHERE "feeding_stations"."active" = true;--> statement-breakpoint
CREATE INDEX "feeding_stations_location_geography_idx" ON "feeding_stations" USING gist (("location"::geography));--> statement-breakpoint
CREATE INDEX "reports_created_at_idx" ON "reports" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "reports_assigned_to_created_at_idx" ON "reports" USING btree ("assigned_to","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "reports_created_by_idx" ON "reports" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reports_location_geography_idx" ON "reports" USING gist (("location"::geography));
