BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';

-- Once a row has a versioned owner snapshot, reject older, repeated,
-- and unversioned updates under the same row lock as the upsert.
CREATE FUNCTION public.guard_whoop_provider_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.provider_updated_at IS NULL OR NEW.provider_updated_at <= OLD.provider_updated_at THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_whoop_provider_version() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER guard_whoop_provider_version
BEFORE UPDATE ON public.whoop_recovery
FOR EACH ROW
WHEN (OLD.timing_mapping_version = 'whoop_timing_owner_v1' AND OLD.provider_updated_at IS NOT NULL)
EXECUTE FUNCTION public.guard_whoop_provider_version();

CREATE TRIGGER guard_whoop_provider_version
BEFORE UPDATE ON public.whoop_sleep
FOR EACH ROW
WHEN (OLD.timing_mapping_version = 'whoop_timing_owner_v1' AND OLD.provider_updated_at IS NOT NULL)
EXECUTE FUNCTION public.guard_whoop_provider_version();

CREATE TRIGGER guard_whoop_provider_version
BEFORE UPDATE ON public.whoop_cycles
FOR EACH ROW
WHEN (OLD.timing_mapping_version = 'whoop_timing_owner_v1' AND OLD.provider_updated_at IS NOT NULL)
EXECUTE FUNCTION public.guard_whoop_provider_version();

CREATE FUNCTION public.guard_whoop_batch_checkpoint()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  -- A genuinely future checkpoint may be repaired by a successful batch.
  IF OLD.last_sync_at <= statement_timestamp() THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_whoop_batch_checkpoint() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER guard_whoop_batch_checkpoint
BEFORE UPDATE OF last_sync_at ON public.whoop_sync_status
FOR EACH ROW
WHEN (NEW.last_sync_at < OLD.last_sync_at)
EXECUTE FUNCTION public.guard_whoop_batch_checkpoint();

COMMIT;
