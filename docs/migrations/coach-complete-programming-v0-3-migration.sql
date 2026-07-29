BEGIN;

ALTER TABLE public.prescribed_sessions
  DROP CONSTRAINT IF EXISTS prescribed_sessions_contract_check;

ALTER TABLE public.prescribed_sessions
  ADD CONSTRAINT prescribed_sessions_contract_check CHECK (
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
  ) NOT VALID;

COMMENT ON CONSTRAINT prescribed_sessions_contract_check
  ON public.prescribed_sessions IS
  'Allows immutable legacy v0.2 prescriptions and validated complete-programming v0.3 prescriptions';

COMMIT;

BEGIN;

ALTER TABLE public.prescribed_sessions
  VALIDATE CONSTRAINT prescribed_sessions_contract_check;

COMMIT;
