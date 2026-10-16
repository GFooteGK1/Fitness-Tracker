import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url), out = 'output/playwright/reviewed-browser-build'
mkdirSync(out, { recursive: true })
await build({ entryPoints: ['scripts/release/reviewed-browser-entry.tsx'], outfile: `${out}/bundle.js`, bundle: true,
  platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'warning' })
await build({ entryPoints: ['scripts/release/reviewed-browser-server.ts'], outfile: `${out}/server.cjs`, bundle: true,
  platform: 'node', format: 'cjs', packages: 'external', logLevel: 'warning' })
const css = spawnSync(process.execPath, [require.resolve('tailwindcss/lib/cli.js'), '-i', 'app/globals.css', '-o', `${out}/style.css`],
  { stdio: 'inherit', windowsHide: true })
if (css.status !== 0) throw new Error('Local stylesheet compilation failed')
console.log('Local browser harness compiled; no server or database action performed.')
