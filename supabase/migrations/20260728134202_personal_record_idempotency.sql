BEGIN;

-- A parsed workout may repeat one event for every set. Earlier application
-- code stored each qualifying event, including intermediate weights, as a
-- separate record. Keep the best result for each exercise/type in a workout
-- before adding the database-level idempotency boundary.
WITH ranked_records AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, workout_id, exercise, pr_type
      ORDER BY
        CASE WHEN pr_type = 'time' THEN value END ASC NULLS LAST,
        CASE WHEN pr_type <> 'time' THEN value END DESC NULLS LAST,
        achieved_at DESC,
        created_at DESC,
        id DESC
    ) AS result_rank
  FROM public.personal_records
  WHERE workout_id IS NOT NULL
)
DELETE FROM public.personal_records AS personal_record
USING ranked_records
WHERE personal_record.id = ranked_records.id
  AND ranked_records.result_rank > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.personal_records'::regclass
      AND conname = 'personal_records_one_per_workout_exercise_type'
  ) THEN
    ALTER TABLE public.personal_records
      ADD CONSTRAINT personal_records_one_per_workout_exercise_type
      UNIQUE (user_id, workout_id, exercise, pr_type);
  END IF;
END
$$;

COMMENT ON CONSTRAINT personal_records_one_per_workout_exercise_type
  ON public.personal_records IS
  'Makes PR detection idempotent and keeps one best result per exercise/type in a workout';

COMMIT;
