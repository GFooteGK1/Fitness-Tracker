BEGIN;

CREATE TEMP TABLE verify_complete_programming_contract (
  label TEXT PRIMARY KEY,
  prescription JSONB NOT NULL,
  CONSTRAINT verify_complete_programming_contract_check CHECK (
    (
      prescription ? 'domain'
      AND prescription ? 'intent'
      AND prescription ? 'dose'
      AND prescription ? 'effort'
      AND prescription ? 'rest'
      AND prescription ? 'success_condition'
      AND prescription ? 'stop_condition'
      AND prescription ? 'scale_options'
      AND prescription ? 'evidence'
    )
    OR
    (
      prescription->>'format' = 'complete_programming_v0_3'
      AND prescription->>'kernelVersion' = '0.3.0'
      AND jsonb_typeof(prescription->'schemaVersion') = 'number'
      AND prescription ? 'domain'
      AND prescription ? 'intent'
      AND prescription ? 'policyVersion'
      AND prescription ? 'evidenceReferenceVersion'
      AND prescription ? 'movementCatalogVersion'
      AND prescription ? 'blocks'
      AND jsonb_typeof(prescription->'blocks') = 'array'
      AND jsonb_array_length(prescription->'blocks') >= 2
    )
  )
);

INSERT INTO verify_complete_programming_contract (label, prescription)
VALUES (
  'legacy_v0_2',
  '{"domain":"strength","intent":"Build strength","dose":{},"effort":"RPE 8","rest":"2 minutes","success_condition":"Complete quality work","stop_condition":"Stop on technique loss","scale_options":[],"evidence":{}}'::JSONB
), (
  'complete_programming_v0_3',
  '{"schemaVersion":1,"format":"complete_programming_v0_3","kernelVersion":"0.3.0","policyVersion":"0.3.0","evidenceReferenceVersion":"complete-programming-0.1.0","movementCatalogVersion":"complete-movements-0.1.0","domain":"strength","intent":"Build strength","blocks":[{},{}]}'::JSONB
);

DO $verify_invalid$
BEGIN
  BEGIN
    INSERT INTO verify_complete_programming_contract (label, prescription)
    VALUES ('invalid', '{"domain":"strength","intent":"Incomplete"}'::JSONB);
    RAISE EXCEPTION 'invalid_prescription_was_accepted';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;
END
$verify_invalid$;

DO $verify_live_constraint$
DECLARE
  v_definition TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid)
  INTO v_definition
  FROM pg_constraint
  WHERE conrelid = 'public.prescribed_sessions'::regclass
    AND conname = 'prescribed_sessions_contract_check';

  IF v_definition IS NULL
    OR v_definition NOT LIKE '%complete_programming_v0_3%'
    OR v_definition NOT LIKE '%stop_condition%'
  THEN
    RAISE EXCEPTION 'live_prescription_contract_is_not_dual_format';
  END IF;
END
$verify_live_constraint$;

ROLLBACK;
