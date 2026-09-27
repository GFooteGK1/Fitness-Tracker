// Prepared GET-only fallback for the incompatible Vercel connector schema.
// Run only after approval of this revised method. No deploy, decrypt, auth or env writes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';

assert.deepEqual(process.argv.slice(2), ['--read-only']);
const root=fileURLToPath(new URL('../../',import.meta.url));
const projectId='prj_RocmjxStsTrtmrDaqMddMnb29ENh', teamId='team_zjdKVgrSBNAYC9gql0Raiocm';
const domains=['sociusai.vercel.app','sociusfit.com','www.sociusfit.com'];
const cli='C:/Users/foote/AppData/Roaming/npm/node_modules/vercel/dist/vc.js';
const output=path.join(root,'output/setup-freshness-release',`platform-${randomUUID()}.json`);
const metadata={startedAt:new Date().toISOString(),projectId,teamId,methods:['GET'],mutations:0,decrypt:false,passed:false};
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|HOMEDRIVE|HOMEPATH)$/i.test(key)));
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
let deploymentId;
function get(endpoint) {
  const permitted=[`/v9/projects/${projectId}`,`/v9/projects/${projectId}/domains`,
    `/v10/projects/${projectId}/env?decrypt=false`,...domains.map(name=>`/v4/aliases/${name}`)];
  if(deploymentId) permitted.push(`/v13/deployments/${deploymentId}`);
  assert(permitted.includes(endpoint),'Endpoint outside fixed read scope');
  metadata.phase=endpoint;
  const result=spawnSync(process.execPath,[cli,'api',endpoint,'--method','GET','--scope','gregs-projects-98860c8b'],
    {cwd:root,env,encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:8*1024*1024});
  // Never print or persist the unfiltered response, including error bodies.
  if(result.error || result.status!==0) throw Error(`Read-only metadata request failed: ${endpoint}`);
  try { return JSON.parse(result.stdout); }
  catch { throw Error('Metadata response was not valid JSON'); }
}
try {
  const project=get(`/v9/projects/${projectId}`);
  assert.equal(project.id,projectId); assert.equal(project.accountId,teamId);
  deploymentId=project.targets?.production?.id;
  assert(/^dpl_[a-zA-Z0-9]+$/.test(deploymentId??''),'No production deployment');
  const deployment=get(`/v13/deployments/${deploymentId}`);
  assert.equal(deployment.projectId,projectId); assert.equal(deployment.ownerId,teamId);
  const domainResult=get(`/v9/projects/${projectId}/domains`);
  assert(!domainResult.pagination?.next,'Project domains require pagination review');
  const attached=domainResult.domains.map(row=>({name:row.name,redirect:row.redirect??null,redirectStatusCode:row.redirectStatusCode??null})).sort((a,b)=>a.name.localeCompare(b.name));
  assert.deepEqual(attached.map(row=>row.name),domains,'Production domain scope changed');
  const aliases=domains.map(name=>get(`/v4/aliases/${name}`));
  assert(aliases.every((row,i)=>row.alias===domains[i]&&row.projectId===projectId&&row.deploymentId===deploymentId),'Alias identity mismatch');
  const environment=get(`/v10/projects/${projectId}/env?decrypt=false`);
  assert(!environment.pagination?.next,'Environment metadata requires pagination review');
  const bindings=environment.envs.filter(row=>row.target?.includes('production')).map(row=>({key:row.key,id:row.id,type:row.type,target:row.target,
    updatedAt:row.updatedAt,gitBranch:row.gitBranch??null})).sort((a,b)=>a.key.localeCompare(b.key));
  Object.assign(metadata,{deployment:{id:deployment.id,url:deployment.url,readyState:deployment.readyState,target:deployment.target,
    commit:deployment.meta?.githubCommitSha,ref:deployment.meta?.githubCommitRef,createdAt:deployment.createdAt},
    domains:attached,aliases:aliases.map(row=>({alias:row.alias,deploymentId:row.deploymentId})),bindings,bindingMetadataSha256:sha(bindings),
    rollingRelease:project.rollingRelease??null});
  assert.equal(deployment.readyState,'READY'); assert.equal(deployment.target,'production');
  assert.equal(deployment.meta?.githubCommitRef,'main'); assert(/^[a-f0-9]{40}$/.test(deployment.meta?.githubCommitSha??''));
  assert.equal(metadata.rollingRelease,null,'Rolling release requires review');
  metadata.passed=true;
} catch { metadata.error='Read-only metadata check failed at the recorded fixed endpoint; raw response suppressed'; process.exitCode=1; }
metadata.completedAt=new Date().toISOString();
metadata.limitations=['Observed production identity, not source-to-build attestation','No database preflight, env-value decryption, smoke writes or rollout authorization','Refresh after candidate CI and again before any approved rollout'];
fs.writeFileSync(output,JSON.stringify(metadata,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:metadata.passed,receipt:path.relative(root,output),deployment:metadata.deployment,error:metadata.error}));
