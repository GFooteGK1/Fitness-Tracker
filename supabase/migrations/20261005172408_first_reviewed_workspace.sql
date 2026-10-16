-- ADR0036: bounded navigation only. No enrollment, designation or write authority.
BEGIN;

CREATE FUNCTION public.first_review_workspace_program(p_program_id uuid,p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE program public.training_programs%ROWTYPE; designation public.coach_first_review_designations%ROWTYPE;
  base public.training_plan_versions%ROWTYPE; available boolean;
BEGIN
  IF p_actor IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO program FROM public.training_programs WHERE id=p_program_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO designation FROM public.coach_first_review_designations WHERE program_id=p_program_id ORDER BY version DESC LIMIT 1;
  -- Owners can discover an eligible legacy base before operator designation and
  -- retain their first-review history afterwards. Reviewers get current scope only.
  IF designation.id IS NULL THEN
    IF program.user_id<>p_actor OR program.status<>'active' OR program.program_mode<>'rolling_weekly' THEN RETURN NULL; END IF;
    SELECT * INTO base FROM public.training_plan_versions WHERE id=program.active_plan_version_id
      AND program_id=program.id AND user_id=program.user_id AND status='accepted' AND plan_mode='rolling_weekly'
      AND intent->>'format'='rolling_weekly_intent_v0_1';
  ELSE
    SELECT * INTO base FROM public.training_plan_versions WHERE id=designation.base_plan_version_id
      AND program_id=program.id AND user_id=program.user_id;
  END IF;
  IF base.id IS NULL OR base.window_start IS NULL OR base.window_end IS NULL OR NOT isfinite(base.window_start)
    OR NOT isfinite(base.window_end) OR EXTRACT(ISODOW FROM base.window_start)<>1 OR base.window_end<>base.window_start+6
    OR base.sequence_number IS NULL OR base.sequence_number<1 OR base.sequence_number>=2147483647 THEN RETURN NULL; END IF;
  available:=designation.id IS NOT NULL AND designation.enabled AND designation.expires_at>statement_timestamp()
    AND program.status='active' AND program.program_mode='rolling_weekly' AND program.active_plan_version_id=base.id
    AND base.status='accepted' AND base.plan_mode='rolling_weekly' AND base.intent->>'format'='rolling_weekly_intent_v0_1'
    AND NOT EXISTS(SELECT 1 FROM public.coach_supervised_programs WHERE program_id=program.id);
  IF program.user_id<>p_actor AND (NOT available OR designation.reviewer_id<>p_actor) THEN RETURN NULL; END IF;
  IF length(program.title)>1000 THEN RAISE EXCEPTION 'Program title exceeds workspace bound' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('programId',program.id,'title',program.title,'role',CASE WHEN program.user_id=p_actor THEN 'athlete' ELSE 'reviewer' END,
    'athleteId',program.user_id,'activePlanVersionId',CASE WHEN program.user_id=p_actor THEN program.active_plan_version_id ELSE NULL END,
    'legacyBase',jsonb_build_object('planVersionId',base.id,'windowStart',base.window_start,'windowEnd',base.window_end,'sequenceNumber',base.sequence_number),
    'latestDesignation',public.first_review_designation_json(designation.id),'reviewAvailable',available);
END $$;
REVOKE ALL ON FUNCTION public.first_review_workspace_program(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.list_first_review_programs(p_after_program_id uuid DEFAULT NULL,p_limit integer DEFAULT 20) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); entries jsonb; next_id uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Invalid workspace limit' USING ERRCODE='22023'; END IF;
  IF p_after_program_id IS NOT NULL AND public.first_review_workspace_program(p_after_program_id,actor) IS NULL THEN
    RAISE EXCEPTION 'Program cursor is outside visible scope' USING ERRCODE='22023'; END IF;
  WITH eligible AS (
    SELECT p.id FROM public.training_programs p WHERE (p.user_id=actor OR EXISTS(SELECT 1 FROM public.coach_first_review_designations d
      WHERE d.program_id=p.id AND d.reviewer_id=actor AND d.enabled AND d.expires_at>statement_timestamp()))
      AND (p_after_program_id IS NULL OR p.id>p_after_program_id)
  ), visible AS (
    SELECT id,public.first_review_workspace_program(id,actor) AS summary FROM eligible
  ), bounded AS (SELECT * FROM visible WHERE summary IS NOT NULL ORDER BY id LIMIT p_limit+1),
  page AS (SELECT * FROM bounded ORDER BY id LIMIT p_limit)
  SELECT coalesce((SELECT jsonb_agg(summary ORDER BY id) FROM page),'[]'::jsonb),
    CASE WHEN (SELECT count(*) FROM bounded)>p_limit THEN (SELECT id FROM page ORDER BY id DESC LIMIT 1) ELSE NULL END
  INTO entries,next_id;
  RETURN jsonb_build_object('schemaVersion',1,'actorId',actor,'programs',entries,'nextAfterProgramId',next_id);
END $$;

CREATE FUNCTION public.get_first_review_program_workspace(p_program_id uuid,p_after_candidate_id uuid DEFAULT NULL,p_limit integer DEFAULT 20) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); program jsonb; entries jsonb; next_id uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_program_id IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Invalid workspace scope' USING ERRCODE='22023'; END IF;
  program:=public.first_review_workspace_program(p_program_id,actor);
  IF program IS NULL THEN RETURN NULL; END IF;
  IF p_after_candidate_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.coach_first_review_candidates c WHERE c.id=p_after_candidate_id
    AND c.program_id=p_program_id AND (c.user_id=actor OR c.designation_id=(program#>>'{latestDesignation,designationId}')::uuid)) THEN
    RAISE EXCEPTION 'Candidate cursor is outside visible scope' USING ERRCODE='22023'; END IF;
  WITH visible AS (
    SELECT c.id,c.designation_id,c.created_at,d.version,d.reviewer_id FROM public.coach_first_review_candidates c
    JOIN public.coach_first_review_designations d ON d.id=c.designation_id WHERE c.program_id=p_program_id
      AND (p_after_candidate_id IS NULL OR c.id>p_after_candidate_id)
      AND (c.user_id=actor OR c.designation_id=(program#>>'{latestDesignation,designationId}')::uuid)
    ORDER BY c.id LIMIT p_limit+1
  ), page AS (SELECT * FROM visible ORDER BY id LIMIT p_limit)
  SELECT coalesce((SELECT jsonb_agg(jsonb_build_object('candidateId',c.id,'designationId',c.designation_id,'designationVersion',c.version,
      'reviewerId',c.reviewer_id,'createdAt',c.created_at,'decision',coalesce(d.decision,'pending'),
      'proposalId',p.id,'proposalStatus',p.status,'planVersionId',p.proposed_plan_version_id,
      'proposalRequestId',CASE WHEN actor=(program->>'athleteId')::uuid THEN p.idempotency_key ELSE NULL END) ORDER BY c.id)
    FROM page c LEFT JOIN public.coach_first_review_decisions d ON d.candidate_id=c.id AND d.designation_id=c.designation_id
    LEFT JOIN public.coach_reviewed_proposal_registrations r ON r.id=c.id
    LEFT JOIN public.adaptation_proposals p ON p.id=r.proposal_id AND p.proposed_plan_version_id=r.plan_version_id
      AND p.program_id=p_program_id AND p.user_id=(program->>'athleteId')::uuid),'[]'::jsonb),
    CASE WHEN (SELECT count(*) FROM visible)>p_limit THEN (SELECT id FROM page ORDER BY id DESC LIMIT 1) ELSE NULL END
  INTO entries,next_id;
  RETURN jsonb_build_object('schemaVersion',1,'actorId',actor,'program',program,'candidates',entries,'nextAfterCandidateId',next_id);
END $$;

-- A reviewer sees the approved candidate's bounded facts, never standalone owned
-- setup snapshots. Owner history is available even after acceptance/revocation.
CREATE FUNCTION public.list_first_review_profile_snapshots(p_program_id uuid,p_after_snapshot_id uuid DEFAULT NULL,p_limit integer DEFAULT 20) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); program jsonb; entries jsonb; next_id uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_program_id IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Invalid profile scope' USING ERRCODE='22023'; END IF;
  program:=public.first_review_workspace_program(p_program_id,actor);
  IF program IS NULL OR program->>'role'<>'athlete' THEN RETURN NULL; END IF;
  IF p_after_snapshot_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.coach_first_review_profile_snapshots s
    WHERE s.id=p_after_snapshot_id AND s.program_id=p_program_id AND s.user_id=actor) THEN
    RAISE EXCEPTION 'Profile cursor is outside owned scope' USING ERRCODE='22023'; END IF;
  WITH visible AS (
    SELECT s.id,s.designation_id,s.created_at,s.source->>'validBefore' AS valid_before FROM public.coach_first_review_profile_snapshots s
    WHERE s.program_id=p_program_id AND s.user_id=actor AND (p_after_snapshot_id IS NULL OR s.id>p_after_snapshot_id)
    ORDER BY s.id LIMIT p_limit+1
  ), page AS (SELECT * FROM visible ORDER BY id LIMIT p_limit)
  SELECT coalesce((SELECT jsonb_agg(jsonb_build_object('snapshotId',s.id,'designationId',s.designation_id,'createdAt',s.created_at,
    'validBefore',s.valid_before,'confirmationRequestId',c.request_id,'confirmedAt',c.confirmed_at) ORDER BY s.id)
    FROM page s LEFT JOIN public.coach_first_review_profile_confirmations c ON c.snapshot_id=s.id AND c.user_id=actor),'[]'::jsonb),
    CASE WHEN (SELECT count(*) FROM visible)>p_limit THEN (SELECT id FROM page ORDER BY id DESC LIMIT 1) ELSE NULL END
  INTO entries,next_id;
  RETURN jsonb_build_object('schemaVersion',1,'actorId',actor,'programId',p_program_id,'snapshots',entries,'nextAfterSnapshotId',next_id);
END $$;

REVOKE ALL ON FUNCTION public.list_first_review_programs(uuid,integer),public.get_first_review_program_workspace(uuid,uuid,integer),
  public.list_first_review_profile_snapshots(uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.list_first_review_programs(uuid,integer),public.get_first_review_program_workspace(uuid,uuid,integer),
  public.list_first_review_profile_snapshots(uuid,uuid,integer) TO authenticated;
COMMIT;
