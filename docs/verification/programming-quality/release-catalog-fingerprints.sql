-- Canonical metadata-only query. Run identical text locally and in dashboard.
-- Comparison format v1: remove CR from definition text, retain all other text.
-- Exclude PG18 catalog-only NOT NULL constraints; columns retain attnotnull.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '3s';
WITH targets(name) AS (VALUES
 ('adaptation_proposals'),('coach_checkins'),('coach_memories'),('coach_review_source_invalidations'),
 ('coach_strength_assessments'),('coach_weekly_review_observations'),('coach_weekly_reviews'),
 ('measurement_imports'),('performance_observation_groups'),('performance_observation_values'),
 ('prescribed_sessions'),('training_plan_versions'),('training_programs'),('workouts')
), relations AS (
 SELECT t.name,c.oid,c.relrowsecurity,c.relforcerowsecurity
 FROM targets t LEFT JOIN pg_namespace n ON n.nspname='public'
 LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=t.name AND c.relkind IN ('r','p')
), categories(category) AS (VALUES ('policies'),('triggers'),('constraints'),('indexes'),('columns')),
metadata AS (
 SELECT r.name,'policies'::text AS category,p.policyname::text AS identity,
  jsonb_build_array(p.policyname,p.permissive,
   (SELECT jsonb_agg(v::text ORDER BY v::text) FROM unnest(p.roles) v),p.cmd,
   replace(p.qual,chr(13),''),replace(p.with_check,chr(13),'')) AS payload
 FROM relations r JOIN pg_policies p ON p.schemaname='public' AND p.tablename=r.name
 UNION ALL
 SELECT r.name,'triggers',t.tgname::text,
  jsonb_build_array(t.tgname,t.tgenabled,t.tgdeferrable,t.tginitdeferred,replace(pg_get_triggerdef(t.oid),chr(13),''))
 FROM relations r JOIN pg_trigger t ON t.tgrelid=r.oid AND NOT t.tgisinternal
 UNION ALL
 SELECT r.name,'constraints',k.conname::text,
  jsonb_build_array(k.conname,k.contype,k.convalidated,k.condeferrable,k.condeferred,replace(pg_get_constraintdef(k.oid),chr(13),''))
 FROM relations r JOIN pg_constraint k ON k.conrelid=r.oid AND k.contype <> 'n'
 UNION ALL
 SELECT r.name,'indexes',i.relname::text,
  jsonb_build_array(i.relname,x.indisvalid,x.indisready,replace(pg_get_indexdef(i.oid),chr(13),''))
 FROM relations r JOIN pg_index x ON x.indrelid=r.oid JOIN pg_class i ON i.oid=x.indexrelid
 UNION ALL
 SELECT r.name,'columns',lpad(a.attnum::text,5,'0')||':'||a.attname,
  jsonb_build_array(a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,
   replace(pg_get_expr(d.adbin,d.adrelid),chr(13),''))
 FROM relations r JOIN pg_attribute a ON a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped
 LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
), groups AS (
 SELECT r.name,c.category,count(m.identity)::integer AS rows,
  md5(coalesce(jsonb_agg(m.payload ORDER BY m.identity COLLATE "C") FILTER (WHERE m.identity IS NOT NULL),'[]'::jsonb)::text) AS md5
 FROM relations r CROSS JOIN categories c LEFT JOIN metadata m ON m.name=r.name AND m.category=c.category
 GROUP BY r.name,c.category
), functions AS (
 SELECT p.proname::text AS name,pg_get_function_identity_arguments(p.oid) AS args,
  md5(replace(pg_get_functiondef(p.oid),chr(13),'')) AS md5
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prokind='f'
)
SELECT jsonb_build_object(
 'format','release-catalog-comparison-1',
 'normalization','Remove CR only; exclude contype=n; preserve column NOT NULL; C-sort metadata identities',
 'functions',coalesce((SELECT jsonb_agg(jsonb_build_array(name,args,md5) ORDER BY name COLLATE "C",args COLLATE "C") FROM functions),'[]'::jsonb),
 'relations',(SELECT jsonb_agg(jsonb_build_array(name,oid IS NOT NULL,relrowsecurity,relforcerowsecurity) ORDER BY name COLLATE "C") FROM relations),
 'groups',(SELECT jsonb_agg(jsonb_build_array(name,category,rows,md5) ORDER BY name COLLATE "C",category COLLATE "C") FROM groups)
) AS release_catalog_comparison;
ROLLBACK;
