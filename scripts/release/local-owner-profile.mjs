// The caller must sign in with the synthetic owner's anon-key client first.
// The production BEFORE INSERT trigger derives ownership from that session.
export async function provisionLocalOwnerProfile(client, expectedOwnerId) {
  const identity = await client.auth.getUser();
  if (identity.error || !expectedOwnerId || identity.data.user?.id !== expectedOwnerId) {
    throw new Error('Local profile requires the expected authenticated owner');
  }
  const result = await client.from('user_profiles').upsert({
    user_id: expectedOwnerId,
    fitness_goals: ['performance'],
    body_metrics: { age: 35, height_cm: 175, weight_kg: 75 },
    preferences: { units: 'imperial', notifications: false, privacy_level: 'private' },
  }).select('user_id').single();
  if (result.error || result.data?.user_id !== expectedOwnerId) {
    throw new Error(`Local owner profile provisioning failed: ${result.error?.code ?? 'identity mismatch'}`);
  }
}
