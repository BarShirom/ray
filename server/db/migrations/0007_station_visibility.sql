CREATE TABLE "station_access_grants" (
	"station_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"granted_by" uuid NOT NULL,
	"granted_at" timestamp (3) with time zone NOT NULL,
	"revoked_at" timestamp (3) with time zone,
	CONSTRAINT "station_access_grants_station_id_user_id_pk" PRIMARY KEY("station_id","user_id"),
	CONSTRAINT "station_access_grants_not_self" CHECK ("station_access_grants"."user_id" <> "station_access_grants"."granted_by"),
	CONSTRAINT "station_access_grants_revocation_order" CHECK ("station_access_grants"."revoked_at" IS NULL OR "station_access_grants"."revoked_at" >= "station_access_grants"."granted_at")
);
--> statement-breakpoint
ALTER TABLE "feeding_stations" ADD COLUMN "visibility" text DEFAULT 'sensitive' NOT NULL;--> statement-breakpoint
ALTER TABLE "station_access_grants" ADD CONSTRAINT "station_access_grants_station_id_feeding_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."feeding_stations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_access_grants" ADD CONSTRAINT "station_access_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_access_grants" ADD CONSTRAINT "station_access_grants_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "station_access_grants_active_user_station_idx" ON "station_access_grants" USING btree ("user_id","station_id") WHERE "station_access_grants"."revoked_at" IS NULL;--> statement-breakpoint
ALTER TABLE "feeding_stations" ADD CONSTRAINT "feeding_stations_visibility_allowed" CHECK ("feeding_stations"."visibility" IN ('sensitive', 'regular'));
