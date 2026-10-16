/** Fixed local launcher; no dotenv or inherited provider/production credentials. */
import { spawn } from 'node:child_process'
const runId = process.argv[2]
if (process.argv.length !== 3 || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(runId ?? '')) throw Error('Fresh local run UUID required')
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|HOMEDRIVE|HOMEPATH)$/i.test(key)))
const child = spawn(process.execPath, ['output/playwright/supervised-browser-build/server.cjs', runId], {
  windowsHide: true, stdio: 'inherit', env: { ...env, NODE_ENV: 'test', SOCIUS_LOCAL_SUPERVISED_BROWSER: 'true' }
})
// Windows child.kill forcibly terminates the target, bypassing its readback.
// Keep the child alive for the explicit exact-run finalization marker.
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  console.error('Use node scripts/release/finalize-supervised-browser.mjs with this exact run UUID; no forced child termination.')
})
child.on('error', () => { process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
