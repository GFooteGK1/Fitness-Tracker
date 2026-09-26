// Catalog/ledger only. No connection, credential handling or application RPCs.
// The caller supplies the fixed-target, TLS-verified read-only transaction.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const read = relative => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');
export const RELEASE_PROJECT = 'auolnfwetmfcwhtvakzy';
export const RELEASE_MIGRATIONS = [
  '20260915220000_exercise_preferences.sql',
  '20260918010000_optional_session_feedback.sql',
  '20260918011000_session_capture_signals.sql',
  '20260918020000_capture_receipts.sql',
  '20260918030000_training_intent.sql',
  '20260918040000_targeted_review_sources.sql',
  '20260918050000_recommendations.sql',
  '20260921010000_coach_proposal_context_revision.sql',
  '20260923010000_coaching_write_pause.sql',
];
export function releaseMigrationManifest() {
  return RELEASE_MIGRATIONS.map(file => ({ file, sha256: createHash('sha256').update(readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url))).digest('hex') }));
}

const currentFunctions = ['accept_adaptation_proposal', 'assert_coach_review_sources',
  'create_initial_rolling_weekly_proposal', 'create_rolling_weekly_replacement_proposal',
  'guard_coach_proposal_sources', 'record_coach_weekly_review'];
const newFunctions = ['get_coach_context_revision', 'advance_coach_context_revision', 'coach_context_revision_value',
  'assert_coach_context_revision', 'assert_coach_plan_intent_current', 'guard_coach_proposal_context',
  'guard_coach_review_context', 'expire_stale_coach_context_proposals', 'assert_coaching_writes_open', 'set_coaching_write_pause'];
const entrypoints = new Set(['accept_adaptation_proposal', 'create_initial_rolling_weekly_proposal',
  'create_rolling_weekly_replacement_proposal', 'record_coach_weekly_review']);
const newTables = new Set(['coach_context_revisions', 'coaching_write_control']);
const baselineReceipt = JSON.parse(read('docs/verification/programming-quality/release-catalog-baseline-2026-09-23.json'));
const hostedReceipt = JSON.parse(read('docs/verification/programming-quality/hosted-catalog-comparison-2026-09-23.json'));
const qualificationProofPath = 'docs/verification/programming-quality/release-workout-default-qualification-2026-09-23.json';
const qualificationProof = JSON.parse(read(qualificationProofPath));

// Reuse the exact already-reviewed canonical fingerprint CTE, including CR-only
// normalization and PG18 NOT NULL catalog-row exclusion. No caller SQL is used.
const canonical = read('docs/verification/programming-quality/release-catalog-fingerprints.sql');
const start = canonical.indexOf('WITH targets(name) AS'), end = canonical.indexOf('\nSELECT jsonb_build_object(');
if (start < 0 || end <= start) throw Error('Canonical release fingerprint query changed');
let fingerprintCtes = canonical.slice(start, end).trimEnd();
const oldTargets = "('training_programs'),('workouts')";
if (fingerprintCtes.split(oldTargets).length !== 2) throw Error('Canonical release relation scope changed');
fingerprintCtes = fingerprintCtes.replace(oldTargets, `${oldTargets},('coach_context_revisions'),('coaching_write_control')`);

export const RELEASE_TARGET_METADATA_SQL = `${fingerprintCtes},
required_migrations(version) AS (VALUES ${RELEASE_MIGRATIONS.map(file => `('${file.slice(0, 14)}')`).join(',')}),
required_functions(name) AS (VALUES ${[...currentFunctions, ...newFunctions].map(name => `('${name}')`).join(',')}),
function_access AS (
 SELECT f.name,p.oid IS NOT NULL AS present,pg_catalog.pg_get_function_identity_arguments(p.oid) AS args,
  pg_catalog.pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proconfig,
  p.proacl::text AS acl,
  (SELECT pg_catalog.jsonb_object_agg(r.rolname,pg_catalog.has_function_privilege(r.oid,p.oid,'EXECUTE') ORDER BY r.rolname)
   FROM pg_catalog.pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role')) AS execute
 FROM required_functions f LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
 LEFT JOIN pg_catalog.pg_proc p ON p.pronamespace=n.oid AND p.proname=f.name AND p.prokind='f'
)
SELECT pg_catalog.jsonb_build_object(
 'format','release-target-metadata-1',
 'identity',pg_catalog.jsonb_build_object(
  'database',pg_catalog.current_database(),'role',current_user,'login',session_user,
  'observedAt',pg_catalog.clock_timestamp(),'versionNum',pg_catalog.current_setting('server_version_num'),
  'readOnly',pg_catalog.current_setting('transaction_read_only'),
  'isolation',pg_catalog.current_setting('transaction_isolation'),
  'rowSecurity',pg_catalog.current_setting('row_security'),
  'statementTimeoutMs',(SELECT setting::integer FROM pg_catalog.pg_settings WHERE name='statement_timeout'),
  'lockTimeoutMs',(SELECT setting::integer FROM pg_catalog.pg_settings WHERE name='lock_timeout'),
  'ssl',(SELECT ssl FROM pg_catalog.pg_stat_ssl WHERE pid=pg_catalog.pg_backend_pid())),
 'postgresRole',(SELECT pg_catalog.jsonb_build_object('superuser',rolsuper,'bypassRls',rolbypassrls)
  FROM pg_catalog.pg_roles WHERE rolname='postgres'),
 'ledger', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('version',r.version,'recorded',m.version IS NOT NULL,'name',m.name) ORDER BY r.version)
  FROM required_migrations r LEFT JOIN supabase_migrations.schema_migrations m ON m.version=r.version),
 'newerLedger',(SELECT coalesce(pg_catalog.jsonb_agg(version ORDER BY version),'[]'::jsonb)
  FROM supabase_migrations.schema_migrations WHERE version > '20260918050000'),
 'functions',coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(name,args,md5) ORDER BY name COLLATE "C",args COLLATE "C") FROM functions),'[]'::jsonb),
 'functionAccess',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(f) ORDER BY f.name COLLATE "C",f.args COLLATE "C") FROM function_access f),
 'relations',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(name,oid IS NOT NULL,relrowsecurity,relforcerowsecurity) ORDER BY name COLLATE "C") FROM relations),
 'groups',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(name,category,rows,md5) ORDER BY name COLLATE "C",category COLLATE "C") FROM groups)
) AS release_target_metadata;`;

export const RELEASE_TARGET_QUERY_SHA256 = createHash('sha256').update(RELEASE_TARGET_METADATA_SQL).digest('hex');

// This establishes only the previously inspected pre-install state. It neither
// authorizes release nor validates post-install/pause state. Database identity
// cannot prove a Supabase project: transport must attest its fixed verified host.
export function classifyReleaseTargetMetadata(metadata, transport = {}) {
  const identity = metadata?.identity ?? {};
  /** @type {Record<string, boolean>} */
  const checks = {
    format: metadata?.format === 'release-target-metadata-1',
    fixedTarget: transport.projectRef === RELEASE_PROJECT && transport.fixedTargetVerified === true && transport.tlsVerifyFull === true,
    database: identity.database === 'postgres', role: identity.role === 'postgres', login: identity.login === 'cli_login_postgres',
    version: identity.versionNum === '170006', backendSslObserved: typeof identity.ssl === 'boolean',
    readOnly: identity.readOnly === 'on', isolation: identity.isolation === 'repeatable read', rowSecurity: identity.rowSecurity === 'off',
    boundedStatement: identity.statementTimeoutMs === 120000, boundedLock: identity.lockTimeoutMs === 5000,
    timestamp: typeof identity.observedAt === 'string' && Number.isFinite(Date.parse(identity.observedAt)),
    postgresRlsBypass: metadata?.postgresRole?.superuser === true || metadata?.postgresRole?.bypassRls === true,
  };
  const ledger = Array.isArray(metadata?.ledger) ? metadata.ledger : [];
  checks.ledgerScope = ledger.length === RELEASE_MIGRATIONS.length && RELEASE_MIGRATIONS.every(file => ledger.filter(row => row.version === file.slice(0, 14)).length === 1);
  checks.prerequisitesRecorded = RELEASE_MIGRATIONS.slice(0, 7).every(file => ledger.some(row => row.version === file.slice(0, 14) && row.recorded === true));
  checks.pauseAndRevisionAbsent = RELEASE_MIGRATIONS.slice(7).every(file => ledger.some(row => row.version === file.slice(0, 14) && row.recorded === false));
  checks.noUnreviewedNewerMigration = Array.isArray(metadata?.newerLedger) && metadata.newerLedger.length === 0;
  const relations = Array.isArray(metadata?.relations) ? metadata.relations : [];
  const requiredOldRelations = baselineReceipt.comparison.relations.map(row => row[0]);
  checks.relationScope = relations.length === 16 && [...requiredOldRelations, ...newTables].every(name => relations.filter(row => row[0] === name).length === 1);
  checks.existingRelationsForcedRls = requiredOldRelations.every(name => relations.some(row => row[0] === name && row[1] === true && row[2] === true && row[3] === true));
  checks.newRelationsAbsent = [...newTables].every(name => relations.some(row => row[0] === name && row[1] === false));
  const functions = Array.isArray(metadata?.functions) ? metadata.functions : [];
  const groups = Array.isArray(metadata?.groups) ? metadata.groups : [];
  const access = Array.isArray(metadata?.functionAccess) ? metadata.functionAccess : [];
  // Hash arrays use the same deterministic identities/order as the saved live
  // readback. Function definitions include name/signature; group identities are
  // additionally checked. Historical workout differences stay bound to live hashes.
  checks.publicFunctionDefinitionsUnchanged = JSON.stringify(functions.map(row => row[2])) === JSON.stringify(hostedReceipt.liveFunctionHashes);
  const oldGroups = groups.filter(row => requiredOldRelations.includes(row[0]));
  checks.groupIdentityScope = oldGroups.length === 70 && JSON.stringify(oldGroups.map(row => row.slice(0, 2))) === JSON.stringify(baselineReceipt.comparison.groups.map(row => row.slice(0, 2)));
  const rawExistingMetadataUnchanged = JSON.stringify(oldGroups.map(row => row[3])) === JSON.stringify(hostedReceipt.liveGroupHashes);
  const groupDifferences = oldGroups.flatMap((row, i) => row[3] === hostedReceipt.liveGroupHashes[i] ? [] : [{ row, prior: hostedReceipt.liveGroupHashes[i] }]);
  const proofBound = qualificationProof.sourceBackupRun === 'backup-20260923220856-d35a0ccf' &&
    qualificationProof.releaseQuerySha256 === RELEASE_TARGET_QUERY_SHA256 && qualificationProof.sourceArtifactAuthenticated === true &&
    qualificationProof.columnCount === 28 && qualificationProof.changedDefaultCount === 1 &&
    qualificationProof.qualifiedPayloadMd5 === '66f7424856047a9ba8407991d8fb12c4' &&
    qualificationProof.unqualifiedPayloadMd5 === '826dacdb2e159803a162a9bf1c073ad4' &&
    qualificationProof.qualifiedMatchesCurrentReadback === true && qualificationProof.unqualifiedMatchesPriorHostedReadback === true;
  const difference = groupDifferences[0];
  const knownDefaultQualification = checks.groupIdentityScope && proofBound && groupDifferences.length === 1 &&
    difference?.row[0] === 'workouts' && difference.row[1] === 'columns' && difference.row[2] === 28 &&
    difference.prior === '826dacdb2e159803a162a9bf1c073ad4' && difference.row[3] === '66f7424856047a9ba8407991d8fb12c4';
  checks.existingMetadataMatchesReviewedDefinitions = rawExistingMetadataUnchanged || knownDefaultQualification;
  checks.internalHelpersAbsent = newFunctions.every(name => access.filter(row => row.name === name).length === 1 && access.some(row => row.name === name && row.present === false));
  checks.existingFunctionSecurity = currentFunctions.every(name => {
    const entries = access.filter(row => row.name === name);
    if (entries.length !== 1) return false;
    const row = entries[0];
    return row.present === true && row.owner === 'postgres' && row.prosecdef === true &&
      JSON.stringify(row.proconfig) === JSON.stringify(['search_path=""']) &&
      row.execute?.anon === false && row.execute?.service_role === false && row.execute?.authenticated === entrypoints.has(name);
  });
  const failedChecks = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return { passed: failedChecks.length === 0, checks, failedChecks,
    state: failedChecks.length === 0 ? 'reviewed_pre_install_baseline' : 'stop_and_review',
    querySha256: RELEASE_TARGET_QUERY_SHA256,
    metadataComparison: { rawExistingMetadataUnchanged,
      qualifications: knownDefaultQualification ? [{ rule: 'exact-workout-default-deparser-qualification', relation: 'workouts', category: 'columns', count: 28,
        priorHash: difference.prior, currentHash: difference.row[3], evidence: qualificationProofPath }] : [] },
    missingReleaseMigrations: ledger.filter(row => row.recorded === false).map(row => row.version),
    limitations: ['Project identity comes from the verified transport, not a SQL-invented project label.',
      'pg_stat_ssl reports the database backend connection; a session pooler backend may be unencrypted while the client connection requires verified TLS. Client TLS is attested by transport.tlsVerifyFull.',
      'No athlete rows, application RPCs or pause-state rows are read.',
      'Ledger presence is not a file-content hash; candidate file SHA256 is recorded separately.',
      'A disclosed exact workout-default qualification may match reviewed definitions while raw metadata equality remains false; all other differences fail.',
      'Metadata covers the 14 previously inspected relations and the two new boundaries; it is not a full platform inventory.',
      'Passing pre-install readback neither installs migrations nor authorizes deployment.'] };
}
