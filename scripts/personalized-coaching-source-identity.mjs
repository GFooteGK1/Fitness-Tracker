/** Freeze a local runtime/test/migration identity without committing or reading secrets. */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const roots = [
  'app', 'e2e', 'test', 'scripts', 'supabase', 'docs/migrations',
  'package.json', 'package-lock.json', 'next.config.ts', 'next.config.js',
  'next.config.mjs', 'tsconfig.json', 'vitest.config.ts', 'playwright.config.ts',
  'tailwind.config.ts', 'postcss.config.mjs', '.eslintrc.json',
]
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', windowsHide: true })
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const files = [...new Set(git('ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...roots).split('\0').filter(Boolean))].sort()
const entries = files.map(path => {
  try { const bytes = readFileSync(path); return { path, bytes: bytes.length, sha256: sha256(bytes) } }
  catch (error) { if (error.code === 'ENOENT') return { path, deleted: true }; throw error }
})
const patch = git('diff', '--binary', '--no-ext-diff', 'HEAD', '--', ...roots)
const base = git('rev-parse', 'HEAD').trim()
const branch = git('branch', '--show-current').trim()
const identity = sha256(JSON.stringify({ base, entries }))
const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const folder = resolve('output/app-quality-release/personalized-coaching', `source-${stamp}`)
mkdirSync(folder, { recursive: true })
writeFileSync(resolve(folder, 'tracked.patch'), patch, 'utf8')
writeFileSync(resolve(folder, 'identity.json'), JSON.stringify({
  version: 1, capturedAt: new Date().toISOString(), base, branch, identity,
  trackedPatchSha256: sha256(patch), scope: roots,
  limits: 'Complete listed source content includes untracked files. Tracked patch alone excludes new files. Narrative reports, screenshots, environment files and runtime output are intentionally outside source identity. No commit or production verification is implied.',
  entries,
}, null, 2) + '\n', 'utf8')
process.stdout.write(JSON.stringify({ base, branch, identity, trackedPatchSha256: sha256(patch), files: entries.length, folder }) + '\n')
