-- ============================================================
-- Agent Context Views
-- Purpose: compact structured retrieval for Manager/Socius programming context
-- ============================================================

-- Daily workout context. One row per user/date.
CREATE OR REPLACE VIEW agent_daily_workout_context
WITH (security_invoker = true) AS
WITH workout_blocks AS (
  SELECT
    w.id,
    w.user_id,
    w.workout_date,
    w.input_text,
    w.primary_score,
    w.rpe,
    w.tags,
    COUNT(*) FILTER (WHERE block.elem ->> 'block_type' = 'STRENGTH') AS strength_blocks,
    COUNT(*) FILTER (WHERE block.elem ->> 'block_type' IN ('AMRAP', 'FOR_TIME', 'EMOM')) AS metcon_blocks,
    COUNT(*) FILTER (WHERE block.elem ->> 'block_type' = 'CARDIO') AS cardio_blocks
  FROM workouts w
  LEFT JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(w.blocks) = 'array' THEN w.blocks
      ELSE '[]'::jsonb
    END
  ) AS block(elem) ON true
  GROUP BY w.id, w.user_id, w.workout_date, w.input_text, w.primary_score, w.rpe, w.tags
)
SELECT
  user_id,
  workout_date AS date,
  COUNT(*) AS workout_count,
  STRING_AGG(
    COALESCE(NULLIF(primary_score, ''), NULLIF(input_text, ''), 'Workout logged'),
    ' | '
    ORDER BY id
  ) AS workout_summary,
  SUM(strength_blocks)::integer AS strength_blocks,
  SUM(metcon_blocks)::integer AS metcon_blocks,
  SUM(cardio_blocks)::integer AS cardio_blocks,
  AVG(rpe)::numeric(4,2) AS avg_rpe
FROM workout_blocks
GROUP BY user_id, workout_date;

-- Daily nutrition context. One row per user/date.
CREATE OR REPLACE VIEW agent_daily_nutrition_context
WITH (security_invoker = true) AS
SELECT
  m.user_id,
  DATE(m.meal_timestamp) AS date,
  COUNT(*) AS meal_count,
  SUM(m.total_protein)::numeric(8,2) AS total_protein,
  SUM(m.total_carbs)::numeric(8,2) AS total_carbs,
  SUM(m.total_fat)::numeric(8,2) AS total_fat,
  SUM(m.total_calories)::numeric(9,2) AS total_calories,
  MAX(dt.target_protein)::numeric(8,2) AS target_protein,
  MAX(dt.target_calories)::numeric(9,2) AS target_calories,
  CASE
    WHEN MAX(dt.target_protein) > 0
      THEN ROUND((SUM(m.total_protein) / MAX(dt.target_protein)) * 100, 1)
    ELSE NULL
  END AS protein_pct_target,
  CASE
    WHEN MAX(dt.target_calories) > 0
      THEN ROUND((SUM(m.total_calories) / MAX(dt.target_calories)) * 100, 1)
    ELSE NULL
  END AS calorie_pct_target
FROM meals m
LEFT JOIN daily_targets dt ON dt.user_id = m.user_id
GROUP BY m.user_id, DATE(m.meal_timestamp);

-- Daily recovery context. One row per user/date.
CREATE OR REPLACE VIEW agent_daily_recovery_context
WITH (security_invoker = true) AS
SELECT
  COALESCE(r.user_id, s.user_id, c.user_id) AS user_id,
  COALESCE(r.date, s.date, c.date) AS date,
  MAX(r.recovery_score)::integer AS recovery_score,
  MAX(r.hrv_rmssd_milli)::numeric(10,2) AS hrv_rmssd_milli,
  MAX(r.resting_heart_rate)::integer AS resting_heart_rate,
  MAX(s.sleep_performance_percentage)::integer AS sleep_score,
  MAX(s.sleep_efficiency_percentage)::numeric(5,2) AS sleep_efficiency_pct,
  MAX(c.strain)::numeric(5,2) AS strain
FROM whoop_recovery r
FULL OUTER JOIN whoop_sleep s
  ON s.user_id = r.user_id AND s.date = r.date
FULL OUTER JOIN whoop_cycles c
  ON c.user_id = COALESCE(r.user_id, s.user_id)
  AND c.date = COALESCE(r.date, s.date)
GROUP BY COALESCE(r.user_id, s.user_id, c.user_id), COALESCE(r.date, s.date, c.date);

-- Daily all-domain agent context. One row per user/date.
CREATE OR REPLACE VIEW daily_agent_context
WITH (security_invoker = true) AS
SELECT
  COALESCE(w.user_id, n.user_id, r.user_id) AS user_id,
  COALESCE(w.date, n.date, r.date) AS date,
  COALESCE(w.workout_count, 0)::integer AS workout_count,
  w.workout_summary,
  COALESCE(w.strength_blocks, 0)::integer AS strength_blocks,
  COALESCE(w.metcon_blocks, 0)::integer AS metcon_blocks,
  COALESCE(w.cardio_blocks, 0)::integer AS cardio_blocks,
  w.avg_rpe,
  COALESCE(n.meal_count, 0)::integer AS meal_count,
  COALESCE(n.total_protein, 0)::numeric(8,2) AS total_protein,
  COALESCE(n.total_carbs, 0)::numeric(8,2) AS total_carbs,
  COALESCE(n.total_fat, 0)::numeric(8,2) AS total_fat,
  COALESCE(n.total_calories, 0)::numeric(9,2) AS total_calories,
  n.protein_pct_target,
  n.calorie_pct_target,
  r.recovery_score,
  r.hrv_rmssd_milli,
  r.resting_heart_rate,
  r.sleep_score,
  r.sleep_efficiency_pct,
  r.strain
FROM agent_daily_workout_context w
FULL OUTER JOIN agent_daily_nutrition_context n
  ON n.user_id = w.user_id AND n.date = w.date
FULL OUTER JOIN agent_daily_recovery_context r
  ON r.user_id = COALESCE(w.user_id, n.user_id)
  AND r.date = COALESCE(w.date, n.date);

-- Bounded read function for agents. p_days protects prompt/context budgets.
CREATE OR REPLACE FUNCTION get_programming_readiness_context(
  p_user_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS SETOF daily_agent_context AS $$
BEGIN
  IF p_user_id <> auth.uid() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT *
  FROM daily_agent_context
  WHERE user_id = p_user_id
    AND date >= CURRENT_DATE - (LEAST(GREATEST(p_days, 1), 90) || ' days')::interval
  ORDER BY date DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY INVOKER;

CREATE INDEX IF NOT EXISTS idx_workouts_user_date_agent
  ON workouts(user_id, workout_date DESC);

CREATE INDEX IF NOT EXISTS idx_meals_user_timestamp_agent
  ON meals(user_id, meal_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_whoop_recovery_user_date_agent
  ON whoop_recovery(user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_whoop_sleep_user_date_agent
  ON whoop_sleep(user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_whoop_cycles_user_date_agent
  ON whoop_cycles(user_id, date DESC);
