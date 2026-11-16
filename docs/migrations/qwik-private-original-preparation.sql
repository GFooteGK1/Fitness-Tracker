-- INACTIVE PREPARATION. Never applied by the application or migration runner.
-- This disposable-fixture tripwire is not an authorization/security boundary.
BEGIN;
DO $$ BEGIN
 IF current_setting('socius.qwik_private_disposable_fixture',true) IS DISTINCT FROM 'true' THEN
  RAISE EXCEPTION 'Private QWIK preparation is unapplied; disposable fixture opt-in required';
 END IF;
 IF to_regclass('public.activity_revisions') IS NULL OR to_regclass('public.measurement_imports') IS NULL THEN
  RAISE EXCEPTION 'Existing canonical capture and layered evidence schema required';
 END IF;
END $$;

CREATE SCHEMA qwik_private;
REVOKE ALL ON SCHEMA qwik_private FROM PUBLIC,anon,authenticated;

CREATE TABLE qwik_private.owner_policies (
 user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
 executor_role NAME NOT NULL CHECK(executor_role::text NOT IN ('PUBLIC','anon','authenticated','authenticator','service_role','none')),
 byte_quota BIGINT NOT NULL CHECK(byte_quota>0),
 max_retention_seconds BIGINT NOT NULL CHECK(max_retention_seconds>0)
);
-- No policies are seeded here. Aggregate quota/retention policy needs approval.
CREATE TABLE qwik_private.namespaces (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 source_system TEXT NOT NULL DEFAULT 'qwik_vbt' CHECK(source_system='qwik_vbt'),
 source_reference TEXT NOT NULL CHECK(length(btrim(source_reference)) BETWEEN 1 AND 500),
 basis TEXT NOT NULL CHECK(basis IN ('unresolved','owner_attested_source_account_device')),
 state TEXT NOT NULL DEFAULT 'unresolved' CHECK(state IN ('unresolved','confirmed')),
 confirmed_at TIMESTAMPTZ,
 UNIQUE(id,user_id), UNIQUE(user_id,source_reference),
 CHECK((state='unresolved' AND confirmed_at IS NULL) OR
       (state='confirmed' AND basis='owner_attested_source_account_device' AND confirmed_at IS NOT NULL))
);
CREATE TABLE qwik_private.artifacts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 sha256 TEXT NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 byte_length INTEGER NOT NULL CHECK(byte_length BETWEEN 2 AND 5000000),
 original_bytes BYTEA,
 name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 255),
 state TEXT NOT NULL DEFAULT 'retained' CHECK(state IN ('retained','deleted')),
 retained_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 expires_at TIMESTAMPTZ NOT NULL CHECK(isfinite(expires_at)),
 deleted_at TIMESTAMPTZ, deletion_reason TEXT,
 UNIQUE(id,user_id), UNIQUE(user_id,sha256),
 CHECK(expires_at>retained_at),
 CONSTRAINT artifact_content_complete CHECK(
  (state='retained' AND original_bytes IS NOT NULL AND octet_length(original_bytes)=byte_length
   AND encode(sha256(original_bytes),'hex')=sha256 AND deleted_at IS NULL AND deletion_reason IS NULL)
  OR (state='deleted' AND original_bytes IS NULL AND deleted_at IS NOT NULL
   AND deletion_reason IS NOT NULL AND length(btrim(deletion_reason)) BETWEEN 1 AND 500))
);
CREATE TABLE qwik_private.source_claims (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL,
 namespace_id UUID NOT NULL, source_set_id TEXT NOT NULL CHECK(length(source_set_id) BETWEEN 1 AND 255),
 artifact_id UUID NOT NULL, source_index INTEGER NOT NULL CHECK(source_index BETWEEN 0 AND 999),
 payload_sha256 TEXT NOT NULL CHECK(payload_sha256 ~ '^[a-f0-9]{64}$'),
 entity_kind TEXT NOT NULL DEFAULT 'workout' CHECK(entity_kind='workout'),
 entity_id UUID NOT NULL, canonical_revision INTEGER NOT NULL CHECK(canonical_revision>0),
 canonical_path TEXT[] NOT NULL CHECK(cardinality(canonical_path)=11),
 canonical_set_id TEXT,
 version INTEGER NOT NULL CHECK(version>0),
 UNIQUE(id,user_id),
 UNIQUE(user_id,namespace_id,source_set_id),
 UNIQUE(user_id,entity_id,canonical_path),
 FOREIGN KEY(namespace_id,user_id) REFERENCES qwik_private.namespaces(id,user_id) ON DELETE RESTRICT,
 FOREIGN KEY(artifact_id,user_id) REFERENCES qwik_private.artifacts(id,user_id) ON DELETE RESTRICT,
 FOREIGN KEY(user_id,entity_kind,entity_id,canonical_revision)
  REFERENCES public.activity_revisions(user_id,entity_kind,original_entity_id,revision) ON DELETE RESTRICT
);
CREATE TABLE qwik_private.claim_versions (
 claim_id UUID NOT NULL,user_id UUID NOT NULL,version INTEGER NOT NULL CHECK(version>0),
 artifact_id UUID NOT NULL,source_index INTEGER NOT NULL CHECK(source_index BETWEEN 0 AND 999),
 payload_sha256 TEXT NOT NULL CHECK(payload_sha256 ~ '^[a-f0-9]{64}$'),
 entity_kind TEXT NOT NULL DEFAULT 'workout' CHECK(entity_kind='workout'),
 entity_id UUID NOT NULL,canonical_revision INTEGER NOT NULL CHECK(canonical_revision>0),
 canonical_path TEXT[] NOT NULL,canonical_set_id TEXT,
 request_id UUID NOT NULL,correction_reason TEXT,linked_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(claim_id,version),
 FOREIGN KEY(claim_id,user_id) REFERENCES qwik_private.source_claims(id,user_id) ON DELETE RESTRICT,
 FOREIGN KEY(artifact_id,user_id) REFERENCES qwik_private.artifacts(id,user_id) ON DELETE RESTRICT,
 FOREIGN KEY(request_id,user_id) REFERENCES public.logging_requests(id,user_id) ON DELETE RESTRICT,
 FOREIGN KEY(user_id,entity_kind,entity_id,canonical_revision)
  REFERENCES public.activity_revisions(user_id,entity_kind,original_entity_id,revision) ON DELETE RESTRICT,
 CHECK((version=1 AND correction_reason IS NULL) OR
       (version>1 AND correction_reason IS NOT NULL AND length(btrim(correction_reason)) BETWEEN 1 AND 500))
);

-- Public request keys/responses are owner-controlled correlation, not proof
-- that a private operation committed. Only private executor functions write
-- these immutable attestations in the same transaction as bytes/claims/ledger.
CREATE TABLE qwik_private.commit_receipts (
 ledger_id UUID PRIMARY KEY, user_id UUID NOT NULL,
 operation TEXT NOT NULL CHECK(operation IN ('retain','delete')),
 request_key TEXT NOT NULL CHECK(length(request_key) BETWEEN 8 AND 150),
 fingerprint TEXT NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
 artifact_id UUID NOT NULL, response JSONB NOT NULL CHECK(jsonb_typeof(response)='object'),
 committed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(user_id,operation,request_key),
 FOREIGN KEY(ledger_id,user_id) REFERENCES public.logging_requests(id,user_id) ON DELETE RESTRICT,
 FOREIGN KEY(artifact_id,user_id) REFERENCES qwik_private.artifacts(id,user_id) ON DELETE RESTRICT,
 CHECK(response->>'userId' IS NOT DISTINCT FROM user_id::text),
 CHECK(response->>'artifactId' IS NOT DISTINCT FROM artifact_id::text),
 CHECK(response->>'kind' IS NOT DISTINCT FROM (CASE WHEN operation='retain' THEN 'qwik_private_retention' ELSE 'qwik_private_deletion' END)),
 CHECK(operation<>'retain' OR response->>'schemaVersion' IS NOT DISTINCT FROM '1')
);

DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['owner_policies','namespaces','artifacts','source_claims','claim_versions','commit_receipts'] LOOP
  EXECUTE format('ALTER TABLE qwik_private.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE qwik_private.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY owner ON qwik_private.%I TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid())',t);
 END LOOP;
END $$;

CREATE FUNCTION qwik_private.immutable_history() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 RAISE EXCEPTION 'Private source history is immutable' USING ERRCODE='55000';
END $$;
CREATE TRIGGER immutable_claim_versions BEFORE UPDATE OR DELETE ON qwik_private.claim_versions
 FOR EACH ROW EXECUTE FUNCTION qwik_private.immutable_history();
CREATE TRIGGER immutable_commit_receipts BEFORE UPDATE OR DELETE ON qwik_private.commit_receipts
 FOR EACH ROW EXECUTE FUNCTION qwik_private.immutable_history();
CREATE FUNCTION qwik_private.artifact_transition() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'Original history cannot be deleted' USING ERRCODE='55000'; END IF;
 IF TG_OP='UPDATE' AND OLD.state='retained' AND NEW.state='deleted'
  AND (to_jsonb(NEW)-ARRAY['state','original_bytes','deleted_at','deletion_reason'])
   IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','original_bytes','deleted_at','deletion_reason'])
  AND NEW.original_bytes IS NULL AND NEW.deleted_at IS NOT NULL
  AND NEW.deletion_reason IS NOT NULL AND length(btrim(NEW.deletion_reason)) BETWEEN 1 AND 500 THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Original bytes/metadata are immutable; explicit deletion only' USING ERRCODE='55000';
END $$;
CREATE TRIGGER immutable_original BEFORE UPDATE OR DELETE ON qwik_private.artifacts
 FOR EACH ROW EXECUTE FUNCTION qwik_private.artifact_transition();

-- Caller-role enforcement is independent of accidental future EXECUTE grants.
-- A direct untrusted SQL caller is NOT allowed to bypass the verified server's
-- source-to-projection join. No trusted role or owner policy is provisioned here.
CREATE FUNCTION qwik_private.require_executor(p_owner_id UUID) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u UUID:=auth.uid(); allowed_role NAME; invoking_role TEXT;
BEGIN
 IF u IS NULL OR u IS DISTINCT FROM p_owner_id THEN
  RAISE EXCEPTION 'Unavailable owner context' USING ERRCODE='42501';
 END IF;
 SELECT executor_role INTO allowed_role FROM qwik_private.owner_policies WHERE user_id=u;
 invoking_role:=coalesce(nullif(current_setting('role',true),'none'),session_user::text);
 IF allowed_role IS NULL OR invoking_role IS DISTINCT FROM allowed_role::text THEN
  RAISE EXCEPTION 'Trusted private executor required' USING ERRCODE='42501';
 END IF;
 RETURN u;
END $$;

CREATE FUNCTION qwik_private.persist_original(
 p_owner_id UUID,p_key TEXT,p_bytes BYTEA,p_sha256 TEXT,p_name TEXT,p_expires_at TIMESTAMPTZ,
 p_owner_quota_bytes BIGINT,p_namespace_id UUID DEFAULT NULL,p_entity_id UUID DEFAULT NULL,
 p_expected_revision INTEGER DEFAULT NULL,p_claims JSONB DEFAULT '[]') RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u UUID:=auth.uid(); n INTEGER; v_fingerprint TEXT; ledger JSONB; a qwik_private.artifacts;
 policy qwik_private.owner_policies; ns qwik_private.namespaces; prior JSONB; snap JSONB;
 source_text TEXT; source_json JSON; item JSONB; raw_set JSON; raw_payload TEXT; raw_id TEXT;
 source_hash TEXT; rec JSONB; canonical_set JSONB; cp TEXT[]; existing qwik_private.source_claims;
 claim_id UUID; claim_version INTEGER; expected_version INTEGER; links JSONB:='[]';
 response JSONB; used_bytes BIGINT; k TEXT;
BEGIN
 u:=qwik_private.require_executor(p_owner_id);
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 8 AND 150 OR p_bytes IS NULL OR p_sha256 IS NULL
  OR p_name IS NULL OR length(p_name) NOT BETWEEN 1 AND 255 OR p_claims IS NULL
  OR jsonb_typeof(p_claims) IS DISTINCT FROM 'array' OR jsonb_array_length(p_claims)>20 THEN
  RAISE EXCEPTION 'Invalid private retention request' USING ERRCODE='22023'; END IF;
 n:=octet_length(p_bytes);
 IF n NOT BETWEEN 2 AND 5000000 OR p_sha256 !~ '^[a-f0-9]{64}$'
  OR encode(sha256(p_bytes),'hex') IS DISTINCT FROM p_sha256 THEN
  RAISE EXCEPTION 'Original byte integrity mismatch' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('capture-owner:'||u::text,0));
 v_fingerprint:=encode(sha256(convert_to(jsonb_build_object('sha',p_sha256,'length',n,'name',p_name,'expiryEpoch',extract(epoch FROM p_expires_at),
  'quota',p_owner_quota_bytes,'namespace',p_namespace_id,'entity',p_entity_id,'revision',p_expected_revision,'claims',p_claims)::text,'UTF8')),'hex');
 ledger:=public.begin_logging_request('qwik-private:retain:'||p_key,v_fingerprint);
 SELECT to_jsonb(q) INTO STRICT ledger FROM public.logging_requests q
  WHERE q.id=(ledger->>'id')::uuid AND q.user_id=u FOR UPDATE;
 IF ledger->>'status'='complete' THEN
  SELECT c.response INTO prior FROM qwik_private.commit_receipts c
   WHERE c.user_id=u AND c.operation='retain' AND c.request_key=p_key
    AND c.ledger_id=(ledger->>'id')::uuid AND c.fingerprint=v_fingerprint
    AND c.response IS NOT DISTINCT FROM ledger->'response';
  IF NOT FOUND THEN RAISE EXCEPTION 'Private commit provenance unavailable' USING ERRCODE='55000'; END IF;
  RETURN prior;
 END IF;
 SELECT * INTO policy FROM qwik_private.owner_policies WHERE user_id=u;
 IF NOT FOUND THEN RAISE EXCEPTION 'Private retention policy unavailable' USING ERRCODE='42501'; END IF;
 IF p_owner_quota_bytes IS NULL OR p_owner_quota_bytes<1 OR p_expires_at IS NULL OR NOT isfinite(p_expires_at)
  OR p_expires_at<=clock_timestamp() OR p_expires_at>clock_timestamp()+make_interval(secs=>policy.max_retention_seconds::double precision) THEN
  RAISE EXCEPTION 'Explicit finite retention/quota required' USING ERRCODE='22023'; END IF;
 SELECT * INTO a FROM qwik_private.artifacts WHERE user_id=u AND sha256=p_sha256 FOR UPDATE;
 IF FOUND THEN
  IF a.state<>'retained' OR a.expires_at<=clock_timestamp() OR a.expires_at IS DISTINCT FROM p_expires_at THEN
   RAISE EXCEPTION 'Original is unavailable or retention differs; no implicit renewal' USING ERRCODE='55000'; END IF;
  IF a.byte_length<>n OR a.original_bytes IS DISTINCT FROM p_bytes THEN RAISE EXCEPTION 'Original byte conflict' USING ERRCODE='22023'; END IF;
 ELSE
  SELECT coalesce(sum(octet_length(original_bytes)),0) INTO used_bytes FROM qwik_private.artifacts WHERE user_id=u;
  IF used_bytes+n>least(policy.byte_quota,p_owner_quota_bytes) THEN RAISE EXCEPTION 'Private retention quota exceeded' USING ERRCODE='54000'; END IF;
  INSERT INTO qwik_private.artifacts(user_id,sha256,byte_length,original_bytes,name,expires_at)
   VALUES(u,p_sha256,n,p_bytes,p_name,p_expires_at) RETURNING * INTO a;
 END IF;
 IF jsonb_array_length(p_claims)=0 THEN
  IF p_namespace_id IS NOT NULL OR p_entity_id IS NOT NULL OR p_expected_revision IS NOT NULL THEN
   RAISE EXCEPTION 'Unclaimed original must not imply a partial canonical binding' USING ERRCODE='22023'; END IF;
 ELSE
  IF p_namespace_id IS NULL OR p_entity_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1 THEN
   RAISE EXCEPTION 'Complete explicit binding required' USING ERRCODE='22023'; END IF;
  SELECT * INTO ns FROM qwik_private.namespaces WHERE id=p_namespace_id AND user_id=u;
  IF NOT FOUND OR ns.state<>'confirmed' OR ns.basis<>'owner_attested_source_account_device' THEN
   RAISE EXCEPTION 'Source namespace unavailable' USING ERRCODE='42501'; END IF;
  SELECT to_jsonb(w) INTO prior FROM public.workouts w WHERE w.id=p_entity_id AND w.user_id=u FOR UPDATE;
  IF prior IS NULL THEN RAISE EXCEPTION 'Canonical binding unavailable' USING ERRCODE='42501'; END IF;
  IF (prior->>'capture_revision')::integer<>p_expected_revision THEN RAISE EXCEPTION 'Canonical revision changed' USING ERRCODE='40001'; END IF;
  SELECT record INTO snap FROM public.activity_revisions WHERE user_id=u AND entity_kind='workout'
   AND original_entity_id=p_entity_id AND revision=p_expected_revision AND NOT deleted;
  IF snap IS NULL OR snap->'blocks' IS DISTINCT FROM prior->'blocks' THEN RAISE EXCEPTION 'Immutable canonical binding unavailable' USING ERRCODE='55000'; END IF;
  source_text:=convert_from(p_bytes,'UTF8');
  IF left(source_text,1)=chr(65279) THEN source_text:=substr(source_text,2); END IF;
  IF NOT (source_text IS JSON ARRAY WITH UNIQUE KEYS) THEN RAISE EXCEPTION 'Unsupported source JSON/duplicate keys' USING ERRCODE='22023'; END IF;
  source_json:=source_text::json;
  IF json_array_length(source_json) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Unsupported source array' USING ERRCODE='22023'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_claims) LOOP
   IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR NOT (item ?& ARRAY['sourceSetId','sourceIndex','blockIndex','segmentIndex','eventIndex','collection','setIndex','expectedSetId','expectedClaimVersion','recording']) THEN
    RAISE EXCEPTION 'Malformed source selection' USING ERRCODE='22023'; END IF;
   FOR k IN SELECT jsonb_object_keys(item) LOOP
    IF k<>ALL(ARRAY['sourceSetId','sourceIndex','blockIndex','segmentIndex','eventIndex','collection','setIndex','expectedSetId','expectedClaimVersion','correctionReason','recording']) THEN RAISE EXCEPTION 'Unknown source selection field' USING ERRCODE='22023'; END IF;
   END LOOP;
   FOREACH k IN ARRAY ARRAY['sourceIndex','blockIndex','segmentIndex','eventIndex','setIndex'] LOOP
    IF jsonb_typeof(item->k) IS DISTINCT FROM 'number' OR (item->>k) !~ '^[0-9]{1,3}$' THEN RAISE EXCEPTION 'Invalid positional source selection' USING ERRCODE='22023'; END IF;
   END LOOP;
   IF (item->>'blockIndex')::integer>29 OR item->>'collection' NOT IN ('sets','set_details')
    OR jsonb_typeof(item->'sourceSetId') IS DISTINCT FROM 'string' OR length(item->>'sourceSetId') NOT BETWEEN 1 AND 255
    OR jsonb_typeof(item->'expectedSetId') NOT IN ('string','null') THEN RAISE EXCEPTION 'Invalid source/canonical identity' USING ERRCODE='22023'; END IF;
   cp:=ARRAY['blocks',item->>'blockIndex','segments',item->>'segmentIndex','events',item->>'eventIndex','performed',item->>'collection',item->>'setIndex','velocity','recording'];
   canonical_set:=snap #> cp[1:9]; rec:=snap #> cp;
   IF rec IS NULL OR rec IS DISTINCT FROM item->'recording' OR rec->>'schemaVersion' IS DISTINCT FROM '1'
    OR rec#>>'{source,system}' IS DISTINCT FROM 'qwik_vbt'
    OR rec#>>'{source,file,retention}' IS DISTINCT FROM 'user_retained_not_uploaded'
    OR rec#>>'{source,file,sha256}' IS DISTINCT FROM p_sha256
    OR rec#>>'{source,file,byteLength}' IS DISTINCT FROM n::text
    OR rec#>>'{source,setIndex}' IS DISTINCT FROM item->>'sourceIndex'
    OR rec#>>'{set,id}' IS DISTINCT FROM item->>'sourceSetId'
    OR canonical_set->>'id' IS DISTINCT FROM item->>'expectedSetId' THEN
    RAISE EXCEPTION 'Canonical source/path binding mismatch' USING ERRCODE='22023'; END IF;
   SELECT value INTO raw_set FROM json_array_elements(source_json) WITH ORDINALITY x(value,ordinality)
    WHERE ordinality=(item->>'sourceIndex')::integer+1;
   IF raw_set IS NULL OR json_typeof(raw_set) IS DISTINCT FROM 'object' OR raw_set->>'id' IS DISTINCT FROM item->>'sourceSetId'
    OR (SELECT count(*) FROM json_array_elements(source_json) x(value) WHERE x.value->>'id'=item->>'sourceSetId')<>1 THEN
    RAISE EXCEPTION 'Source set selection absent or ambiguous' USING ERRCODE='22023'; END IF;
   raw_payload:=raw_set::text; source_hash:=encode(sha256(convert_to(raw_payload,'UTF8')),'hex');
   SELECT * INTO existing FROM qwik_private.source_claims WHERE user_id=u AND namespace_id=p_namespace_id AND source_set_id=item->>'sourceSetId' FOR UPDATE;
   IF FOUND THEN
    IF existing.entity_id<>p_entity_id OR existing.canonical_path IS DISTINCT FROM cp OR existing.canonical_set_id IS DISTINCT FROM item->>'expectedSetId' THEN
     RAISE EXCEPTION 'Source identity already reserved; explicit reconciliation required' USING ERRCODE='23505'; END IF;
    IF jsonb_typeof(item->'expectedClaimVersion') IS DISTINCT FROM 'number' OR (item->>'expectedClaimVersion') !~ '^[1-9][0-9]{0,8}$'
     OR (item->>'expectedClaimVersion')::integer<>existing.version OR jsonb_typeof(item->'correctionReason') IS DISTINCT FROM 'string'
     OR length(btrim(item->>'correctionReason')) NOT BETWEEN 1 AND 500 THEN
     RAISE EXCEPTION 'Explicit prior version and correction reason required' USING ERRCODE='40001'; END IF;
    IF existing.payload_sha256=source_hash AND existing.canonical_revision=p_expected_revision AND existing.artifact_id=a.id THEN
     RAISE EXCEPTION 'Source already linked; recover its original request' USING ERRCODE='23505'; END IF;
    claim_id:=existing.id; claim_version:=existing.version+1;
    UPDATE qwik_private.source_claims SET artifact_id=a.id,source_index=(item->>'sourceIndex')::integer,
     payload_sha256=source_hash,canonical_revision=p_expected_revision,version=claim_version WHERE id=claim_id AND user_id=u;
   ELSE
    IF item->'expectedClaimVersion' IS DISTINCT FROM 'null'::jsonb OR item ? 'correctionReason' THEN
     RAISE EXCEPTION 'Expected source claim is absent' USING ERRCODE='40001'; END IF;
    claim_version:=1;
    INSERT INTO qwik_private.source_claims(user_id,namespace_id,source_set_id,artifact_id,source_index,payload_sha256,entity_id,canonical_revision,canonical_path,canonical_set_id,version)
     VALUES(u,p_namespace_id,item->>'sourceSetId',a.id,(item->>'sourceIndex')::integer,source_hash,p_entity_id,p_expected_revision,cp,item->>'expectedSetId',claim_version) RETURNING id INTO claim_id;
   END IF;
   INSERT INTO qwik_private.claim_versions(claim_id,user_id,version,artifact_id,source_index,payload_sha256,entity_id,canonical_revision,canonical_path,canonical_set_id,request_id,correction_reason)
    VALUES(claim_id,u,claim_version,a.id,(item->>'sourceIndex')::integer,source_hash,p_entity_id,p_expected_revision,cp,item->>'expectedSetId',(ledger->>'id')::uuid,item->>'correctionReason');
   links:=links||jsonb_build_array(jsonb_build_object('claimId',claim_id,'sourceSetId',item->>'sourceSetId','version',claim_version,'payloadSha256',source_hash,
    'entityId',p_entity_id,'canonicalRevision',p_expected_revision,'canonicalPath',cp));
  END LOOP;
 END IF;
 response:=jsonb_build_object('kind','qwik_private_retention','schemaVersion',1,'artifactId',a.id,'userId',u,'sha256',a.sha256,
  'byteLength',a.byte_length,'expiresAt',a.expires_at,'retainedAt',a.retained_at,'storage','private_postgres_bytea',
  'artifactStateAtCommit','retained','canonicalRevision',p_expected_revision,'claims',links);
 response:=public.finish_logging_request((ledger->>'id')::uuid,response,200);
 INSERT INTO qwik_private.commit_receipts(ledger_id,user_id,operation,request_key,fingerprint,artifact_id,response)
  VALUES((ledger->>'id')::uuid,u,'retain',p_key,v_fingerprint,a.id,response);
 RETURN response;
END $$;

CREATE FUNCTION qwik_private.read_original(p_owner_id UUID,p_id UUID) RETURNS TABLE(metadata JSONB,bytes BYTEA)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u UUID:=auth.uid(); a qwik_private.artifacts; s TEXT;
BEGIN
 u:=qwik_private.require_executor(p_owner_id);
 SELECT * INTO a FROM qwik_private.artifacts WHERE id=p_id AND user_id=u;
 IF NOT FOUND THEN RETURN; END IF;
 s:=CASE WHEN a.state='deleted' THEN 'deleted' WHEN a.expires_at<=clock_timestamp() THEN 'expired'
  WHEN a.original_bytes IS NULL OR octet_length(a.original_bytes)<>a.byte_length OR encode(sha256(a.original_bytes),'hex') IS DISTINCT FROM a.sha256 THEN 'corrupt' ELSE 'available' END;
 RETURN QUERY SELECT jsonb_build_object('artifactId',a.id,'userId',u,'sha256',a.sha256,'byteLength',a.byte_length,'name',a.name,
  'path',u::text||'/'||a.id::text||'/'||a.sha256||'.qwik','expiresAt',a.expires_at,'retainedAt',a.retained_at,'state',s),
  CASE WHEN s='available' THEN a.original_bytes ELSE NULL::bytea END;
END $$;

CREATE FUNCTION qwik_private.delete_original(p_owner_id UUID,p_key TEXT,p_id UUID,p_reason TEXT,p_explicit_consent BOOLEAN) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u UUID:=auth.uid(); ledger JSONB; a qwik_private.artifacts; v_fingerprint TEXT; response JSONB; prior JSONB;
BEGIN
 u:=qwik_private.require_executor(p_owner_id);
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 8 AND 150 OR p_explicit_consent IS DISTINCT FROM true
  OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Explicit deletion consent/reason required' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('capture-owner:'||u::text,0));
 v_fingerprint:=encode(sha256(convert_to(jsonb_build_object('id',p_id,'reason',p_reason,'consent',p_explicit_consent)::text,'UTF8')),'hex');
 ledger:=public.begin_logging_request('qwik-private:delete:'||p_key,v_fingerprint);
 SELECT to_jsonb(q) INTO STRICT ledger FROM public.logging_requests q
  WHERE q.id=(ledger->>'id')::uuid AND q.user_id=u FOR UPDATE;
 IF ledger->>'status'='complete' THEN
  SELECT c.response INTO prior FROM qwik_private.commit_receipts c
   WHERE c.user_id=u AND c.operation='delete' AND c.request_key=p_key
    AND c.ledger_id=(ledger->>'id')::uuid AND c.fingerprint=v_fingerprint
    AND c.response IS NOT DISTINCT FROM ledger->'response';
  IF NOT FOUND THEN RAISE EXCEPTION 'Private commit provenance unavailable' USING ERRCODE='55000'; END IF;
  RETURN prior;
 END IF;
 SELECT * INTO a FROM qwik_private.artifacts WHERE id=p_id AND user_id=u FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Original unavailable' USING ERRCODE='42501'; END IF;
 IF a.state='retained' THEN
  UPDATE qwik_private.artifacts SET state='deleted',original_bytes=NULL,deleted_at=clock_timestamp(),deletion_reason=p_reason WHERE id=a.id AND user_id=u RETURNING * INTO a;
 END IF;
 response:=jsonb_build_object('kind','qwik_private_deletion','artifactId',a.id,'userId',u,'state','deleted','deletedAt',a.deleted_at,'physicalErasureAsserted',false);
 response:=public.finish_logging_request((ledger->>'id')::uuid,response,200);
 INSERT INTO qwik_private.commit_receipts(ledger_id,user_id,operation,request_key,fingerprint,artifact_id,response)
  VALUES((ledger->>'id')::uuid,u,'delete',p_key,v_fingerprint,a.id,response);
 RETURN response;
END $$;

CREATE FUNCTION qwik_private.read_claims(p_owner_id UUID) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u UUID:=auth.uid(); result JSONB;
BEGIN
 u:=qwik_private.require_executor(p_owner_id);
 SELECT coalesce(jsonb_agg(jsonb_build_object('claimId',c.id,'namespaceId',c.namespace_id,'sourceSetId',c.source_set_id,
  'artifactId',c.artifact_id,'version',c.version,'payloadSha256',c.payload_sha256,'entityId',c.entity_id,'canonicalRevision',c.canonical_revision,
  'canonicalPath',c.canonical_path,'canonicalState',CASE WHEN w.capture_revision=c.canonical_revision THEN 'current' ELSE 'stale_or_deleted' END,
  'artifactState',CASE WHEN a.state='deleted' THEN 'deleted' WHEN a.expires_at<=clock_timestamp() THEN 'expired' ELSE 'retained' END)
  ORDER BY c.id),'[]') INTO result
 FROM qwik_private.source_claims c JOIN qwik_private.artifacts a ON a.id=c.artifact_id AND a.user_id=c.user_id
 LEFT JOIN public.workouts w ON w.id=c.entity_id AND w.user_id=c.user_id WHERE c.user_id=u;
 RETURN result;
END $$;

CREATE FUNCTION qwik_private.read_receipt(p_owner_id UUID,p_key TEXT,p_operation TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u UUID:=auth.uid(); response JSONB;
BEGIN
 u:=qwik_private.require_executor(p_owner_id);
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 8 AND 150 OR p_operation IS NULL OR p_operation NOT IN ('retain','delete') THEN
  RAISE EXCEPTION 'Invalid recovery identity' USING ERRCODE='22023'; END IF;
 SELECT c.response INTO response FROM qwik_private.commit_receipts c
  JOIN public.logging_requests q ON q.id=c.ledger_id AND q.user_id=c.user_id
   AND q.request_key='qwik-private:'||c.operation||':'||c.request_key
   AND q.status='complete' AND q.fingerprint=c.fingerprint
   AND q.response IS NOT DISTINCT FROM c.response
  WHERE c.user_id=u AND c.operation=p_operation AND c.request_key=p_key;
 RETURN response;
END $$;

-- Additive protection; preserve old CHECK and pre-existing historical rows.
ALTER TABLE public.measurement_imports ADD CONSTRAINT measurement_imports_raw_artifact_complete_v2 CHECK(
 (raw_artifact_bucket IS NULL AND raw_artifact_path IS NULL AND raw_artifact_retention_class IS NULL AND raw_artifact_expires_at IS NULL)
 OR (raw_artifact_bucket IS NOT NULL AND raw_artifact_path IS NOT NULL AND raw_artifact_retention_class IS NOT NULL AND raw_artifact_expires_at IS NOT NULL
  AND length(btrim(raw_artifact_bucket)) BETWEEN 1 AND 100 AND raw_artifact_path LIKE user_id::text||'/%'
  AND length(btrim(raw_artifact_retention_class)) BETWEEN 1 AND 80 AND raw_artifact_expires_at>created_at)) NOT VALID;

REVOKE ALL ON ALL TABLES IN SCHEMA qwik_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA qwik_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SCHEMA qwik_private FROM PUBLIC,anon,authenticated;
COMMENT ON SCHEMA qwik_private IS 'UNAPPLIED PREPARATION. No live grants/routes. Later private-copy events on already saved canonical revisions; no canonical mutation or observation promotion.';
COMMIT;
