/**
 * Versioned presentation contract for AI-composed views (ADR-0001).
 *
 * The template may control ordering, visibility, and tone. It never contains
 * numeric fitness data or executable instructions; those come from the
 * deterministic aggregate layer.
 */

export const VIEW_TYPES = ['dashboard'] as const
export type ViewType = (typeof VIEW_TYPES)[number]

export const VIEW_SECTION_IDS = [
  'workout_summary',
  'personal_records',
  'recovery',
  'nutrition',
  'leaderboard',
] as const
export type ViewSectionId = (typeof VIEW_SECTION_IDS)[number]

export const VIEW_TONES = ['concise', 'coaching', 'analytical'] as const
export type ViewTone = (typeof VIEW_TONES)[number]

export interface ViewTemplateSection {
  id: ViewSectionId
  visible: boolean
}

export interface ViewTemplateConfig {
  schemaVersion: 1
  tone: ViewTone
  showNarrative: boolean
  sections: ViewTemplateSection[]
}

export interface StoredViewTemplate {
  id: string | null
  viewType: ViewType
  version: number
  template: ViewTemplateConfig
  source: 'user' | 'default' | 'built-in'
  createdAt: string | null
}

export const DEFAULT_DASHBOARD_VIEW_TEMPLATE: ViewTemplateConfig = {
  schemaVersion: 1,
  tone: 'concise',
  showNarrative: true,
  sections: [
    { id: 'personal_records', visible: true },
    { id: 'recovery', visible: true },
    { id: 'workout_summary', visible: true },
    { id: 'nutrition', visible: true },
    { id: 'leaderboard', visible: true },
  ],
}

const CONFIG_KEYS = new Set(['schemaVersion', 'tone', 'showNarrative', 'sections'])
const SECTION_KEYS = new Set(['id', 'visible'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>) {
  return Object.keys(value).every(key => allowed.has(key))
}

export function isViewType(value: string): value is ViewType {
  return VIEW_TYPES.includes(value as ViewType)
}

export function validateViewTemplate(value: unknown):
  | { ok: true; value: ViewTemplateConfig }
  | { ok: false; errors: string[] } {
  const errors: string[] = []

  if (!isRecord(value)) {
    return { ok: false, errors: ['template must be an object'] }
  }
  if (!hasOnlyKeys(value, CONFIG_KEYS)) {
    errors.push('template contains unsupported fields')
  }
  if (value.schemaVersion !== 1) {
    errors.push('schemaVersion must be 1')
  }
  if (!VIEW_TONES.includes(value.tone as ViewTone)) {
    errors.push(`tone must be one of: ${VIEW_TONES.join(', ')}`)
  }
  if (typeof value.showNarrative !== 'boolean') {
    errors.push('showNarrative must be a boolean')
  }
  if (!Array.isArray(value.sections) || value.sections.length === 0) {
    errors.push('sections must be a non-empty array')
  } else {
    const seen = new Set<string>()
    for (const [index, section] of value.sections.entries()) {
      if (!isRecord(section)) {
        errors.push(`sections[${index}] must be an object`)
        continue
      }
      if (!hasOnlyKeys(section, SECTION_KEYS)) {
        errors.push(`sections[${index}] contains unsupported fields`)
      }
      if (!VIEW_SECTION_IDS.includes(section.id as ViewSectionId)) {
        errors.push(`sections[${index}].id is not supported`)
      } else if (seen.has(section.id as string)) {
        errors.push(`sections contains duplicate id: ${section.id as string}`)
      } else {
        seen.add(section.id as string)
      }
      if (typeof section.visible !== 'boolean') {
        errors.push(`sections[${index}].visible must be a boolean`)
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value: value as unknown as ViewTemplateConfig }
}
