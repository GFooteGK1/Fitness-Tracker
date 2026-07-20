/**
 * Pull a sample of production meal photos from Supabase into an eval manifest.
 *
 * IMPORTANT: the macros this produces as `truth` are the app's OWN stored
 * estimates (`total_*`), NOT ground truth. A manifest built here is therefore a
 * CONSISTENCY set — running it through the eval runner measures how far a
 * candidate model diverges from CURRENT production behavior, not accuracy.
 * (Accuracy needs Nutrition5k / in-app weighed labels — see ADR-0002.)
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (service role
 * bypasses RLS to read across users). Invoked from the gated test, never CI.
 */
import { createClient } from '@supabase/supabase-js'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { GoldenItem, MacroTruth } from './types'

const STORAGE_BUCKET = 'meal-photos'

// ─── Pure helpers (unit-tested) ─────────────────────────────────────────

export function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s)
}

export function mediaTypeFromPath(p: string): GoldenItem['mediaType'] {
  const lower = p.toLowerCase().split('?')[0]
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  return 'image/jpeg'
}

export interface MealRow {
  id: string
  user_id: string
  photo_url: string | null
  // Supabase DECIMAL columns arrive as strings — coerce.
  total_protein: number | string
  total_carbs: number | string
  total_fat: number | string
  total_calories: number | string
}

export function mealRowToTruth(row: MealRow): MacroTruth {
  return {
    protein: Number(row.total_protein),
    carbs: Number(row.total_carbs),
    fat: Number(row.total_fat),
    calories: Number(row.total_calories),
  }
}

/** Storage path from a stored photo_url — mirrors app/lib/storage.ts cleanup logic. */
export function deriveStoragePath(photoUrl: string, userId: string): string {
  const fileName = photoUrl.split('/').pop()!.split('?')[0]
  return `meals/${userId}/${fileName}`
}

// ─── I/O (gated) ─────────────────────────────────────────────────────────

export interface PullOptions {
  limit?: number
  outDir?: string
}

/**
 * Select up to `limit` meals with a photo, download each image locally, and
 * return a GoldenItem[] whose `truth` is the stored (AI-estimated) macros.
 */
export async function pullSupabaseSample(opts: PullOptions = {}): Promise<GoldenItem[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('pullSupabaseSample requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  }
  const limit = opts.limit ?? 100
  const outDir = opts.outDir ?? 'scripts/eval/data/supabase'

  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const { data, error } = await supabase
    .from('meals')
    .select('id, user_id, photo_url, total_protein, total_carbs, total_fat, total_calories')
    .not('photo_url', 'is', null)
    .limit(limit)
  if (error) throw new Error(`Supabase select failed: ${error.message}`)

  const items: GoldenItem[] = []
  for (const row of (data ?? []) as MealRow[]) {
    if (!row.photo_url) continue
    const mediaType = mediaTypeFromPath(row.photo_url)
    const ext = mediaType === 'image/jpeg' ? 'jpg' : mediaType.split('/')[1]
    const imagePath = join(outDir, `${row.id}.${ext}`)

    let bytes: Buffer
    if (isHttpUrl(row.photo_url)) {
      const res = await fetch(row.photo_url)
      if (!res.ok) {
        console.warn(`[pull] skip ${row.id}: fetch ${res.status}`)
        continue
      }
      bytes = Buffer.from(await res.arrayBuffer())
    } else {
      const path = deriveStoragePath(row.photo_url, row.user_id)
      const { data: blob, error: dlErr } = await supabase.storage.from(STORAGE_BUCKET).download(path)
      if (dlErr || !blob) {
        console.warn(`[pull] skip ${row.id}: download ${dlErr?.message ?? 'no blob'}`)
        continue
      }
      bytes = Buffer.from(await blob.arrayBuffer())
    }

    await mkdir(dirname(imagePath), { recursive: true })
    await writeFile(imagePath, bytes)
    items.push({ id: row.id, imagePath, mediaType, truth: mealRowToTruth(row) })
  }

  return items
}
