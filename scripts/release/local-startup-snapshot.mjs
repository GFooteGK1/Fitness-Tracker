// Read-only evidence for the fixed synthetic database. Emits counts/digests only.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const podman = fileURLToPath(new URL('../../output/app-quality-release/tools/podman-5.8.3/podman-5.8.3/usr/bin/podman.exe', import.meta.url));
const project = 'sociusfit-programming-local';
const container = `supabase_db_${project}`;
const pod = args => execFileSync(podman, ['--connection', 'sociusfit-local', ...args], { encoding: 'utf8', timeout: 30000 });
const inspected = JSON.parse(pod(['inspect', container]))[0];
assert.equal(inspected.Config.Labels['com.supabase.cli.project'], project);
const sql = query => pod(['exec', container, 'psql', '-X', '-q', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-c', query]).trim();
const tables = JSON.parse(sql(`SELECT json_agg(json_build_object('schema',n.nspname,'table',c.relname) ORDER BY n.nspname,c.relname)
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind='r' AND (n.nspname='public' OR (n.nspname='auth' AND c.relname='users'));`));
assert.ok(tables.length > 1 && tables.some(t => t.schema === 'auth' && t.table === 'users'));
const ident = value => '"' + value.replaceAll('"', '""') + '"';
const literal = value => "'" + value.replaceAll("'", "''") + "'";
const scopes = JSON.parse(sql(`BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
  SELECT json_agg(s ORDER BY s.relation) FROM (${tables.map(t => `SELECT ${literal(t.schema + '.' + t.table)} AS relation,
    count(*) AS rows, md5(coalesce(string_agg(to_jsonb(r)::text, E'\\n' ORDER BY to_jsonb(r)::text),'')) AS digest
    FROM ${ident(t.schema)}.${ident(t.table)} r`).join(' UNION ALL ')}) s;
  COMMIT;`));
const containers = pod(['ps', '-a', '--filter', `label=com.supabase.cli.project=${project}`, '--format', '{{.ID}} {{.Names}}'])
  .trim().split(/\r?\n/).sort();
assert.equal(containers.length, 9);
console.log(JSON.stringify({ project, containers, scopes }, null, 2));
