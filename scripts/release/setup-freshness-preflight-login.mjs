// Preparation is import-safe. Invocation issues a temporary privileged login;
// the subsequent database query is read-only. Requires separate operator approval.
import assert from 'node:assert/strict';
import {issueSetupSqlLogin} from './setup-freshness-live-login.mjs';

export const SETUP_PREFLIGHT_ARGS=['setup-preflight','--issue-temporary-login'];

export async function readPreflightCredential(input) {
  assert(!input.isTTY,'Supply the approved token through secure stdin');
  const chunks=[];let bytes=0;
  const timer=setTimeout(()=>input.destroy(Error('preflight_credential_input_timeout')),15000);
  try {
    for await(const chunk of input){const value=Buffer.from(chunk);bytes+=value.length;
      assert(bytes<=16384,'preflight_credential_input_limit');chunks.push(value);}
    const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    assert(value&&typeof value==='object'&&!Array.isArray(value));
    assert.deepEqual(Object.keys(value),['managementAccessToken']);
    assert(typeof value.managementAccessToken==='string'&&/^[A-Za-z0-9_.-]{21,8192}$/.test(value.managementAccessToken));
    return value.managementAccessToken;
  } finally {clearTimeout(timer);for(const chunk of chunks)chunk.fill(0);}
}

export async function createSetupPreflightConnection({argv,input,record,fetchImpl=fetch,now=Date.now}) {
  try {
    assert.deepEqual(argv,SETUP_PREFLIGHT_ARGS);
    const managementAccessToken=await readPreflightCredential(input);
    const login=await issueSetupSqlLogin({managementAccessToken,record,fetchImpl,now});
    assert(login.expiresAt-now()>=300000,'preflight_login_lifetime');
    await record('setup-preflight-login',{requestedAt:login.requestedAt,expiresAt:login.expiresAt,project:'auolnfwetmfcwhtvakzy'});
    return login.connection;
  } catch {
    // Parse/fetch/assertion errors can contain credentials or private response text.
    throw Error('setup_preflight_connection_failed; inspect private evidence; do not retry issuance');
  }
}
