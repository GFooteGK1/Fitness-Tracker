/**
 * Build an eval manifest from a Nutrition5k metadata CSV (ADR-0002 accuracy layer).
 *
 * Nutrition5k ships per-dish ground truth in `metadata/dish_metadata_cafe{1,2}.csv`.
 * Each row starts with the dish-level totals, then repeating per-ingredient fields:
 *   dish_id, total_calories, total_mass, total_fat, total_carb, total_protein, <ingredients...>
 * The imagery (overhead RGB etc.) is NOT in the git repo — pull it from the GCS
 * bucket (gs://nutrition5k_dataset) into a local dir first.
 */
import { readFile, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import type { GoldenItem, MacroTruth } from './types'

export interface ParsedDish {
  dishId: string
  truth: MacroTruth
}

/** Parse one dish_metadata CSV row into dish totals. Returns null for header/blank/malformed. */
export function parseNutrition5kRow(line: string): ParsedDish | null {
  const f = line.split(',')
  if (f.length < 6) return null
  const dishId = f[0].trim()
  if (!dishId || dishId === 'dish_id') return null
  const calories = Number(f[1])
  const mass = Number(f[2])
  const fat = Number(f[3])
  const carb = Number(f[4])
  const protein = Number(f[5])
  if ([calories, mass, fat, carb, protein].some((n) => !Number.isFinite(n))) return null
  return { dishId, truth: { protein, carbs: carb, fat, calories, mass_g: mass } }
}

export interface BuildOptions {
  /** One or more dish_metadata CSV paths. */
  csvPaths: string[]
  /** Local directory holding the pulled imagery. */
  imagesDir: string
  /** Path template; `{dish}` is replaced with the dish id. Default: <dir>/{dish}/rgb.png */
  imagePattern?: string
  /** Cap the number of items (sample). */
  limit?: number
  /** Skip dishes whose image file is missing locally (default true). */
  requireImage?: boolean
}

/** Build (and return) a GoldenItem[] from Nutrition5k metadata + local imagery. */
export async function buildNutrition5kManifest(opts: BuildOptions): Promise<GoldenItem[]> {
  const { csvPaths, imagesDir, limit } = opts
  const requireImage = opts.requireImage ?? true
  const pattern = opts.imagePattern ?? join(imagesDir, '{dish}', 'rgb.png')

  const items: GoldenItem[] = []
  for (const csvPath of csvPaths) {
    const text = await readFile(csvPath, 'utf-8')
    for (const line of text.split('\n')) {
      if (limit && items.length >= limit) break
      const dish = parseNutrition5kRow(line)
      if (!dish) continue
      const imagePath = pattern.replace('{dish}', dish.dishId)
      if (requireImage) {
        try {
          await access(imagePath)
        } catch {
          continue // image not pulled locally — skip
        }
      }
      items.push({ id: dish.dishId, imagePath, mediaType: 'image/png', truth: dish.truth })
    }
  }
  return items
}

/** Convenience: build and write the manifest to `outPath`. */
export async function writeManifest(opts: BuildOptions & { outPath: string }): Promise<number> {
  const items = await buildNutrition5kManifest(opts)
  await writeFile(opts.outPath, JSON.stringify(items, null, 2))
  return items.length
}
