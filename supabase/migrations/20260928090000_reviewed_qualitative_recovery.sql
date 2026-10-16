-- Prepared only: extend reviewed session representation, not numerical authority.
-- Schema 1 remains unchanged; schema 2 represents qualitative preparation rest.
-- Existing exact parent-plan and registered-proposal guards remain in force.
BEGIN;
ALTER TABLE public.prescribed_sessions DROP CONSTRAINT prescribed_sessions_contract_check;
ALTER TABLE public.prescribed_sessions ADD CONSTRAINT prescribed_sessions_contract_check CHECK ((
  CASE WHEN prescription->>'format' = 'reviewed_programming_v0_1' THEN (
    prescription->'schemaVersion' IN ('1'::jsonb, '2'::jsonb)
    AND prescription->>'policyVersion' = 'initial-dose-0.2.0'
    AND jsonb_typeof(prescription->'content') = 'object'
    AND jsonb_typeof(prescription#>'{content,steps}') = 'array'
    AND jsonb_typeof(prescription->'protocols') = 'array'
    AND jsonb_typeof(prescription->'source') = 'object'
    AND prescription->>'sessionId' = prescription#>>'{content,id}'
    AND prescription#>>'{source,recipeHash}' ~ '^[a-f0-9]{64}$') IS TRUE
  ELSE
    (prescription ?& ARRAY['domain','intent','dose','effort','rest','success_condition','stop_condition','scale_options','evidence'])
    OR (prescription->>'format' = 'complete_programming_v0_3'
      AND prescription->>'kernelVersion' = '0.3.0' AND jsonb_typeof(prescription->'schemaVersion') = 'number'
      AND prescription ?& ARRAY['domain','intent','policyVersion','evidenceReferenceVersion','movementCatalogVersion','blocks']
      AND jsonb_typeof(prescription->'blocks') = 'array' AND jsonb_array_length(prescription->'blocks') >= 2)
  END
)) NOT VALID;
ALTER TABLE public.prescribed_sessions VALIDATE CONSTRAINT prescribed_sessions_contract_check;
COMMIT;
