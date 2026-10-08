-- ADR0036: first-week designation is separate from pilot enrollment and review approval.
-- Installation creates no designation, accepted base, lineage or enabled capability.
BEGIN;
CREATE TABLE public.coach_first_review_designations (
  id uuid PRIMARY KEY,
  program_id uuid NOT NULL REFERENCES public.training_programs(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  base_plan_version_id uuid NOT NULL,
  reviewer_id uuid NOT NULL REFERENCES auth.users(id),
  version integer NOT NULL CHECK(version>0),
  target_window_start date NOT NULL CHECK(isfinite(target_window_start) AND EXTRACT(ISODOW FROM target_window_start)=1),
  enabled boolean NOT NULL,
  expires_at timestamptz NOT NULL CHECK(isfinite(expires_at)),
  operator_ref text NOT NULL CHECK(length(btrim(operator_ref)) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(program_id,version),
  FOREIGN KEY(base_plan_version_id,program_id,user_id)
    REFERENCES public.training_plan_versions(id,program_id,user_id)
);
ALTER TABLE public.coach_first_review_designations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_first_review_designations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.coach_first_review_designations FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable_first_review_designation BEFORE UPDATE OR DELETE ON public.coach_first_review_designations
  FOR EACH ROW EXECUTE FUNCTION public.protect_supervised_authority();

-- Use the same lock key as eventual permanent lineage, even before it exists.
CREATE FUNCTION public.lock_first_review_program(p_program uuid,p_owner uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('supervised-program:'||p_program::text,0)) THEN
    RAISE EXCEPTION 'First review program is busy' USING ERRCODE='55P03'; END IF;
  PERFORM 1 FROM public.training_programs WHERE id=p_program AND user_id=p_owner FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'Owned first review program unavailable' USING ERRCODE='55000'; END IF;
END $$;

CREATE FUNCTION public.first_review_designation_json(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('designationId',d.id,'programId',d.program_id,'userId',d.user_id,
    'basePlanVersionId',d.base_plan_version_id,'reviewerId',d.reviewer_id,'version',d.version,
    'targetWindowStart',d.target_window_start,'enabled',d.enabled,'expiresAt',d.expires_at)
  FROM public.coach_first_review_designations d WHERE d.id=p_id
$$;

CREATE FUNCTION public.version_first_review_designation(p_id uuid,p_program_id uuid,p_user_id uuid,
  p_base_plan_version_id uuid,p_reviewer_id uuid,p_expected_version integer,p_target_window_start date,
  p_enabled boolean,p_expires_at timestamptz,p_operator_ref text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE saved public.coach_first_review_designations%ROWTYPE; current_version integer;
  program public.training_programs%ROWTYPE; base public.training_plan_versions%ROWTYPE;
BEGIN
  IF p_id IS NULL OR p_program_id IS NULL OR p_user_id IS NULL OR p_base_plan_version_id IS NULL OR p_reviewer_id IS NULL
    OR p_expected_version IS NULL OR p_expected_version<0 OR p_expected_version>=2147483647 OR p_enabled IS NULL
    OR p_target_window_start IS NULL OR NOT isfinite(p_target_window_start) OR EXTRACT(ISODOW FROM p_target_window_start)<>1
    OR p_expires_at IS NULL OR NOT isfinite(p_expires_at) OR p_operator_ref IS NULL
    OR length(btrim(p_operator_ref)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Invalid first review designation' USING ERRCODE='22023'; END IF;
  PERFORM public.lock_first_review_program(p_program_id,p_user_id);
  SELECT * INTO saved FROM public.coach_first_review_designations WHERE id=p_id;
  IF FOUND THEN
    IF (saved.program_id,saved.user_id,saved.base_plan_version_id,saved.reviewer_id,saved.version,saved.target_window_start,
        saved.enabled,saved.expires_at,saved.operator_ref) IS DISTINCT FROM
       (p_program_id,p_user_id,p_base_plan_version_id,p_reviewer_id,p_expected_version+1,p_target_window_start,
        p_enabled,p_expires_at,p_operator_ref) THEN
      RAISE EXCEPTION 'First review designation identity conflicts with saved content' USING ERRCODE='22023'; END IF;
    RETURN public.first_review_designation_json(saved.id);
  END IF;
  SELECT coalesce(max(version),0) INTO current_version FROM public.coach_first_review_designations WHERE program_id=p_program_id;
  IF current_version<>p_expected_version THEN RAISE EXCEPTION 'First review designation version changed' USING ERRCODE='40001'; END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_reviewer_id) OR (p_enabled AND p_expires_at<=clock_timestamp()) THEN
    RAISE EXCEPTION 'First reviewer or designation expiry invalid' USING ERRCODE='22023'; END IF;
  SELECT * INTO base FROM public.training_plan_versions WHERE id=p_base_plan_version_id AND user_id=p_user_id AND program_id=p_program_id;
  IF NOT FOUND OR base.plan_mode<>'rolling_weekly' OR base.intent->>'format' IS DISTINCT FROM 'rolling_weekly_intent_v0_1'
    OR base.window_start IS NULL OR base.window_end IS NULL OR NOT isfinite(base.window_start) OR NOT isfinite(base.window_end)
    OR EXTRACT(ISODOW FROM base.window_start)<>1 OR base.window_end IS DISTINCT FROM base.window_start+6
    OR p_target_window_start<=base.window_end+1 THEN
    RAISE EXCEPTION 'First review requires a legacy base and explicit later non-adjacent target' USING ERRCODE='55000'; END IF;
  SELECT * INTO program FROM public.training_programs WHERE id=p_program_id AND user_id=p_user_id;
  IF p_enabled OR current_version=0 THEN
    IF program.status<>'active' OR program.program_mode<>'rolling_weekly' OR program.active_plan_version_id IS DISTINCT FROM base.id
      OR base.status<>'accepted' OR EXISTS(SELECT 1 FROM public.coach_supervised_programs WHERE program_id=p_program_id) THEN
      RAISE EXCEPTION 'First reviewed onboarding is unavailable for this active base' USING ERRCODE='55000'; END IF;
  END IF;
  INSERT INTO public.coach_first_review_designations(id,program_id,user_id,base_plan_version_id,reviewer_id,version,
    target_window_start,enabled,expires_at,operator_ref) VALUES(p_id,p_program_id,p_user_id,p_base_plan_version_id,p_reviewer_id,
    current_version+1,p_target_window_start,p_enabled,p_expires_at,p_operator_ref);
  RETURN public.first_review_designation_json(p_id);
END $$;

CREATE FUNCTION public.assert_first_review_designation_current(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.coach_first_review_designations%ROWTYPE; program public.training_programs%ROWTYPE;
BEGIN
  SELECT * INTO d FROM public.coach_first_review_designations WHERE id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'First review designation unavailable' USING ERRCODE='55000'; END IF;
  PERFORM public.lock_first_review_program(d.program_id,d.user_id);
  IF NOT d.enabled OR d.expires_at<=clock_timestamp()
    OR d.version IS DISTINCT FROM (SELECT max(version) FROM public.coach_first_review_designations WHERE program_id=d.program_id) THEN
    RAISE EXCEPTION 'First review designation changed or disabled' USING ERRCODE='55000'; END IF;
  SELECT * INTO program FROM public.training_programs WHERE id=d.program_id;
  IF program.status<>'active' OR program.program_mode<>'rolling_weekly' OR program.active_plan_version_id IS DISTINCT FROM d.base_plan_version_id
    OR NOT EXISTS(SELECT 1 FROM public.training_plan_versions WHERE id=d.base_plan_version_id AND user_id=d.user_id
      AND program_id=d.program_id AND status='accepted' AND plan_mode='rolling_weekly' AND intent->>'format'='rolling_weekly_intent_v0_1')
    OR EXISTS(SELECT 1 FROM public.coach_supervised_programs WHERE program_id=d.program_id) THEN
    RAISE EXCEPTION 'First review active base changed' USING ERRCODE='40001'; END IF;
END $$;

-- This bounded discovery is not a private packet or a grant to review a week.
CREATE FUNCTION public.get_first_review_designation(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.coach_first_review_designations%ROWTYPE; actor uuid:=auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO d FROM public.coach_first_review_designations WHERE id=p_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF d.user_id=actor OR (d.reviewer_id=actor AND d.enabled AND d.expires_at>clock_timestamp()
    AND d.version=(SELECT max(version) FROM public.coach_first_review_designations WHERE program_id=d.program_id)) THEN
    RETURN public.first_review_designation_json(p_id); END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.lock_first_review_program(uuid,uuid),public.first_review_designation_json(uuid),
  public.assert_first_review_designation_current(uuid),public.get_first_review_designation(uuid),
  public.version_first_review_designation(uuid,uuid,uuid,uuid,uuid,integer,date,boolean,timestamptz,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.version_first_review_designation(uuid,uuid,uuid,uuid,uuid,integer,date,boolean,timestamptz,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_first_review_designation(uuid) TO authenticated;
ALTER FUNCTION public.version_first_review_designation(uuid,uuid,uuid,uuid,uuid,integer,date,boolean,timestamptz,text) SET lock_timeout='1s';
COMMIT;
