/**
 * Env-gated Nutrition5k manifest builder. Skipped unless RUN_BUILD_MANIFEST=1.
 * Reads the metadata CSV(s) + local imagery dir and writes a GoldenItem[] manifest.
 *
 * Example (after `gsutil -m cp -r gs://nutrition5k_dataset/imagery/realsense_overhead scripts/eval/data/nutrition5k/`):
 *   RUN_BUILD_MANIFEST=1 \
 *   N5K_CSV=scripts/eval/data/nutrition5k/dish_metadata_cafe1.csv,scripts/eval/data/nutrition5k/dish_metadata_cafe2.csv \
 *   N5K_IMAGES=scripts/eval/data/nutrition5k/realsense_overhead \
 *   N5K_LIMIT=150 N5K_OUT=scripts/eval/manifest.nutrition5k.json \
 *   npm test -- test/eval/build-manifest
 */
import { describe, it, expect } from 'vitest'
import { writeManifest } from '../../scripts/eval/build-manifest'

const RUN = process.env.RUN_BUILD_MANIFEST === '1'

describe.skipIf(!RUN)('Nutrition5k manifest build', () => {
  it('writes a manifest from the metadata CSV + local imagery', async () => {
    const csvPaths = (process.env.N5K_CSV ?? '').split(',').filter(Boolean)
    const imagesDir = process.env.N5K_IMAGES
    const outPath = process.env.N5K_OUT ?? 'scripts/eval/manifest.nutrition5k.json'
    expect(csvPaths.length, 'set N5K_CSV (comma list of dish_metadata CSVs)').toBeGreaterThan(0)
    expect(imagesDir, 'set N5K_IMAGES to the local imagery dir').toBeTruthy()

    const n = await writeManifest({
      csvPaths,
      imagesDir: imagesDir!,
      imagePattern: process.env.N5K_IMAGE_PATTERN,
      limit: process.env.N5K_LIMIT ? Number(process.env.N5K_LIMIT) : undefined,
      outPath,
    })
    console.log(`[build-manifest] wrote ${n} items -> ${outPath}`)
    expect(n).toBeGreaterThan(0)
  }, 120_000)
})
