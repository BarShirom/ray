CREATE FUNCTION public.ray_set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER users_updated_at BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.ray_set_updated_at();
--> statement-breakpoint
CREATE TRIGGER reports_updated_at BEFORE UPDATE ON public.reports
FOR EACH ROW EXECUTE FUNCTION public.ray_set_updated_at();
--> statement-breakpoint
CREATE TRIGGER feeding_stations_updated_at BEFORE UPDATE ON public.feeding_stations
FOR EACH ROW EXECUTE FUNCTION public.ray_set_updated_at();
--> statement-breakpoint
CREATE TRIGGER feeding_logs_updated_at BEFORE UPDATE ON public.feeding_logs
FOR EACH ROW EXECUTE FUNCTION public.ray_set_updated_at();
