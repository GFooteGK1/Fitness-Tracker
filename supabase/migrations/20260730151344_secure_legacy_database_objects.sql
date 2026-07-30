BEGIN;

-- These are historical backup tables, not application-facing user tables.
-- Keep service-role maintenance access while removing the Data API surface.
ALTER TABLE public.whoop_recovery_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whoop_recovery_backup FORCE ROW LEVEL SECURITY;
ALTER TABLE public.whoop_sleep_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whoop_sleep_backup FORCE ROW LEVEL SECURITY;
ALTER TABLE public.whoop_workouts_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whoop_workouts_backup FORCE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.whoop_recovery_backup
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.whoop_sleep_backup
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.whoop_workouts_backup
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.whoop_recovery_backup
  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.whoop_sleep_backup
  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.whoop_workouts_backup
  TO service_role;

-- Preserve the legacy return contract, but derive the removed meal_name field
-- from the structured meal items that are canonical in the current schema.
CREATE OR REPLACE FUNCTION public.get_meals_around_workout(
  p_workout_id UUID,
  p_hours_window INTEGER DEFAULT 4
)
RETURNS TABLE (
  meal_id UUID,
  meal_name TEXT,
  meal_timestamp TIMESTAMPTZ,
  meal_timing TEXT,
  total_protein NUMERIC,
  total_carbs NUMERIC,
  total_fat NUMERIC,
  total_calories NUMERIC,
  time_diff_hours NUMERIC
)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT
    m.id,
    COALESCE(
      NULLIF(
        CONCAT_WS(
          ', ',
          COALESCE(
            NULLIF(m.items -> 0 ->> 'food', ''),
            NULLIF(m.items -> 0 ->> 'name', ''),
            NULLIF(m.items -> 0 ->> 'food_name', '')
          ),
          COALESCE(
            NULLIF(m.items -> 1 ->> 'food', ''),
            NULLIF(m.items -> 1 ->> 'name', ''),
            NULLIF(m.items -> 1 ->> 'food_name', '')
          ),
          COALESCE(
            NULLIF(m.items -> 2 ->> 'food', ''),
            NULLIF(m.items -> 2 ->> 'name', ''),
            NULLIF(m.items -> 2 ->> 'food_name', '')
          )
        ),
        ''
      ),
      NULLIF(INITCAP(REPLACE(m.meal_timing::TEXT, '_', ' ')), ''),
      'Meal'
    )::TEXT,
    m.meal_timestamp,
    m.meal_timing::TEXT,
    m.total_protein,
    m.total_carbs,
    m.total_fat,
    m.total_calories,
    (
      EXTRACT(EPOCH FROM (
        m.meal_timestamp - w.workout_date::TIMESTAMPTZ
      )) / 3600.0
    )::NUMERIC
  FROM public.meals AS m
  JOIN public.workouts AS w
    ON w.id = p_workout_id
   AND w.user_id = m.user_id
  WHERE m.meal_timestamp BETWEEN
      w.workout_date::TIMESTAMPTZ - make_interval(hours => p_hours_window)
    AND
      w.workout_date::TIMESTAMPTZ + make_interval(hours => p_hours_window)
  ORDER BY ABS(
    EXTRACT(EPOCH FROM (
      m.meal_timestamp - w.workout_date::TIMESTAMPTZ
    ))
  );
$function$;

REVOKE ALL PRIVILEGES ON FUNCTION
  public.get_meals_around_workout(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.get_meals_around_workout(UUID, INTEGER)
  TO service_role;

COMMIT;
