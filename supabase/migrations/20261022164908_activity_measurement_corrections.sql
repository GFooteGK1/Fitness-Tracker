-- Prepared locally; application requires separate owner approval.
-- Replace the existing signature in place: retain OID/owner/ACL/search_path.
-- No new functions, grants, tables, credentials, model calls or activation.
DO $$ BEGIN
 IF to_regprocedure('public.mutate_capture_activity(text,uuid,integer,text,jsonb,jsonb,jsonb,boolean,boolean)') IS NULL THEN
  RAISE EXCEPTION 'Existing capture correction engine is required; refusing to create a new executable function';
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.mutate_capture_activity(p_kind TEXT,p_entity_id UUID,p_expected_revision INTEGER,p_request_id TEXT,p_record JSONB,p_blocks JSONB,p_provenance JSONB,p_execution BOOLEAN,p_delete BOOLEAN) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE payload JSONB; op public.activity_mutations; prior JSONB; r JSONB; b JSONB; t TIMESTAMPTZ:=now(); v INTEGER; out_receipt JSONB; event_time TIMESTAMPTZ; execution JSONB; projection_changed BOOLEAN:=true; old_facts JSONB; new_facts JSONB; facts JSONB; pass INTEGER; bi INTEGER; si INTEGER; ei INTEGER; idx INTEGER; coll TEXT; bp TEXT[]; ep TEXT[];
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('capture-owner:'||auth.uid()::text,0));
 IF p_kind NOT IN ('workout','meal') OR p_kind IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1 OR length(p_request_id) NOT BETWEEN 8 AND 200 OR p_request_id IS NULL THEN RAISE EXCEPTION 'Invalid amendment identity' USING ERRCODE='22023'; END IF;
 payload:=jsonb_build_object('kind',p_kind,'entityId',p_entity_id,'expectedRevision',p_expected_revision,'record',p_record,'blocks',p_blocks,'provenance',p_provenance,'execution',p_execution,'delete',p_delete);
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_request_id,0));
 SELECT * INTO op FROM public.activity_mutations WHERE user_id=auth.uid() AND request_key=p_request_id;
 IF FOUND THEN
 IF op.payload IS DISTINCT FROM payload THEN RAISE EXCEPTION 'Amendment request reused with different data' USING ERRCODE='22023'; END IF;
 RETURN op.receipt;
 END IF;
 IF p_kind='meal' THEN
 SELECT to_jsonb(m) INTO prior FROM public.meals m WHERE id=p_entity_id AND user_id=auth.uid() FOR UPDATE;
 ELSE
 SELECT to_jsonb(w) INTO prior FROM public.workouts w WHERE id=p_entity_id AND user_id=auth.uid() FOR UPDATE;
 END IF;
 IF prior IS NULL THEN RAISE EXCEPTION 'Unknown activity' USING ERRCODE='42501'; END IF;
 v:=(prior->>'capture_revision')::integer;
 event_time:=coalesce((SELECT event_at FROM public.activity_revisions WHERE original_entity_id=p_entity_id AND user_id=auth.uid() AND entity_kind=p_kind AND revision=v),CASE WHEN p_kind='meal' THEN (prior->>'meal_timestamp')::timestamptz ELSE (prior->>'workout_date')::date::timestamptz END);
 IF v<>p_expected_revision THEN RAISE EXCEPTION 'Activity revision changed; reload before correcting' USING ERRCODE='40001'; END IF;
 IF p_kind='workout' AND prior->>'execution_source'='program_runner' THEN
 IF NOT p_execution OR p_delete OR prior->>'execution_status'<>'completed' THEN RAISE EXCEPTION 'Use the dedicated completed execution amendment' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.prescribed_sessions WHERE completed_workout_id=p_entity_id AND user_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'Execution link is unavailable' USING ERRCODE='55000'; END IF;
 SELECT jsonb_build_object('supersedesRevision',v,'prescribedSessionId',s.id,'planVersionId',s.plan_version_id,'acceptedPrescription',s.prescription,
 'originalCheckinIds',(SELECT coalesce(jsonb_agg(c.id),'[]') FROM public.coach_checkins c WHERE c.prescribed_session_id=s.id AND c.user_id=auth.uid()),
 'originalObservationGroupIds',(SELECT coalesce(jsonb_agg(g.id),'[]') FROM public.performance_observation_groups g WHERE g.prescribed_session_id=s.id AND g.user_id=auth.uid())) INTO execution
 FROM public.prescribed_sessions s WHERE completed_workout_id=p_entity_id AND user_id=auth.uid();
 ELSIF p_execution THEN RAISE EXCEPTION 'This is not a program execution' USING ERRCODE='22023'; END IF;
 INSERT INTO public.activity_mutations(user_id,request_key,payload) VALUES(auth.uid(),p_request_id,payload) RETURNING * INTO op;
 -- Unknown legacy history is observed now, never backdated to the event date.
 PERFORM public.capture_snapshot(p_kind,p_entity_id,op.id);
 IF NOT p_delete THEN
 event_time:=CASE WHEN p_kind='meal' THEN (p_record->>'meal_timestamp')::timestamptz WHEN p_record->>'workout_date'=prior->>'workout_date' THEN coalesce((SELECT event_at FROM public.activity_revisions WHERE original_entity_id=p_entity_id AND user_id=auth.uid() AND entity_kind=p_kind AND revision=v),(p_record->>'workout_date')::date::timestamptz) ELSE (p_record->>'workout_date')::date::timestamptz END;
 PERFORM public.validate_capture_operation(jsonb_build_object('kind',p_kind,'record',p_record,'blocks',p_blocks,'provenance',p_provenance,'inputMethod',prior->>'capture_input_method','eventAt',CASE WHEN p_kind='workout' THEN to_jsonb(p_record->>'workout_date') ELSE to_jsonb(event_time) END));
 r:=public.capture_normalized_record(p_kind,p_record);
 -- Derive the decision under the existing owner/revision lock, from stored and
 -- validated canonical facts. Never trust caller p_blocks as a skip signal.
 -- Velocity and readiness are recorded context, unused by current score/PR helpers.
 -- Everything else stays conservatively significant, including unknown metadata.
 IF p_kind='workout' THEN
  FOR pass IN 1..2 LOOP
   facts:=CASE WHEN pass=1 THEN prior->'blocks' ELSE r->'blocks' END;
   IF jsonb_typeof(facts)='array' AND jsonb_array_length(facts)>0 THEN
    FOR bi IN 0..jsonb_array_length(facts)-1 LOOP
     facts:=facts #- ARRAY[bi::text,'session_readiness'];
     bp:=ARRAY[bi::text,'segments'];
     IF jsonb_typeof(facts#>bp)='array' AND jsonb_array_length(facts#>bp)>0 THEN
      FOR si IN 0..jsonb_array_length(facts#>bp)-1 LOOP
       ep:=bp||ARRAY[si::text,'events'];
       IF jsonb_typeof(facts#>ep)='array' AND jsonb_array_length(facts#>ep)>0 THEN
        FOR ei IN 0..jsonb_array_length(facts#>ep)-1 LOOP
         FOREACH coll IN ARRAY ARRAY['sets','set_details'] LOOP
          IF jsonb_typeof(facts#>(ep||ARRAY[ei::text,'performed',coll]))='array' AND jsonb_array_length(facts#>(ep||ARRAY[ei::text,'performed',coll]))>0 THEN
           FOR idx IN 0..jsonb_array_length(facts#>(ep||ARRAY[ei::text,'performed',coll]))-1 LOOP
            facts:=facts #- (ep||ARRAY[ei::text,'performed',coll,idx::text,'velocity']);
           END LOOP;
          END IF;
         END LOOP;
        END LOOP;
       END IF;
      END LOOP;
     END IF;
    END LOOP;
   END IF;
   IF pass=1 THEN old_facts:=facts; ELSE new_facts:=facts; END IF;
  END LOOP;
  projection_changed:=old_facts IS DISTINCT FROM new_facts
   OR prior->'workout_date' IS DISTINCT FROM r->'workout_date'
   OR prior#>'{capture_provenance,fields,quantities,origin}' IS DISTINCT FROM p_provenance#>'{fields,quantities,origin}'
   OR prior#>'{capture_provenance,fields,quantities,reviewState}' IS DISTINCT FROM p_provenance#>'{fields,quantities,reviewState}';
 END IF;
 END IF;
 IF p_kind='meal' THEN
 IF NOT p_delete THEN
 UPDATE public.meals SET meal_timestamp=(r->>'meal_timestamp')::timestamptz,meal_timing=r->>'meal_timing',items=r->'items',total_protein=(r->>'total_protein')::numeric,total_carbs=(r->>'total_carbs')::numeric,total_fat=(r->>'total_fat')::numeric,total_calories=(r->>'total_calories')::numeric,
 needs_review=coalesce((r->>'needs_review')::boolean,true),manual_override=coalesce((r->>'manual_override')::boolean,false),reviewed_at=(r->>'reviewed_at')::timestamptz,entry_method=coalesce(r->>'entry_method','other'),source_meal_id=(r->>'source_meal_id')::uuid,ai_confidence=(r->>'ai_confidence')::numeric,input_text=r->>'input_text',capture_provenance=p_provenance,updated_at=t WHERE id=p_entity_id;
 END IF;
 UPDATE public.meals SET capture_revision=v+1,captured_at=t WHERE id=p_entity_id;
 ELSE
 IF NOT p_delete THEN
 UPDATE public.workouts SET workout_date=(r->>'workout_date')::date,input_text=coalesce(r->>'input_text',''),blocks=r->'blocks',primary_score=r->>'primary_score',total_duration_min=(r->>'total_duration_min')::integer,
 tags=ARRAY(SELECT jsonb_array_elements_text(coalesce(r->'tags','[]'))),notes=r->>'notes',rpe=CASE WHEN jsonb_typeof(r->'rpe')='number' THEN (r->>'rpe')::numeric END,
 parse_confidence=(r->>'parse_confidence')::numeric,capture_provenance=p_provenance WHERE id=p_entity_id;
 IF projection_changed THEN
 DELETE FROM public.block_scores WHERE workout_id=p_entity_id AND user_id=auth.uid();
 FOR b IN SELECT value FROM jsonb_array_elements(public.capture_block_projections(r->'blocks')) LOOP
 INSERT INTO public.block_scores(workout_id,user_id,block_type,block_title,rounds_completed,extra_reps,time_s,total_reps,tonnage_lb,rx_status,is_pr)
 VALUES(p_entity_id,auth.uid(),b->>'block_type',b->>'block_title',(b->>'rounds_completed')::integer,(b->>'extra_reps')::integer,(b->>'time_s')::integer,(b->>'total_reps')::integer,(b->>'tonnage_lb')::numeric,b->>'rx_status',false);
 END LOOP;
 END IF;
 END IF;
 -- Old PR assertions are no longer current after an execution correction. Never retain a stale score.
 IF p_delete OR projection_changed THEN PERFORM public.capture_refresh_prs(p_entity_id,prior->'blocks',p_delete); END IF;
 UPDATE public.workouts SET capture_revision=v+1,captured_at=t WHERE id=p_entity_id;
 END IF;
 PERFORM public.capture_snapshot(p_kind,p_entity_id,op.id,p_delete,execution,r,event_time,CASE WHEN p_kind='workout' AND (p_delete OR p_record->>'workout_date'=prior->>'workout_date') THEN coalesce((SELECT event_precision FROM public.activity_revisions WHERE user_id=auth.uid() AND original_entity_id=p_entity_id AND revision=v),'date') WHEN p_kind='workout' THEN 'date' ELSE 'timestamp' END);
 out_receipt:=jsonb_build_object('schemaVersion',2,'userId',auth.uid(),'requestId',op.id,'requestKey',p_request_id,'operationId',op.id,'entityKind',p_kind,'entityId',p_entity_id,'revision',v+1,'eventAt',coalesce(event_time,CASE WHEN p_kind='meal' THEN (prior->>'meal_timestamp')::timestamptz ELSE (prior->>'workout_date')::date::timestamptz END),'capturedAt',t,'inputMethod',prior->>'capture_input_method','state','saved','provenance',coalesce(p_provenance,prior->'capture_provenance'),'recommendationId',prior->'capture_recommendation_id','deleted',p_delete,'projectionsStatus',CASE WHEN p_kind='workout' AND NOT p_delete AND NOT projection_changed THEN 'preserved_unchanged_inputs' WHEN p_kind='workout' THEN 'recomputed_supported_only' ELSE 'recomputed' END,'eventPrecision',CASE WHEN p_kind='workout' THEN coalesce((SELECT event_precision FROM public.activity_revisions WHERE user_id=auth.uid() AND original_entity_id=p_entity_id AND revision=v+1),'date') ELSE 'timestamp' END);
 IF p_delete THEN
 IF p_kind='meal' THEN DELETE FROM public.meals WHERE id=p_entity_id AND user_id=auth.uid(); ELSE DELETE FROM public.workouts WHERE id=p_entity_id AND user_id=auth.uid(); END IF;
 END IF;
 IF p_kind='workout' AND out_receipt->>'eventPrecision'='date' THEN out_receipt:=jsonb_set(out_receipt,'{eventAt}',to_jsonb(coalesce(p_record->>'workout_date',prior->>'workout_date'))); END IF;
 UPDATE public.activity_mutations SET receipt=out_receipt WHERE id=op.id;
 RETURN out_receipt;
END $$;
