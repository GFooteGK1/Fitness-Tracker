// One explicitly approved temporary login issuance for this frozen execution.
// Never calls CLI login, connection retries, network bans or security settings.
import assert from 'node:assert/strict';
import {LIVE_SETUP_TARGET,validateLiveSetupManifest} from './setup-freshness-live-contract.mjs';
import {readBoundedLiveJson} from './setup-freshness-live-http.mjs';

// Shared fixed request for the attended lifecycle and the pre-install readback.
// The caller supplies an exclusive encrypted record function and explicit authority.
export async function issueSetupSqlLogin({managementAccessToken,record,fetchImpl=fetch,now=Date.now}) {
  assert(typeof managementAccessToken==='string'&&managementAccessToken.length>20);
  const url=`https://api.supabase.com/v1/projects/${LIVE_SETUP_TARGET.project}/cli/login-role`;
  const requestedAt=now();
  await record('shared-sql-login-intent',{url,method:'POST',body:{read_only:false},requestedAt});
  const response=await fetchImpl(url,{method:'POST',headers:{Authorization:`Bearer ${managementAccessToken}`,'Content-Type':'application/json'},
    body:JSON.stringify({read_only:false}),redirect:'error',signal:AbortSignal.timeout(15000)});
  const value=await readBoundedLiveJson(response);
  await record('shared-sql-login-response',{status:response.status,value});
  assert.equal(response.status,201);assert.equal(value.role,'cli_login_postgres');
  assert(typeof value.password==='string'&&value.password.length>0);assert(Number.isSafeInteger(value.ttl_seconds)&&value.ttl_seconds>=600);
  return {requestedAt,expiresAt:requestedAt+value.ttl_seconds*1000,
    connection:{PGHOST:'aws-1-us-east-1.pooler.supabase.com',PGPORT:'5432',PGUSER:`cli_login_postgres.${LIVE_SETUP_TARGET.project}`,PGDATABASE:'postgres',PGPASSWORD:value.password}};
}

export async function obtainSharedSetupLogin(manifest,{evidence,channel,fetchImpl=fetch,now=Date.now}) {
  validateLiveSetupManifest(manifest);
  let saved;
  try{saved=await evidence.read('shared-sql-login');}catch(error){if(error.code!=='ENOENT')throw error;}
  if(!saved){
    assert.equal(channel,'operator','Provisioning must establish the shared login before other channels');
    const credentials=await evidence.read('operator-credentials');
    saved=await issueSetupSqlLogin({managementAccessToken:credentials.managementAccessToken,record:evidence.record,fetchImpl,now});
    await evidence.record('shared-sql-login',saved);
  }
  assert(Number.isSafeInteger(saved.expiresAt)&&saved.expiresAt-now()>=300000,'Shared login lifetime does not cover containment');
  return structuredClone(saved.connection);
}
