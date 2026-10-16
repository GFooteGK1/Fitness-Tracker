// Opt-in qualification. Never connects to a hosted database or writes nutrition history.
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { parseEnv } from 'node:util'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const dryRun = args.length === 1 && args[0] === '--dry-run'
const options = {}
if (!dryRun) {
  for (let i = 0; i < args.length; i++) {
    const option = args[i]
    if (option === '--approve-live') options.approved = true
    else if (['--photo', '--sha256', '--env-file'].includes(option) && args[i + 1] && !args[i + 1].startsWith('--') && !options[option]) options[option] = args[++i]
    else throw new Error('Use --dry-run, or --approve-live --photo PATH --sha256 HASH [--env-file PATH].')
  }
  if (!options.approved || !options['--photo'] || !/^[a-f0-9]{64}$/i.test(options['--sha256'] ?? '')) throw new Error('Explicit approval, a photo and its SHA-256 are required.')
  const bytes = readFileSync(resolve(options['--photo']))
  if (bytes.length < 1000 || bytes.length > 1024 * 1024 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new Error('This qualification requires a JPEG between 1 KB and 1 MB.')
  if (createHash('sha256').update(bytes).digest('hex') !== options['--sha256'].toLowerCase()) throw new Error('Photo does not match the approved SHA-256.')
}

// Pass only the Anthropic key from an env file, never Supabase/service-role credentials.
const key = dryRun ? 'unused-dry-run-key' : options['--env-file']
  ? parseEnv(readFileSync(resolve(options['--env-file']), 'utf8')).ANTHROPIC_API_KEY
  : process.env.ANTHROPIC_API_KEY
if (!key) throw new Error('ANTHROPIC_API_KEY is required in the secure environment.')
const output = resolve(root, 'output/photo-review-drafts')
mkdirSync(output, { recursive: true })
const attempt = resolve(output, `claude-live-attempt-${options['--sha256']?.toLowerCase()}.json`)
if (!dryRun) {
  // An interrupted or failed attempt is still an attempt. Never silently resend it.
  if (existsSync(attempt)) throw new Error('This photo already has a live-attempt marker. Inspect its receipt before authorizing another attempt.')
  writeFileSync(attempt, JSON.stringify({ startedAt: new Date().toISOString(), photoSha256: options['--sha256'].toLowerCase(), maximumHttpRequests: 1, maximumOutputTokens: 1024, hostedWrites: false }, null, 2), { flag: 'wx' })
}
const env = { ...process.env, DEBUG: 'false', ANTHROPIC_API_KEY: key, PHOTO_REVIEW_QUALIFICATION: dryRun ? 'dry' : 'live', PHOTO_REVIEW_QUALIFICATION_PHOTO: options['--photo'] ? resolve(options['--photo']) : '', PHOTO_REVIEW_QUALIFICATION_SHA256: options['--sha256']?.toLowerCase() ?? '' }
delete env.NODE_DEBUG
delete env.OPENAI_API_KEY
delete env.PHOTO_REVIEW_QUALIFICATION_RECEIPT
const result = spawnSync(process.execPath, [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run', 'test/qualification/photo-review-claude.test.ts'], { cwd: root, env, stdio: 'inherit', windowsHide: true })
if (!dryRun) {
  const started = JSON.parse(readFileSync(attempt, 'utf8'))
  writeFileSync(resolve(output, `claude-live-finish-${options['--sha256'].toLowerCase()}.json`), JSON.stringify({ ...started, finishedAt: new Date().toISOString(), exitCode: result.status, receipt: `claude-live-${options['--sha256'].toLowerCase()}-receipt.json`, retryAuthorized: false }, null, 2), { flag: 'wx' })
}
process.exit(result.status ?? 1)
