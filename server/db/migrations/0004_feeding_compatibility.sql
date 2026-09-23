ALTER TABLE "feeding_logs" ADD COLUMN "period_present" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "feeding_logs" ADD COLUMN "note_present" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "feeding_logs" ADD COLUMN "legacy_version" double precision;--> statement-breakpoint
ALTER TABLE "feeding_logs" ADD COLUMN "legacy_version_present" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "feeding_stations" ADD COLUMN "image_present" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "feeding_stations" ADD COLUMN "notes_present" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "feeding_stations" ADD COLUMN "legacy_version" double precision;--> statement-breakpoint
ALTER TABLE "feeding_stations" ADD COLUMN "legacy_version_present" boolean DEFAULT false NOT NULL;