import { createHash } from 'node:crypto'

// Fixed feature filter for the previously verified owner; not authentication,
// a credential, or a grant. Canonical lowercase UUID only; no runtime selector.
const ownerDigest = '2bf29505900fa586ff4ff34b6f049944c0f44fcc7786ffb5ac6acb1d66b76543'
export function isWhoopTimingOwner(userId: unknown): boolean {
  return typeof userId === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(userId)
    && createHash('sha256').update(userId, 'utf8').digest('hex') === ownerDigest
}
