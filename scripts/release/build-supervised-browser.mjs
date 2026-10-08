import { build } from 'esbuild'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url), out = 'output/playwright/supervised-browser-build'
mkdirSync(out, { recursive: true })
const browser = await build({ entryPoints: ['scripts/release/supervised-browser-entry.tsx'], outfile: `${out}/bundle.js`, bundle: true, metafile: true,
  platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'warning' })
const server = await build({ entryPoints: ['scripts/release/supervised-browser-server.ts'], outfile: `${out}/server.cjs`, bundle: true, metafile: true,
  platform: 'node', format: 'cjs', packages: 'external', logLevel: 'warning' })
const css = spawnSync(process.execPath, [require.resolve('tailwindcss/lib/cli.js'), '-i', 'app/globals.css', '-o', `${out}/style.css`],
  { stdio: 'inherit', windowsHide: true })
if (css.status !== 0) throw Error('Local stylesheet compilation failed')
const source = [...new Set([...Object.keys(browser.metafile.inputs), ...Object.keys(server.metafile.inputs),
  'scripts/release/build-supervised-browser.mjs', 'scripts/release/start-supervised-browser.mjs',
  'scripts/release/finalize-supervised-browser.mjs', 'scripts/release/verify-supervised-browser.mjs',
  'app/globals.css', 'tailwind.config.ts', 'package-lock.json'])]
  .filter(path => !path.startsWith('node_modules/')).sort()
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex')
writeFileSync(`${out}/manifest.json`, JSON.stringify({ builtAt: new Date().toISOString(), source: Object.fromEntries(source.map(path => [path, sha(path)])),
  output: Object.fromEntries(['bundle.js', 'server.cjs', 'style.css'].map(name => [name, sha(`${out}/${name}`)])) }, null, 2))
console.log('Supervised browser harness compiled. No server or database action performed.')
