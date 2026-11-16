CREATE FUNCTION qwik_private.require_executor(p_owner_id UUID) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u UUID:=auth.uid(); allowed_role NAME; invoking_role TEXT; caller RECORD; definer_oid OID;
BEGIN
 IF u IS NULL OR u IS DISTINCT FROM p_owner_id THEN
  RAISE EXCEPTION 'Unavailable owner context' USING ERRCODE='42501';
 END IF;
 SELECT executor_role INTO allowed_role FROM qwik_private.owner_policies WHERE user_id=u;
 invoking_role:=coalesce(nullif(current_setting('role',true),'none'),session_user::text);
 SELECT oid,rolsuper,rolbypassrls INTO caller FROM pg_catalog.pg_roles WHERE rolname=allowed_role;
 definer_oid:=current_user::regrole::oid;
 IF allowed_role IS NULL OR NOT FOUND OR invoking_role IS DISTINCT FROM allowed_role::text
  OR caller.rolsuper OR caller.rolbypassrls
  OR pg_catalog.pg_has_role(caller.oid,definer_oid,'MEMBER')
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles e WHERE e.rolname IN ('anon','authenticated','authenticator','service_role')
   AND (pg_catalog.pg_has_role(caller.oid,e.oid,'MEMBER') OR pg_catalog.pg_has_role(e.oid,caller.oid,'MEMBER')
    OR pg_catalog.pg_has_role(e.oid,definer_oid,'MEMBER'))) THEN
  RAISE EXCEPTION 'Trusted private executor required' USING ERRCODE='42501';
 END IF;
 RETURN u;
END $$;