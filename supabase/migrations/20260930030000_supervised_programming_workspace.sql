-- Read-only, bounded navigation for ADR0035. No enrollment or write activation.
BEGIN;

CREATE FUNCTION public.supervised_workspace_program(p_program_id uuid,p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE program public.training_programs%ROWTYPE; enrollment public.coach_supervised_enrollments%ROWTYPE;
BEGIN
  SELECT p.* INTO program FROM public.training_programs p JOIN public.coach_supervised_programs s
    ON s.program_id=p.id AND s.user_id=p.user_id WHERE p.id=p_program_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO enrollment FROM public.coach_supervised_enrollments WHERE program_id=program.id ORDER BY version DESC LIMIT 1;
  IF NOT FOUND OR p_actor IS NULL OR (p_actor<>program.user_id AND (p_actor<>enrollment.reviewer_id
    OR NOT enrollment.enabled OR enrollment.expires_at<=statement_timestamp() OR jsonb_array_length(enrollment.operations)=0)) THEN RETURN NULL; END IF;
  IF length(program.title)>1000 THEN RAISE EXCEPTION 'Program title exceeds workspace bound' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('programId',program.id,'title',program.title,'role',CASE WHEN p_actor=program.user_id THEN 'athlete' ELSE 'reviewer' END,
    'athleteId',program.user_id,'acceptedBaseId',CASE WHEN p_actor=program.user_id AND program.status='active' AND program.program_mode='rolling_weekly'
      AND EXISTS(SELECT 1 FROM public.coach_supervised_initial_bases b WHERE b.program_id=program.id AND b.user_id=program.user_id) THEN
      (SELECT v.id FROM public.training_plan_versions v WHERE v.id=program.active_plan_version_id AND v.program_id=program.id
        AND v.user_id=program.user_id AND v.status='accepted' AND v.plan_mode='rolling_weekly'
        AND v.intent->>'format'='reviewed_weekly_intent_v0_1') ELSE NULL END,
    'latestEnrollment',jsonb_build_object('enrollmentId',enrollment.id,'version',enrollment.version,'reviewerId',enrollment.reviewer_id,
      'enabled',enrollment.enabled,'expiresAt',enrollment.expires_at,'operations',enrollment.operations));
END $$;
REVOKE ALL ON FUNCTION public.supervised_workspace_program(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.list_supervised_programs(p_after_program_id uuid DEFAULT NULL,p_limit integer DEFAULT 20) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); entries jsonb; next_id uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Workspace page limit must be 1 through 50' USING ERRCODE='22023'; END IF;
  IF p_after_program_id IS NOT NULL AND public.supervised_workspace_program(p_after_program_id,actor) IS NULL THEN
    RAISE EXCEPTION 'Workspace cursor is outside visible scope' USING ERRCODE='22023'; END IF;
  WITH visible AS (
    SELECT s.program_id FROM public.coach_supervised_programs s
    JOIN LATERAL (SELECT reviewer_id,enabled,expires_at,operations FROM public.coach_supervised_enrollments WHERE program_id=s.program_id ORDER BY version DESC LIMIT 1) e ON true
    WHERE (s.user_id=actor OR (e.reviewer_id=actor AND e.enabled AND e.expires_at>statement_timestamp() AND jsonb_array_length(e.operations)>0))
      AND (p_after_program_id IS NULL OR s.program_id>p_after_program_id)
    ORDER BY s.program_id LIMIT p_limit+1
  ), page AS (SELECT program_id FROM visible ORDER BY program_id LIMIT p_limit)
  SELECT coalesce((SELECT jsonb_agg(public.supervised_workspace_program(program_id,actor) ORDER BY program_id) FROM page),'[]'::jsonb),
    CASE WHEN (SELECT count(*) FROM visible)>p_limit THEN (SELECT program_id FROM page ORDER BY program_id DESC LIMIT 1) ELSE NULL END
  INTO entries,next_id;
  RETURN jsonb_build_object('schemaVersion',1,'actorId',actor,'programs',entries,'nextAfterProgramId',next_id);
END $$;
REVOKE ALL ON FUNCTION public.list_supervised_programs(uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.list_supervised_programs(uuid,integer) TO authenticated;

CREATE FUNCTION public.get_supervised_program_workspace(p_program_id uuid,p_after_candidate_id uuid DEFAULT NULL,p_limit integer DEFAULT 20) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); program jsonb; entries jsonb; next_id uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_program_id IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Invalid workspace scope or page limit' USING ERRCODE='22023'; END IF;
  program:=public.supervised_workspace_program(p_program_id,actor);
  IF program IS NULL THEN RETURN NULL; END IF;
  IF p_after_candidate_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.coach_supervised_candidates c
    JOIN public.coach_supervised_enrollments e ON e.id=c.enrollment_id WHERE c.id=p_after_candidate_id AND c.program_id=p_program_id
    AND (c.user_id=actor OR (e.reviewer_id=actor AND e.id=(program#>>'{latestEnrollment,enrollmentId}')::uuid
      AND e.enabled AND e.expires_at>statement_timestamp() AND e.operations ? (c.private_packet#>>'{inputSnapshot,reviewedWeekTransition,kind}')))) THEN
    RAISE EXCEPTION 'Candidate cursor is outside visible scope' USING ERRCODE='22023'; END IF;
  -- Owner history survives enrollment changes. Reviewer visibility matches
  -- get_supervised_candidate: the original enrollment must still be current,
  -- enabled, unexpired, and permit this candidate's original transition.
  WITH visible AS (
    SELECT c.id,c.enrollment_id,e.version,e.reviewer_id,c.created_at,
      c.private_packet#>>'{inputSnapshot,reviewedWeekTransition,kind}' AS transition
    FROM public.coach_supervised_candidates c JOIN public.coach_supervised_enrollments e ON e.id=c.enrollment_id
    WHERE c.program_id=p_program_id AND (p_after_candidate_id IS NULL OR c.id>p_after_candidate_id)
      AND (c.user_id=actor OR (e.reviewer_id=actor AND e.id=(program#>>'{latestEnrollment,enrollmentId}')::uuid
        AND e.enabled AND e.expires_at>statement_timestamp()
        AND e.operations ? (c.private_packet#>>'{inputSnapshot,reviewedWeekTransition,kind}')))
    ORDER BY c.id LIMIT p_limit+1
  ), page AS (SELECT * FROM visible ORDER BY id LIMIT p_limit)
  SELECT coalesce((SELECT jsonb_agg(jsonb_build_object('candidateId',c.id,'enrollmentId',c.enrollment_id,'enrollmentVersion',c.version,
      'reviewerId',c.reviewer_id,'transition',c.transition,'createdAt',c.created_at,'decision',coalesce(d.decision,'pending'),
      'proposalId',p.id,'proposalStatus',p.status,'planVersionId',p.proposed_plan_version_id) ORDER BY c.id)
    FROM page c LEFT JOIN public.coach_supervised_decisions d ON d.candidate_id=c.id AND d.enrollment_id=c.enrollment_id
    LEFT JOIN public.coach_reviewed_proposal_registrations r ON r.id=c.id
    LEFT JOIN public.adaptation_proposals p ON p.id=r.proposal_id AND p.proposed_plan_version_id=r.plan_version_id
      AND p.program_id=p_program_id AND p.user_id=(program->>'athleteId')::uuid),'[]'::jsonb),
    CASE WHEN (SELECT count(*) FROM visible)>p_limit THEN (SELECT id FROM page ORDER BY id DESC LIMIT 1) ELSE NULL END
  INTO entries,next_id;
  RETURN jsonb_build_object('schemaVersion',1,'actorId',actor,'program',program,'candidates',entries,'nextAfterCandidateId',next_id);
END $$;
REVOKE ALL ON FUNCTION public.get_supervised_program_workspace(uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_supervised_program_workspace(uuid,uuid,integer) TO authenticated;
COMMIT;
