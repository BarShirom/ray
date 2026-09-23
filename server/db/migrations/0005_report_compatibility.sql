ALTER TABLE "reports" ADD COLUMN "legacy_version" double precision;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "legacy_version_present" boolean DEFAULT false NOT NULL;