import { createHash } from 'node:crypto'

/** Activation requires a reviewed code change after the retention, cost, credential,
 * storage-policy and migration gates. Existing environment flags cannot enable it. */
export const NUTRITION_PHOTO_PILOT_ACTIVE = false
export const nutritionPhotoPilotEnabled = () => NUTRITION_PHOTO_PILOT_ACTIVE
const ownerDigest = '2bf29505900fa586ff4ff34b6f049944c0f44fcc7786ffb5ac6acb1d66b76543'
export function nutritionPhotoPilotOwner(userId: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(userId)
    && createHash('sha256').update(userId).digest('hex') === ownerDigest
}
