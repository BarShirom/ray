ALTER TABLE "users" ADD COLUMN "company_present" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "legacy_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "legacy_name_present" boolean DEFAULT false NOT NULL;