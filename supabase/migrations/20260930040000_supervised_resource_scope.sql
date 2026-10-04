-- Exact owner-scoped classification for HTTP composition. This is not write permission.
BEGIN;
CREATE FUNCTION public.get_supervised_resource_scope(p_kind text,p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); program uuid; plan uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_id IS NULL OR p_kind IS NULL OR p_kind NOT IN ('program','proposal','session') THEN
    RAISE EXCEPTION 'Invalid supervised resource scope' USING ERRCODE='22023'; END IF;
  IF p_kind='program' THEN
    SELECT id,active_plan_version_id INTO program,plan FROM public.training_programs WHERE id=p_id AND user_id=actor;
  ELSIF p_kind='proposal' THEN
    SELECT program_id,proposed_plan_version_id INTO program,plan FROM public.adaptation_proposals WHERE id=p_id AND user_id=actor;
  ELSE
    SELECT program_id,plan_version_id INTO program,plan FROM public.prescribed_sessions WHERE id=p_id AND user_id=actor;
  END IF;
  IF program IS NULL OR NOT EXISTS(SELECT 1 FROM public.coach_supervised_programs WHERE program_id=program AND user_id=actor) THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('schemaVersion',1,'userId',actor,'programId',program,'resourceKind',p_kind,'resourceId',p_id,'planVersionId',plan,
    'currentEnrollmentActive',coalesce((SELECT e.enabled AND e.expires_at>statement_timestamp()
      FROM public.coach_supervised_enrollments e WHERE e.program_id=program AND e.user_id=actor ORDER BY e.version DESC LIMIT 1),false));
END $$;
REVOKE ALL ON FUNCTION public.get_supervised_resource_scope(text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_supervised_resource_scope(text,uuid) TO authenticated;
COMMIT;
