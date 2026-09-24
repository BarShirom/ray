CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"source_key" text NOT NULL,
	"output_key" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_length" integer NOT NULL,
	"checksum" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"upload_expires_at" timestamp (3) with time zone NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"processing_until" timestamp (3) with time zone,
	"lease" uuid,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp (3) with time zone,
	"output_bytes" integer,
	"output_checksum" text,
	"width" integer,
	"height" integer,
	"station_id" uuid,
	"report_id" uuid,
	"position" integer,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_source_key_unique" UNIQUE("source_key"),
	CONSTRAINT "media_assets_output_key_unique" UNIQUE("output_key"),
	CONSTRAINT "media_purpose" CHECK ("media_assets"."purpose" IN ('station','report')),
	CONSTRAINT "media_type" CHECK ("media_assets"."content_type" IN ('image/jpeg','image/png','image/webp')),
	CONSTRAINT "media_size" CHECK ("media_assets"."byte_length" BETWEEN 1 AND 8388608),
	CONSTRAINT "media_checksum" CHECK ("media_assets"."checksum" ~ '^[A-Za-z0-9+/]{43}=$'),
	CONSTRAINT "media_state" CHECK ("media_assets"."state" IN ('pending','processing','ready','failed','deleting','deleted')),
	CONSTRAINT "media_attempts" CHECK ("media_assets"."attempts" BETWEEN 0 AND 5),
	CONSTRAINT "media_expiry" CHECK ("media_assets"."expires_at" > "media_assets"."upload_expires_at"),
	CONSTRAINT "media_single_parent" CHECK (num_nonnulls("media_assets"."station_id", "media_assets"."report_id") <= 1),
	CONSTRAINT "media_attachment" CHECK (("media_assets"."station_id" IS NULL AND "media_assets"."report_id" IS NULL AND "media_assets"."position" IS NULL) OR ("media_assets"."state" = 'ready' AND (("media_assets"."purpose" = 'station' AND "media_assets"."station_id" IS NOT NULL AND "media_assets"."report_id" IS NULL AND "media_assets"."position" IS NULL) OR ("media_assets"."purpose" = 'report' AND "media_assets"."report_id" IS NOT NULL AND "media_assets"."station_id" IS NULL AND "media_assets"."position" IS NOT NULL AND "media_assets"."position" BETWEEN 0 AND 2)))),
	CONSTRAINT "media_ready_output" CHECK ("media_assets"."state" <> 'ready' OR ("media_assets"."output_bytes" BETWEEN 1 AND 8388608 AND "media_assets"."output_bytes" IS NOT NULL AND "media_assets"."output_checksum" IS NOT NULL AND "media_assets"."width" BETWEEN 1 AND 1600 AND "media_assets"."width" IS NOT NULL AND "media_assets"."height" BETWEEN 1 AND 1600 AND "media_assets"."height" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_station_id_feeding_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."feeding_stations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_station_unique" ON "media_assets" USING btree ("station_id") WHERE "media_assets"."station_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "media_report_position_unique" ON "media_assets" USING btree ("report_id","position") WHERE "media_assets"."report_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "media_owner_expiry_idx" ON "media_assets" USING btree ("owner_id","expires_at");--> statement-breakpoint
CREATE INDEX "media_cleanup_idx" ON "media_assets" USING btree ("expires_at") WHERE "media_assets"."station_id" IS NULL AND "media_assets"."report_id" IS NULL;
--> statement-breakpoint
CREATE TRIGGER media_assets_updated_at BEFORE UPDATE ON media_assets FOR EACH ROW EXECUTE FUNCTION ray_set_updated_at();
