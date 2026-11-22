BEGIN;

ALTER TABLE public.coach_daily_checkins
  ADD COLUMN stress_rating SMALLINT,
  ADD COLUMN fatigue_rating SMALLINT,
  ADD COLUMN sleep_rating SMALLINT,
  ADD COLUMN soreness_rating SMALLINT,
  ADD COLUMN motivation_rating SMALLINT,
  -- A missing or out-of-range rating produces NULL. IS TRUE rejects incomplete scored rows.
  ADD CONSTRAINT coach_daily_checkins_ratings_check CHECK (
    num_nonnulls(stress_rating, fatigue_rating, sleep_rating, soreness_rating, motivation_rating) = 0
    OR (
      stress = CASE WHEN stress_rating IN (1, 2) THEN 'higher'
        WHEN stress_rating = 3 THEN 'usual' WHEN stress_rating IN (4, 5) THEN 'lower' END
      AND fatigue = CASE WHEN fatigue_rating IN (1, 2) THEN 'higher'
        WHEN fatigue_rating = 3 THEN 'usual' WHEN fatigue_rating IN (4, 5) THEN 'lower' END
      AND sleep = CASE WHEN sleep_rating IN (1, 2) THEN 'worse'
        WHEN sleep_rating = 3 THEN 'usual' WHEN sleep_rating IN (4, 5) THEN 'better' END
      AND soreness = CASE WHEN soreness_rating IN (1, 2) THEN 'higher'
        WHEN soreness_rating = 3 THEN 'usual' WHEN soreness_rating IN (4, 5) THEN 'lower' END
      AND motivation = CASE WHEN motivation_rating IN (1, 2) THEN 'lower'
        WHEN motivation_rating = 3 THEN 'usual' WHEN motivation_rating IN (4, 5) THEN 'higher' END
    ) IS TRUE
  );

-- An older application can update the qualitative columns without setting the
-- ratings. A changed qualitative answer supersedes the exact ratings.
CREATE FUNCTION public.clear_stale_coach_daily_checkin_ratings()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.stress_rating := NULL;
  NEW.fatigue_rating := NULL;
  NEW.sleep_rating := NULL;
  NEW.soreness_rating := NULL;
  NEW.motivation_rating := NULL;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_stale_coach_daily_checkin_ratings() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER clear_stale_coach_daily_checkin_ratings
BEFORE UPDATE OF stress, fatigue, sleep, soreness, motivation ON public.coach_daily_checkins
FOR EACH ROW WHEN (
  (OLD.stress, OLD.fatigue, OLD.sleep, OLD.soreness, OLD.motivation)
    IS DISTINCT FROM (NEW.stress, NEW.fatigue, NEW.sleep, NEW.soreness, NEW.motivation)
  AND (OLD.stress_rating, OLD.fatigue_rating, OLD.sleep_rating, OLD.soreness_rating, OLD.motivation_rating)
    IS NOT DISTINCT FROM (NEW.stress_rating, NEW.fatigue_rating, NEW.sleep_rating, NEW.soreness_rating, NEW.motivation_rating)
)
EXECUTE FUNCTION public.clear_stale_coach_daily_checkin_ratings();

COMMIT;
