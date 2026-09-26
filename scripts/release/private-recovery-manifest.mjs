// Shared source/restore canonical manifest queries. Contains no credentials or data.
import { Transform } from 'node:stream';
import { createHash } from 'node:crypto';
import { RECOVERY_TRANSACTION_SQL } from './private-recovery-preflight.mjs';

export const CANONICAL_FORMAT = 'pg17-jsonb-row-sha256-v1';
export const RECOVERY_CANONICAL_SETTINGS = `SET LOCAL timezone='UTC'; SET LOCAL datestyle='ISO, YMD'; SET LOCAL intervalstyle='iso_8601'; SET LOCAL bytea_output='hex'; SET LOCAL extra_float_digits=3; SET LOCAL search_path=pg_catalog;`;
// SQL LIKE treats underscore as any character: pg_% would hide pgbouncer and
// pgsodium. Only the literal reserved pg_ prefix identifies built-in objects.
const nonSystem = alias => `left(${alias}.nspname,3) <> 'pg_' AND ${alias}.nspname <> 'information_schema'`;
const acl = expression => `(SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY pg_get_userbyid(a.grantor),a.grantee=0,pg_get_userbyid(a.grantee),a.privilege_type,a.is_grantable) FROM aclexplode(${expression}) a)`;
export const RECOVERY_CATALOG_SQL = `SELECT jsonb_build_object(
'bootstrapRole',(SELECT rolname FROM pg_roles WHERE oid=10),
'roles',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',rolname,'super',rolsuper,'inherit',rolinherit,'createRole',rolcreaterole,'createDb',rolcreatedb,'login',rolcanlogin,'replication',rolreplication,'bypassRls',rolbypassrls,'connectionLimit',rolconnlimit,'config',rolconfig) ORDER BY rolname),'[]') FROM pg_roles WHERE left(rolname,3) <> 'pg_'),
'memberships',(SELECT coalesce(jsonb_agg(jsonb_build_object('role',pg_get_userbyid(roleid),'member',pg_get_userbyid(member),'grantor',pg_get_userbyid(grantor),'adminOption',admin_option,'inheritOption',inherit_option,'setOption',set_option) ORDER BY pg_get_userbyid(roleid),pg_get_userbyid(member),pg_get_userbyid(grantor)),'[]') FROM pg_auth_members),
'schemas',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',n.nspname,'owner',pg_get_userbyid(n.nspowner),'aclNull',n.nspacl IS NULL,'acl',${acl('n.nspacl')}) ORDER BY n.nspname),'[]') FROM pg_namespace n WHERE ${nonSystem('n')}),
'extensions',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',e.extname,'version',e.extversion,'schema',n.nspname,'owner',pg_get_userbyid(e.extowner),'relocatable',e.extrelocatable,'config',coalesce((SELECT jsonb_agg(jsonb_build_object('schema',cn.nspname,'table',c.relname,'predicate',e.extcondition[x.i]) ORDER BY x.i) FROM generate_subscripts(e.extconfig,1) x(i) JOIN pg_class c ON c.oid=e.extconfig[x.i] JOIN pg_namespace cn ON cn.oid=c.relnamespace),'[]')) ORDER BY e.extname),'[]') FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace),
'relations',(SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'persistence',c.relpersistence,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'isPartition',c.relispartition,'partitionBound',pg_get_expr(c.relpartbound,c.oid),'partitionKey',CASE WHEN c.relkind='p' THEN pg_get_partkeydef(c.oid) ELSE NULL END,'replicaIdentity',c.relreplident,'aclNull',c.relacl IS NULL,'acl',${acl('c.relacl')},'options',c.reloptions,'extension',(SELECT e.extname FROM pg_depend d JOIN pg_extension e ON e.oid=d.refobjid WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.refclassid='pg_extension'::regclass AND d.deptype='e'),'viewDefinition',CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid,false) ELSE NULL END) ORDER BY n.nspname,c.relname),'[]') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${nonSystem('n')} AND c.relkind IN ('r','p','v','m','f','S')),
'columns',(SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'position',a.attnum,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid),'collation',CASE WHEN a.attcollation=0 THEN NULL ELSE a.attcollation::regcollation::text END,'aclNull',a.attacl IS NULL,'acl',${acl('a.attacl')}) ORDER BY n.nspname,c.relname,a.attnum),'[]') FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE ${nonSystem('n')} AND c.relkind IN ('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped),
'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'name',k.conname,'kind',k.contype,'definition',pg_get_constraintdef(k.oid,false),'validated',k.convalidated,'deferrable',k.condeferrable,'initiallyDeferred',k.condeferred) ORDER BY n.nspname,c.relname,k.conname),'[]') FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${nonSystem('n')}),
'indexes',(SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'name',ci.relname,'definition',pg_get_indexdef(i.indexrelid),'valid',i.indisvalid,'ready',i.indisready,'replicaIdentity',i.indisreplident) ORDER BY n.nspname,c.relname,ci.relname),'[]') FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_class ci ON ci.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${nonSystem('n')}),
'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',(SELECT jsonb_agg(CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END ORDER BY CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END) FROM unnest(p.polroles) r),'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY n.nspname,c.relname,p.polname),'[]') FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${nonSystem('n')}),
'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid,false)) ORDER BY n.nspname,c.relname,t.tgname),'[]') FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${nonSystem('n')} AND NOT t.tgisinternal),
'functions',(SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),'owner',pg_get_userbyid(p.proowner),'language',l.lanname,'securityDefiner',p.prosecdef,'leakproof',p.proleakproof,'volatility',p.provolatile,'parallel',p.proparallel,'strict',p.proisstrict,'config',p.proconfig,'aclNull',p.proacl IS NULL,'acl',${acl('p.proacl')},'definition',pg_get_functiondef(p.oid),'extension',(SELECT e.extname FROM pg_depend d JOIN pg_extension e ON e.oid=d.refobjid WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.refclassid='pg_extension'::regclass AND d.deptype='e')) ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),'[]') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE ${nonSystem('n')} AND p.prokind IN ('f','p','w')),
'defaultPrivileges',(SELECT coalesce(jsonb_agg(jsonb_build_object('role',pg_get_userbyid(d.defaclrole),'schema',n.nspname,'kind',d.defaclobjtype,'acl',${acl('d.defaclacl')}) ORDER BY pg_get_userbyid(d.defaclrole),n.nspname,d.defaclobjtype),'[]') FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace),
'eventTriggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',e.evtname,'event',e.evtevent,'owner',pg_get_userbyid(e.evtowner),'function',e.evtfoid::regprocedure::text,'enabled',e.evtenabled,'tags',e.evttags) ORDER BY e.evtname),'[]') FROM pg_event_trigger e),
'sequences',(SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'type',format_type(s.seqtypid,NULL),'start',s.seqstart,'increment',s.seqincrement,'min',s.seqmin,'max',s.seqmax,'cache',s.seqcache,'cycle',s.seqcycle) ORDER BY n.nspname,c.relname),'[]') FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${nonSystem('n')}),
'database',(SELECT jsonb_build_object('name',datname,'encoding',pg_encoding_to_char(encoding),'collationProvider',datlocprovider,'collate',datcollate,'ctype',datctype,'icuLocale',CASE WHEN datlocprovider='i' THEN datlocale ELSE NULL END,'locale',datlocale,'collationVersion',datcollversion,'owner',pg_get_userbyid(datdba),'aclNull',datacl IS NULL,'acl',${acl('datacl')}) FROM pg_database WHERE datname=current_database())
);`;

export function manifestTransactionSql(snapshotToken) {
  if (!/^[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+$/.test(snapshotToken)) throw new Error('Invalid exported snapshot token');
  // SET TRANSACTION SNAPSHOT must precede the first query. Preflight uses only SETs.
  return `${RECOVERY_TRANSACTION_SQL}\nSET TRANSACTION SNAPSHOT '${snapshotToken}';\n${RECOVERY_CANONICAL_SETTINGS}`;
}
export function buildTableScope(catalog) {
  if (!Array.isArray(catalog?.relations) || !Array.isArray(catalog?.extensions)) throw new Error('Malformed recovery catalog');
  const configs = new Map();
  for (const extension of catalog.extensions) for (const config of extension.config ?? []) {
    const key = JSON.stringify([config.schema, config.table]);
    if (configs.has(key)) throw new Error('Duplicate extension configuration scope');
    configs.set(key, { extension: extension.name, predicate: config.predicate ?? '' });
  }
  return catalog.relations.map(relation => {
    const base = { schema: relation.schema, table: relation.name, kind: relation.kind, extension: relation.extension ?? null, predicate: '' };
    const config = configs.get(JSON.stringify([relation.schema, relation.name]));
    if (relation.kind === 'r' && config) return { ...base, ...config, scope: 'extension_config', reason: 'pg_dump registered extension configuration rows' };
    if (relation.kind === 'r' && !relation.extension) return { ...base, scope: 'full', reason: 'ordinary physical table data' };
    if (relation.kind === 'r') return { ...base, scope: 'excluded', reason: 'extension-owned data not registered for pg_dump configuration export' };
    if (relation.kind === 'm') return { ...base, scope: 'excluded', reason: 'materialized contents recreated by pg_dump refresh; not a source snapshot row-copy guarantee' };
    if (relation.kind === 'f') return { ...base, scope: 'excluded', reason: 'foreign table data not included by default pg_dump' };
    return { ...base, scope: 'structure_only', reason: relation.kind === 'p' ? 'partition parent; physical leaves counted independently' : 'schema definition or non-MVCC sequence state' };
  });
}
const quoteIdentifier = value => {
  if (typeof value !== 'string' || !value || value.includes('\0')) throw new Error('Invalid recovery identifier');
  return `"${value.replaceAll('"', '""')}"`;
};
export function tableDigestSql(scope) {
  if (!['full', 'extension_config'].includes(scope.scope)) throw new Error('Scope does not include data');
  const predicate = scope.predicate?.trim() ?? '';
  if (scope.scope === 'full' && predicate) throw new Error('Full table scope cannot filter rows');
  // extcondition is privileged catalog SQL, never user input. Reject statement or
  // comment boundaries so it remains only the archive's registered row predicate.
  if (predicate && (!/^WHERE\s/i.test(predicate) || /;|--|\/\*|\*\/|\0/.test(predicate))) throw new Error('Unsupported extension configuration predicate');
  return `COPY (SELECT row_hash FROM (SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS row_hash FROM ONLY ${quoteIdentifier(scope.schema)}.${quoteIdentifier(scope.table)} AS t ${predicate}) canonical_rows ORDER BY row_hash COLLATE "C") TO STDOUT;`;
}
export function createTableDigestSink() {
  const hash = createHash('sha256');
  let pending = '', bytes = 0, rows = 0;
  const stream = new Transform({ transform(chunk, encoding, callback) {
    bytes += chunk.length; hash.update(chunk); pending += chunk.toString('utf8');
    const lines = pending.split('\n'); pending = lines.pop();
    if (pending.length > 64 || lines.some(line => !/^[0-9a-f]{64}$/.test(line))) return callback(new Error('Invalid canonical table digest stream'));
    rows += lines.length; callback();
  }, flush(callback) { callback(pending ? new Error('Truncated canonical table digest stream') : null); } });
  return { stream, result: () => ({ rows, bytes, sha256: hash.digest('hex') }) };
}
