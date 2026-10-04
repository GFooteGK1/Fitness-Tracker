/** Prepare the new migration from the inspected authoritative prior definitions. No database calls. */
import { readFileSync, writeFileSync } from 'node:fs'
const root = new URL('../../supabase/migrations/', import.meta.url)
const read = name => readFileSync(new URL(name, root), 'utf8')
function once(text, from, to) {
  if (text.split(from).length !== 2) throw new Error(`Expected one source anchor: ${from}`)
  return text.replace(from, to)
}
const reports = read('20260928010000_reviewed_session_set_reports.sql')
let validator = reports.slice(reports.indexOf('CREATE FUNCTION public.valid_reviewed_set_report('), reports.indexOf('CREATE TABLE public.coach_reviewed_set_reports'))
validator = once(validator, 'CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION')
validator = once(validator, "OR (SELECT count(*) FROM jsonb_object_keys(r))<>17\n    OR r->'schemaVersion' IS DISTINCT FROM '1'::jsonb".replaceAll('\n', reports.includes('\r\n') ? '\r\n' : '\n'),
  "OR (SELECT count(*) FROM jsonb_object_keys(r))<>CASE WHEN r->'schemaVersion'='2'::jsonb THEN 18 ELSE 17 END\n    OR coalesce(r->'schemaVersion','null'::jsonb) NOT IN ('1'::jsonb,'2'::jsonb)\n    OR (r->'schemaVersion'='1'::jsonb AND r ? 'rir')\n    OR (r->'schemaVersion'='2'::jsonb AND (NOT (r ? 'rir') OR (r->'rir'<>'null'::jsonb AND NOT public.reviewed_report_number(r->'rir',1000))))")
validator = once(validator, "<>CASE WHEN r->'schemaVersion'='2'::jsonb THEN 18 ELSE 17 END", "<>(CASE WHEN r->'schemaVersion'='2'::jsonb THEN 18 ELSE 17 END)")
validator = once(validator, "  RETURN true;", "  IF r->>'status'='not_performed' AND r->'schemaVersion'='2'::jsonb AND r->'rir'<>'null'::jsonb THEN RETURN false; END IF;\n  RETURN true;")
const slots = read('20260928040000_reviewed_execution_slots.sql')
const begin = slots.indexOf('CREATE OR REPLACE FUNCTION public.complete_reviewed_session(')
const end = slots.indexOf('END $$;', begin) + 'END $$;'.length
if (begin < 0 || end < begin) throw new Error('Completion source missing')
let completion = slots.slice(begin, end)
completion = once(completion, "r#>>'{activity_snapshot,work,kind}'='repetitions'", "r#>>'{activity_snapshot,work,kind}' IN ('repetitions','effort_repetitions')")
completion = once(completion, "'effort',r#>'{report,rpe}',", "'effort',r#>'{report,rpe}','rir',r#>'{report,rir}',")
let constraint = read('20260928090000_reviewed_qualitative_recovery.sql')
constraint = constraint.slice(constraint.indexOf('ALTER TABLE'), constraint.lastIndexOf('COMMIT;'))
constraint = once(constraint, "('1'::jsonb, '2'::jsonb)", "('1'::jsonb, '2'::jsonb, '3'::jsonb)")
const output = `-- Prepared schema3 prescriptions and schema2 independent RIR reports. No historical data rewrite.\n-- Full source definitions preserve ownership, replay, active-slot and request-resolution guards.\nBEGIN;\n${constraint}\n${validator}\n${completion}\nREVOKE ALL ON FUNCTION public.complete_reviewed_session(uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;\nGRANT EXECUTE ON FUNCTION public.complete_reviewed_session(uuid,text,jsonb) TO authenticated;\nALTER FUNCTION public.complete_reviewed_session(uuid,text,jsonb) SET lock_timeout='1s';\nCOMMIT;\n`
writeFileSync(new URL('20260929010000_reviewed_effort_rir.sql', root), output)
