/**
 * Env-gated Supabase puller (ADR-0002 consistency layer). Skipped unless
 * RUN_SUPABASE_PULL=1. Reads production data with the service-role key and
 * downloads photos locally — never CI.
 *
 * Example:
 *   RUN_SUPABASE_PULL=1 \
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   SUPABASE_SAMPLE=100 SUPABASE_MANIFEST_OUT=scripts/eval/manifest.supabase.json \
 *   npm test -- test/eval/pull-supabase
 *
 * The emitted manifest's `truth` = stored (AI-estimated) macros, so run it
 * through the eval as a CONSISTENCY layer (divergence from current production),
 * NOT as accuracy.
 */
import { describe, it, expect } from 'vitest'
import { writeFile } from 'node:fs/promises'
import { pullSupabaseSample } from '../../scripts/eval/pull-supabase'

const RUN = process.env.RUN_SUPABASE_PULL === '1'

describe.skipIf(!RUN)('Supabase sample pull (live)', () => {
  it('downloads a sample and writes a manifest', async () => {
    const limit = Number(process.env.SUPABASE_SAMPLE ?? '100')
    const out = process.env.SUPABASE_MANIFEST_OUT ?? 'scripts/eval/manifest.supabase.json'

    const items = await pullSupabaseSample({ limit })
    await writeFile(out, JSON.stringify(items, null, 2))
    console.log(`[pull] wrote ${items.length} items -> ${out}`)

    expect(items.length).toBeGreaterThan(0)
  }, 600_000)
})
