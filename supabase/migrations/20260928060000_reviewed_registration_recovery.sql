-- Owned metadata-only recovery; no packet/table access or new issuance authority.
BEGIN;
CREATE FUNCTION public.get_reviewed_week_registration(p_registration_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE owner uuid:=auth.uid(); result jsonb;
BEGIN
  IF owner IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object('registrationId',r.id,'userId',r.user_id,
    'reviewId',r.packet->>'registrationId','proposalId',r.proposal_id,
    'planVersionId',r.plan_version_id,'programId',r.packet#>>'{source,binding,scope,programId}')
    INTO result FROM public.coach_reviewed_proposal_registrations r
    WHERE r.id=p_registration_id AND r.user_id=owner;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_reviewed_week_registration(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_reviewed_week_registration(uuid) TO authenticated;
COMMIT;
