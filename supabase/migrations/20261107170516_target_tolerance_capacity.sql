-- Preserve the existing inclusive 0..100 contract and two-decimal rounding.
-- Historical bootstrap DDL remains unchanged; apply this forward migration after it.
-- Do not narrow again after 100 has been stored: that requires a separate safe plan.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $migration$
DECLARE column_type text;
BEGIN
  SELECT pg_catalog.format_type(atttypid, atttypmod) INTO column_type
  FROM pg_catalog.pg_attribute
  WHERE attrelid = pg_catalog.to_regclass('public.daily_targets')
    AND attname = 'tolerance_pct' AND attnum > 0 AND NOT attisdropped;

  IF column_type = 'numeric(4,2)' THEN
    ALTER TABLE public.daily_targets ALTER COLUMN tolerance_pct TYPE numeric(5,2);
  ELSIF column_type IS DISTINCT FROM 'numeric(5,2)' THEN
    RAISE EXCEPTION 'Unexpected daily_targets.tolerance_pct type; inspect schema before widening';
  END IF;
END;
$migration$;
COMMIT;
