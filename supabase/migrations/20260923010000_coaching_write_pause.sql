-- Operational coaching-output pause. Install separately BEFORE a guarded cutover.
-- Application deployment/production installation requires separate authorization.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'postgres' AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Coaching pause requires existing postgres RLS bypass; no role privileges were changed'
      USING ERRCODE = '55000';
  END IF;
END;
$$;

-- Acquire the complete installation boundary without waiting while holding a
-- subset. If a writer is active, the entire installation rolls back for retry.
LOCK TABLE public.training_programs, public.training_plan_versions,
  public.prescribed_sessions, public.adaptation_proposals,
  public.coach_weekly_reviews, public.coach_weekly_review_observations
  IN SHARE ROW EXCLUSIVE MODE NOWAIT;

DO $$
BEGIN
  IF pg_catalog.to_regclass('public.coaching_write_control') IS NULL THEN
    CREATE TABLE public.coaching_write_control (
      singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
      paused BOOLEAN NOT NULL,
      generation BIGINT NOT NULL CHECK (generation >= 0),
      reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
      changed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      changed_by TEXT NOT NULL DEFAULT session_user
    );
    INSERT INTO public.coaching_write_control(singleton, paused, generation, reason)
    VALUES (TRUE, FALSE, 0, 'Installed; operator pause has not been requested');
  ELSIF NOT EXISTS (SELECT 1 FROM public.coaching_write_control WHERE singleton) THEN
    RAISE EXCEPTION 'Missing coaching write control; operator investigation required'
      USING ERRCODE = '55000';
  END IF;
END;
$$;

ALTER TABLE public.coaching_write_control OWNER TO postgres;
ALTER TABLE public.coaching_write_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaching_write_control FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.coaching_write_control FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assert_coaching_writes_open()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_paused BOOLEAN;
BEGIN
  -- SHARE is held through transaction completion. NOWAIT prevents a writer
  -- waiting on the operator while already holding application row locks.
  SELECT c.paused INTO v_paused
  FROM public.coaching_write_control AS c
  WHERE c.singleton
  FOR SHARE NOWAIT;

  IF NOT FOUND OR v_paused THEN
    RAISE EXCEPTION 'Coaching writes are temporarily paused; retry after maintenance'
      USING ERRCODE = 'PT503';
  END IF;
  RETURN NULL;
END;
$$;
ALTER FUNCTION public.assert_coaching_writes_open() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.assert_coaching_writes_open()
  FROM PUBLIC, anon, authenticated, service_role;

-- Operator-only CAS. The UPDATE waits for guarded writers to commit/rollback.
-- Its successful COMMIT is the pause/drain boundary, never merely RPC dispatch.
-- Five seconds is a per-lock operational cap, not a request SLA or dose policy.
CREATE OR REPLACE FUNCTION public.set_coaching_write_pause(
  p_paused BOOLEAN, p_expected_generation BIGINT, p_reason TEXT
)
RETURNS TABLE(paused BOOLEAN, generation BIGINT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
BEGIN
  IF p_paused IS NULL OR p_expected_generation IS NULL OR p_expected_generation < 0
    OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'Invalid coaching pause request' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY UPDATE public.coaching_write_control AS c
  SET paused = p_paused, generation = c.generation + 1,
      reason = btrim(p_reason), changed_at = clock_timestamp(), changed_by = session_user
  WHERE c.singleton AND c.generation = p_expected_generation
  RETURNING c.paused, c.generation;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Coaching pause generation changed; read current state before retry'
      USING ERRCODE = '40001';
  END IF;
END;
$$;
ALTER FUNCTION public.set_coaching_write_pause(BOOLEAN, BIGINT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_coaching_write_pause(BOOLEAN, BIGINT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'training_programs', 'training_plan_versions', 'prescribed_sessions',
    'adaptation_proposals', 'coach_weekly_reviews', 'coach_weekly_review_observations'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS coaching_write_pause ON public.%I', v_table);
    EXECUTE format(
      'CREATE TRIGGER coaching_write_pause BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.assert_coaching_writes_open()',
      v_table
    );
  END LOOP;
END;
$$;

COMMIT;
