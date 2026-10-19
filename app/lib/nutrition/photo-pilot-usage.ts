import { PHOTO_ESTIMATION_MODEL, type PhotoPaidStage } from './photo-pilot-budget'

export const PHOTO_USAGE_RATE = 'openai-usage-ceiling-2026-10-19-v1'
export interface PhotoUsageEvidence {
  provider: 'openai'; endpoint: 'decisions' | 'responses'; model: string
  receiptId: string; inputTokens: number; outputTokens: number; totalTokens: number
  serviceTier: 'fixed-decisions' | 'default'; ratePolicy: typeof PHOTO_USAGE_RATE
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0

/** Only the server provider-response path supplies this evidence. Missing generic
 * usage defaults, owner JSON and persisted meal data confer no settlement right. */
export function photoUsageEvidence(stage: PhotoPaidStage, model: unknown, value: unknown): PhotoUsageEvidence | undefined {
  if (!record(value) || model !== (stage === 'screen' ? 'gpt-6-luna' : PHOTO_ESTIMATION_MODEL)
    || typeof value.receiptId !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(value.receiptId)
    || !count(value.inputTokens) || value.inputTokens < 1 || value.inputTokens > 1_050_000
    || !count(value.outputTokens) || value.outputTokens > (stage === 'screen' ? 0 : 1024)
    || (stage === 'estimate' && value.outputTokens === 0)
    || !count(value.totalTokens) || value.totalTokens !== value.inputTokens + value.outputTokens
    || value.serviceTier !== (stage === 'screen' ? 'fixed-decisions' : 'default')) return undefined
  return { provider: 'openai', endpoint: stage === 'screen' ? 'decisions' : 'responses', model: model as string,
    receiptId: (stage === 'screen' ? 'decisions:' : 'responses:') + value.receiptId,
    inputTokens: value.inputTokens, outputTokens: value.outputTokens, totalTokens: value.totalTokens,
    serviceTier: value.serviceTier as PhotoUsageEvidence['serviceTier'], ratePolicy: PHOTO_USAGE_RATE }
}

/** No cache discounts. Conservative qualified premium ceilings, rounded UP. */
export function photoUsageMicroUsd(stage: PhotoPaidStage, evidence: PhotoUsageEvidence): number {
  const hundredths = stage === 'screen' ? BigInt(evidence.inputTokens) * BigInt(22)
    : BigInt(evidence.inputTokens) * BigInt(55) + BigInt(evidence.outputTokens) * BigInt(198)
  return Number((hundredths + BigInt(99)) / BigInt(100))
}
