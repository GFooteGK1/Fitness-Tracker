/** Conservative reservations, not measured billing. See the dated cost proof. */
export const PHOTO_BUDGET_POLICY = 'openai-owner-30d-v1'
export const PHOTO_ESTIMATION_MODEL = 'gpt-5.6-luna'
export const PHOTO_STAGE_RESERVE = { screen: 250_000, estimate: 600_000 } as const
export type PhotoPaidStage = keyof typeof PHOTO_STAGE_RESERVE

/** Acknowledgement is usable only in this execution, once, shortly after RPC.
 * Status/replay reads do not create dispatch authority. Lost grants stay spent. */
export function photoDispatchGuard(receipt: unknown, stage: PhotoPaidStage, captureId: string,
  rpcStartedAt: number): () => void {
  const grant = receipt as Record<string, unknown> | null
  const model = stage === 'screen' ? 'gpt-6-luna' : PHOTO_ESTIMATION_MODEL
  if (!grant || grant.policy !== PHOTO_BUDGET_POLICY || grant.stage !== stage || grant.captureId !== captureId
    || grant.model !== model || grant.reservedMicroUsd !== PHOTO_STAGE_RESERVE[stage]
    || typeof grant.remainingMs !== 'number' || !Number.isFinite(grant.remainingMs) || grant.remainingMs < 60_000) {
    throw new Error('Paid admission was not acknowledged')
  }
  let consumed = false
  return () => {
    const elapsed = performance.now() - rpcStartedAt
    if (consumed || !Number.isFinite(elapsed) || elapsed < 0 || elapsed >= 10_000
      || elapsed + 45_000 >= (grant.remainingMs as number)) throw new Error('Paid admission expired or was already used')
    consumed = true
  }
}
