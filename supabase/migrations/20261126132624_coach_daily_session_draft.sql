BEGIN;

ALTER TABLE public.coach_daily_checkins
  ADD COLUMN check_in_revision UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  ADD COLUMN session_draft JSONB,
  ADD CONSTRAINT coach_daily_checkins_session_draft_date_check CHECK (
    session_draft IS NULL OR (
      pg_catalog.jsonb_typeof(session_draft) = 'object'
      AND pg_catalog.jsonb_typeof(session_draft -> 'date') = 'string'
      AND session_draft ->> 'date' = pg_catalog.to_char(local_date, 'YYYY-MM-DD')
    ) IS TRUE
  );

-- Ordinary check-ins retain owner-scoped access. A verified server write owns drafts.
REVOKE INSERT, UPDATE ON TABLE public.coach_daily_checkins FROM authenticated;
GRANT INSERT (
  user_id, local_date, stress, fatigue, sleep, soreness, motivation,
  stress_rating, fatigue_rating, sleep_rating, soreness_rating, motivation_rating
), UPDATE (
  user_id, local_date, stress, fatigue, sleep, soreness, motivation,
  stress_rating, fatigue_rating, sleep_rating, soreness_rating, motivation_rating
) ON TABLE public.coach_daily_checkins TO authenticated;
GRANT SELECT (user_id, local_date, check_in_revision, session_draft), UPDATE (session_draft)
  ON TABLE public.coach_daily_checkins TO service_role;

CREATE FUNCTION public.invalidate_stale_coach_daily_session_draft()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.check_in_revision := OLD.check_in_revision;
  IF (NEW.user_id, NEW.local_date, NEW.stress, NEW.fatigue, NEW.sleep, NEW.soreness, NEW.motivation,
      NEW.stress_rating, NEW.fatigue_rating, NEW.sleep_rating, NEW.soreness_rating, NEW.motivation_rating)
    IS DISTINCT FROM
     (OLD.user_id, OLD.local_date, OLD.stress, OLD.fatigue, OLD.sleep, OLD.soreness, OLD.motivation,
      OLD.stress_rating, OLD.fatigue_rating, OLD.sleep_rating, OLD.soreness_rating, OLD.motivation_rating)
  THEN
    NEW.check_in_revision := pg_catalog.gen_random_uuid();
    NEW.session_draft := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.invalidate_stale_coach_daily_session_draft() FROM PUBLIC, anon, authenticated, service_role;

-- PostgreSQL runs same-kind triggers by name. Check the final ratings after the
-- legacy check-in trigger clears incompatible scores.
CREATE TRIGGER invalidate_stale_coach_daily_session_draft
BEFORE UPDATE ON public.coach_daily_checkins
FOR EACH ROW EXECUTE FUNCTION public.invalidate_stale_coach_daily_session_draft();

COMMIT;
