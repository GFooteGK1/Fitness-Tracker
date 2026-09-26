-- LOCAL REHEARSAL ONLY, never a hosted migration.
-- Definition retained from the read-only production inspection on 2026-09-24:
-- output/app-quality-release/cutover-20260924/profile-trigger-metadata.json.
-- Unlike the historical migration, this overwrites even an explicit user_id.
CREATE OR REPLACE FUNCTION public.set_user_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
 NEW.user_id = auth.uid();
 RETURN NEW;
END;
$function$;

CREATE TRIGGER set_user_profile_user_id BEFORE INSERT ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.set_user_id();
