// Fixed-target, GET-only preparation. Never pull the project's full environment.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../../', import.meta.url));
const projectId = 'prj_RocmjxStsTrtmrDaqMddMnb29ENh';
const orgId = 'team_zjdKVgrSBNAYC9gql0Raiocm';
const projectRef = 'auolnfwetmfcwhtvakzy';
const commit = '93539b00bef9109f4221d10c9554cd99a3f5d5fe';
const cli = 'C:/Users/foote/AppData/Roaming/npm/node_modules/vercel/dist/vc.js';
const destination = path.join(root, 'output/app-quality-release/production-artifact-93539b0');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|HOMEDRIVE|HOMEPATH)$/i.test(key)));
const hash = value => createHash('sha256').update(value).digest('hex');
const options = { cwd: root, env, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024, timeout: 120000 };
function get(endpoint) {
  const result = spawnSync(process.execPath, [cli, 'api', endpoint, '--method', 'GET', '--scope', 'gregs-projects-98860c8b'], options);
  if (result.error || result.status !== 0) throw Error('Vercel metadata GET failed; output suppressed to protect environment values');
  try { return JSON.parse(result.stdout); } catch { throw Error('Unexpected Vercel metadata response'); }
}
if (process.argv.length !== 2) throw Error('No caller-supplied targets or paths accepted');
if (fs.existsSync(destination)) throw Error('Artifact destination already exists; never overwrite a retained artifact');
const project = get(`/v9/projects/${projectId}`);
if (project.id !== projectId || project.accountId !== orgId || project.name !== 'fitness-tracker' || project.framework !== 'nextjs' || project.nodeVersion !== '24.x') throw Error('Production project identity/settings mismatch');
const production = project.targets?.production;
if (production?.id !== 'dpl_5kZSaXHLmqPPzsCy6odLJyy99utW' || production.readyState !== 'READY' || production.meta?.githubCommitSha !== 'f123aa8aa848716e894ea7bec340d693995e4b36') throw Error('Production deployment changed; review before building');
const inventory = get(`/v10/projects/${projectId}/env?decrypt=false`);
if (!Array.isArray(inventory.envs)) throw Error('Missing environment metadata');
const productionEnvs = inventory.envs.filter(item => item.target?.includes('production'));
const values = {};
for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']) {
  const matches = productionEnvs.filter(item => item.key === key);
  if (matches.length !== 1 || matches[0].gitBranch || matches[0].customEnvironmentIds?.length) throw Error('Ambiguous public production environment binding');
  const item = get(`/v1/projects/${projectId}/env/${matches[0].id}`);
  if (item.id !== matches[0].id || item.key !== key || !item.target?.includes('production') || item.gitBranch || typeof item.value !== 'string' || !item.value || /[\r\n]/.test(item.value)) throw Error('Invalid public production input');
  values[key] = item.value;
}
if (values.NEXT_PUBLIC_SUPABASE_URL !== `https://${projectRef}.supabase.co`) throw Error('Public database destination mismatch');
let claims;
try { claims = JSON.parse(Buffer.from(values.NEXT_PUBLIC_SUPABASE_ANON_KEY.split('.')[1], 'base64url').toString()); } catch { throw Error('Unexpected anon key format'); }
if (values.NEXT_PUBLIC_SUPABASE_ANON_KEY.split('.').length !== 3 || !claims || claims.ref !== projectRef || claims.role !== 'anon' || !Number.isSafeInteger(claims.exp) || claims.exp * 1000 <= Date.now()) throw Error('Public anon key identity/role/expiry mismatch');
const settings = Object.fromEntries(['createdAt', 'framework', 'devCommand', 'installCommand', 'buildCommand', 'outputDirectory', 'rootDirectory', 'directoryListing', 'nodeVersion'].map(key => [key, project[key] ?? null]));
if (project.analytics?.id && (!project.analytics.disabledAt || project.analytics.enabledAt > project.analytics.disabledAt)) settings.analyticsId = project.analytics.id;
if (settings.rootDirectory || settings.installCommand || settings.buildCommand || settings.outputDirectory) throw Error('Unexpected custom build settings require review');
const cache = { projectId, orgId, projectName: project.name, settings };
fs.mkdirSync(destination);
fs.mkdirSync(path.join(destination, 'inputs'));
fs.writeFileSync(path.join(destination, 'inputs/project.json'), JSON.stringify(cache, null, 2), { flag: 'wx' });
fs.writeFileSync(path.join(destination, 'inputs/.env.production.local'), Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n', { flag: 'wx' });
const source = path.join(destination, 'source.tar');
const archived = spawnSync('git', ['archive', '--format=tar', `--output=${source}`, commit], options);
if (archived.status !== 0) throw Error('Pinned Git archive failed');
const receipt = {
  checkedAt: new Date().toISOString(), sourceCommit: commit, projectId, orgId, projectRef,
  currentProduction: { id: production.id, url: production.url, sha: production.meta.githubCommitSha, state: production.readyState },
  settings, publicInputs: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { sha256: hash(value), ...(key.endsWith('_URL') ? { value } : { role: claims.role, projectRef: claims.ref }) }])),
  environmentMetadata: productionEnvs.map(item => ({ key: item.key, id: item.id, type: item.type, target: item.target, updatedAt: item.updatedAt, gitBranch: item.gitBranch ?? null })).sort((a,b) => a.key.localeCompare(b.key)),
  newRuntimeFlagsAbsent: ['CAPTURE_RECEIPTS_V2_ENABLED', 'COACH_TRAINING_INTENT_ENABLED', 'COACH_HISTORY_CONTEXT_ENABLED', 'COACH_TARGETED_REVIEW_ENABLED', 'RECOMMENDATIONS_ENABLED'].every(key => !productionEnvs.some(item => item.key === key)),
  existingExercisePreferenceFlagValue: 'not retrieved; preserve existing runtime binding',
  initialDosePolicy: false, sourceArchiveSha256: hash(fs.readFileSync(source)),
  privateSecretDecryptionRequested: false, decryptedInputNames: Object.keys(values), hostedChanges: false,
};
if (!receipt.newRuntimeFlagsAbsent) throw Error('New capability flag appeared; review before build');
fs.writeFileSync(path.join(destination, 'input-receipt.json'), JSON.stringify(receipt, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ destination, ...receipt }));
