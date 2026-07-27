import {
  buildDashboardNarrativeRequest,
  createDashboardFactsFingerprint,
  createDashboardTemplateFingerprint,
  hasVisibleDashboardNarrativeFacts,
  parseDashboardNarrative,
  type DashboardNarrativeComposition,
  type DashboardNarrativeFacts,
} from '@/app/lib/dashboard-narrative'
import type { LlmRequest, LlmStopReason } from '@/app/lib/llm/types'
import type { ViewTemplateConfig } from '@/app/lib/view-templates'

interface NarrativeTemplate {
  version: number
  template: ViewTemplateConfig
}

interface CacheKey {
  userId: string
  localDate: string
  templateVersion: number
  templateFingerprint: string
  factsFingerprint: string
}

interface CachedNarrative {
  composition: DashboardNarrativeComposition
  generatedAt: string
}

interface SaveNarrative extends CacheKey, CachedNarrative {
  provider: string
  model: string
}

export interface DashboardNarrativeStore {
  getTemplate(userId: string): Promise<NarrativeTemplate>
  getFacts(userId: string, localDate: string): Promise<DashboardNarrativeFacts>
  getCached(key: CacheKey): Promise<CachedNarrative | null>
  saveCached(value: SaveNarrative): Promise<void>
}

interface NarrativeCompletion {
  text: string
  provider: string
  model: string
  stopReason?: LlmStopReason
}

type CompleteNarrative = (request: LlmRequest) => Promise<NarrativeCompletion>

export type DashboardNarrativeResult =
  | { status: 'disabled' | 'empty'; composition: null }
  | {
      status: 'ready'
      cached: boolean
      composition: DashboardNarrativeComposition
      generatedAt: string
    }

export async function getDashboardNarrative({
  userId,
  localDate,
  store,
  complete,
  now = () => new Date(),
}: {
  userId: string
  localDate: string
  store: DashboardNarrativeStore
  complete: CompleteNarrative
  now?: () => Date
}): Promise<DashboardNarrativeResult> {
  const { version, template } = await store.getTemplate(userId)
  if (!template.showNarrative) return { status: 'disabled', composition: null }

  const facts = await store.getFacts(userId, localDate)
  if (!hasVisibleDashboardNarrativeFacts(template, facts)) {
    return { status: 'empty', composition: null }
  }

  const factsFingerprint = createDashboardFactsFingerprint(facts)
  const templateFingerprint = createDashboardTemplateFingerprint(template)
  const key = {
    userId,
    localDate,
    templateVersion: version,
    templateFingerprint,
    factsFingerprint,
  }
  const cached = await store.getCached(key)
  if (cached) {
    const validated = parseDashboardNarrative(
      JSON.stringify(cached.composition), template, facts,
    )
    if (validated) {
      return {
        status: 'ready', cached: true, composition: validated,
        generatedAt: cached.generatedAt,
      }
    }
  }

  const result = await complete(buildDashboardNarrativeRequest(template, facts))
  if (result.stopReason === 'refusal') throw new Error('LLM refused dashboard narrative')
  if (result.stopReason === 'max_tokens') {
    throw new Error('LLM dashboard narrative hit the output token limit')
  }

  const composition = parseDashboardNarrative(result.text, template, facts)
  if (!composition) throw new Error('LLM returned an invalid dashboard narrative')

  const generatedAt = now().toISOString()
  await store.saveCached({
    ...key,
    composition,
    generatedAt,
    provider: result.provider,
    model: result.model,
  })

  return { status: 'ready', cached: false, composition, generatedAt }
}
