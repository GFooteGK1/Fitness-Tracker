-- Supervised request closure must precede any new plan/slot insert. Preserve
-- the existing private issuer, saved replays, owner lookup and nonpilot path.
BEGIN;
CREATE OR REPLACE FUNCTION public.create_registered_reviewed_week_proposal(p_registration_id uuid,p_idempotency_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE r public.coach_reviewed_proposal_registrations%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.coach_reviewed_proposal_registrations WHERE id=p_registration_id AND user_id=auth.uid();
  IF FOUND AND public.lock_supervised_program((r.packet#>>'{source,binding,scope,programId}')::uuid,r.user_id) THEN
    IF EXISTS(SELECT 1 FROM public.coach_reviewed_proposal_resolutions closed
      WHERE closed.user_id=r.user_id AND closed.operation='issue'
        AND (closed.registration_id=r.id OR closed.request_id=btrim(p_idempotency_key))) THEN
      RAISE EXCEPTION 'Reviewed proposal request is closed' USING ERRCODE='55000';
    END IF;
  END IF;
  RETURN public.create_registered_reviewed_week_proposal_before_supervision(p_registration_id,p_idempotency_key);
END $$;
REVOKE ALL ON FUNCTION public.create_registered_reviewed_week_proposal(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_registered_reviewed_week_proposal(uuid,text) TO authenticated;
COMMIT;
