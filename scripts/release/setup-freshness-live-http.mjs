// Fixed production HTTP adapter. Construction does not connect. ready() and
// lifecycle methods are execution, requiring a separately approved operator.
// Only the two synthetic owner sessions enter this worker; no service-role key.
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {createClient} from '@supabase/supabase-js';
import {CookieAuthStorageAdapter} from '@supabase/auth-helpers-shared';
import {LIVE_SETUP_TARGET,validateLiveSetupManifest} from './setup-freshness-live-contract.mjs';
import {renderLiveFixtureSql} from './setup-freshness-live-fixtures.mjs';

export async function readBoundedLiveJson(response) {
  const limit=4*1024*1024,reader=response.body?.getReader();assert(reader,'Lifecycle response body required');
  const chunks=[];let total=0;
  try {
    while(true){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;
      if(total>limit){await reader.cancel();throw Error('Lifecycle response limit');}chunks.push(value);}
    return JSON.parse(Buffer.concat(chunks,total).toString('utf8'));
  } finally {reader.releaseLock();}
}

export async function waitForDatabaseExpiry({at,signal},readDatabaseTime) {
  const expiry=Date.parse(at);assert(Number.isFinite(expiry),'Invalid database expiry');
  for(let reads=0;reads<4;reads++) {
    signal?.throwIfAborted();
    const observedAt=await readDatabaseTime({signal}),databaseNow=Date.parse(observedAt);
    assert(Number.isFinite(databaseNow),'Invalid database clock');
    const remaining=expiry-databaseNow;
    assert(remaining<=15000,'Expiry exceeds fixture window');
    // PostgreSQL retains microseconds; Date.parse truncates to milliseconds.
    // The next millisecond is conservative even when truncated values tie.
    if(remaining<0)return {expired:true,observedAt};
    await delay(remaining+25,undefined,{signal});
  }
  throw Error('Database expiry was not observed');
}

export function createLiveSetupHttp(input,{anonKey,sessions,executeFixture,readDatabaseTime,fetchImpl=fetch,now=Date.now}) {
  const manifest=structuredClone(input);validateLiveSetupManifest(manifest);
  assert.equal(typeof anonKey,'string');assert(anonKey.length>20);assert.equal(typeof executeFixture,'function');
  if(!anonKey.startsWith('sb_publishable_')) {
    assert.equal(anonKey.split('.').length,3,'Public project key required');
    const publicClaims=JSON.parse(Buffer.from(anonKey.split('.')[1],'base64url').toString('utf8'));
    assert.equal(publicClaims.role,'anon');assert.equal(publicClaims.ref,LIVE_SETUP_TARGET.project);
  }
  assert.deepEqual(Object.keys(sessions).sort(),Object.values(manifest.owners).map(x=>x.userId).sort());
  let ready=false;
  const safeFetch=async(input,init={})=>{
    const url=new URL(typeof input==='string'?input:input.url);
    assert.equal(url.origin,LIVE_SETUP_TARGET.apiOrigin);
    assert(url.pathname==='/auth/v1/user'||url.pathname.startsWith('/rest/v1/'));
    assert.equal((init.method??'GET').toUpperCase(),'GET','Owner client is read-only');
    return fetchImpl(input,{...init,redirect:'error',signal:AbortSignal.any([...(init.signal?[init.signal]:[]),AbortSignal.timeout(15000)])});
  };
  const actors=new Map();
  for(const owner of Object.values(manifest.owners)) {
    const session=structuredClone(sessions[owner.userId]);
    assert.equal(session.user?.id,owner.userId);assert.equal(session.user?.email,owner.email);
    const token=session.access_token;
    assert.equal(typeof token,'string');assert.equal(token.split('.').length,3);
    const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'));
    assert.equal(claims.sub,owner.userId);assert.equal(claims.role,'authenticated');
    assert.equal(claims.iss,`${LIVE_SETUP_TARGET.apiOrigin}/auth/v1`);
    assert(Number.isSafeInteger(claims.exp)&&claims.exp*1000>now()+manifest.workMs+60000,'Session must cover the entire window without refresh');
    const cookies=[];
    class Adapter extends CookieAuthStorageAdapter {setCookie(k,v){cookies.push(`${k}=${encodeURIComponent(v)}`);}}
    new Adapter().setItem(`sb-${LIVE_SETUP_TARGET.project}-auth-token`,JSON.stringify(session));
    const client=createClient(LIVE_SETUP_TARGET.apiOrigin,anonKey,{global:{fetch:safeFetch,headers:{Authorization:`Bearer ${token}`}},
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    actors.set(owner.userId,{owner,client,token,cookie:cookies.join('; ')});
  }
  const actor=owner=>{assert(ready,'Owner readiness must be verified before lifecycle work');assert(actors.has(owner));return actors.get(owner);};
  const fixture=async request=>{
    actor(request.owner);
    const rendered=renderLiveFixtureSql(manifest,request.step,request);
    // The operator journals this exact SQL before dispatch on its one verified
    // connection. All fixture mutations include the shared generation fence.
    return executeFixture({...rendered,signal:request.signal});
  };
  return Object.freeze({
    async ready(){
      assert(!ready,'Readiness is single-use');
      for(const value of actors.values()){
        const result=await value.client.auth.getUser(value.token);
        assert.equal(result.error,null,'Synthetic owner verification failed');
        assert.equal(result.data.user?.id,value.owner.userId);assert.equal(result.data.user?.email,value.owner.email);
      }
      ready=true;return {ownersVerified:2};
    },
    async api({owner,route,body,signal}){
      const value=actor(owner),get=body===undefined;
      assert(get?route==='/api/coach/weekly':
        /^\/api\/coach\/(weekly(?:\/(?:review|convert))?|proposals\/[a-f0-9-]{36}\/accept|weekly\/reviews\/[a-f0-9-]{36}\/proposal)$/.test(route),'Unexpected lifecycle route');
      const response=await fetchImpl(LIVE_SETUP_TARGET.appOrigin+route,{method:get?'GET':'POST',
        headers:{'Content-Type':'application/json',Cookie:value.cookie},...(get?{}:{body:JSON.stringify(body)}),redirect:'error',signal});
      return {status:response.status,value:await readBoundedLiveJson(response)};
    },
    confirm:fixture,expire:fixture,seedLegacy:fixture,
    async revision({owner,signal}){
      const result=await actor(owner).client.from('coach_context_revisions').select('revision').eq('user_id',owner).abortSignal(signal).single();
      assert.equal(result.error,null);assert(Number.isSafeInteger(result.data.revision));return String(result.data.revision);
    },
    waitUntil:request=>waitForDatabaseExpiry(request,readDatabaseTime),
    async findReview({owner,idempotencyKey,signal}){
      const result=await actor(owner).client.from('coach_weekly_reviews').select('id,rationale').eq('user_id',owner).eq('idempotency_key',idempotencyKey).abortSignal(signal).single();
      assert.equal(result.error,null);return result.data;
    },
    async history({owner,planId,signal}){
      const client=actor(owner).client;
      const p=await client.from('training_plan_versions').select('id,user_id,intent,input_snapshot').eq('user_id',owner).eq('id',planId).abortSignal(signal).single();
      const s=await client.from('prescribed_sessions').select('id,plan_version_id,user_id,scheduled_date,week_number,session_index,prescription').eq('user_id',owner).eq('plan_version_id',planId).abortSignal(signal);
      assert.equal(p.error,null);assert.equal(s.error,null);return {plan:p.data,sessions:s.data};
    },
  });
}
