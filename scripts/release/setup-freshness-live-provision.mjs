// Explicit new synthetic identities only. The caller selects the fixed target,
// supplies bounded clients, and obtains separate account-creation authority.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {validateLiveSetupManifest} from './setup-freshness-live-contract.mjs';

export async function provisionLiveSetupOwners(input,{evidence,admin,ownerClient}) {
  const manifest=structuredClone(input);validateLiveSetupManifest(manifest);
  const sessions={};
  for(const owner of Object.values(manifest.owners)) {
    const password=randomUUID()+randomUUID();
    const attributes={id:owner.userId,email:owner.email,password,email_confirm:true};
    await evidence.record(`provision-${owner.label}-intent`,attributes);
    const created=await admin.auth.admin.createUser(attributes);
    // Save the response before checking it. An uncertain/failed create never
    // authorizes another create, even if the process is restarted.
    await evidence.record(`provision-${owner.label}-result`,created);
    assert.equal(created.error,null,'Synthetic owner create failed');
    assert.equal(created.data.user?.id,owner.userId);assert.equal(created.data.user?.email,owner.email);
    const client=ownerClient();
    await evidence.record(`signin-${owner.label}-intent`,{owner:owner.userId});
    const signed=await client.auth.signInWithPassword({email:owner.email,password});
    await evidence.record(`signin-${owner.label}-result`,signed);
    assert.equal(signed.error,null,'Synthetic sign-in failed');assert.equal(signed.data.user?.id,owner.userId);
    const identity=await client.auth.getUser();assert.equal(identity.error,null);assert.equal(identity.data.user?.id,owner.userId);
    const profile={user_id:owner.userId,fitness_goals:['performance'],body_metrics:{age:35,height_cm:175,weight_kg:75},
      preferences:{units:'imperial',notifications:false,privacy_level:'private'}};
    await evidence.record(`profile-${owner.label}-intent`,profile);
    const saved=await client.from('user_profiles').upsert(profile).select('user_id').single();
    await evidence.record(`profile-${owner.label}-result`,saved);
    assert.equal(saved.error,null,'Synthetic owner profile failed');assert.equal(saved.data?.user_id,owner.userId);
    sessions[owner.userId]=signed.data.session;
  }
  await evidence.record('owner-sessions',sessions);
  return {ownersProvisioned:2};
}
