import { beforeAll, afterAll, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { qwikPrivateFixture, seedPrivateOwner, privateActor } from '../database/qwik-private-fixture'

const owner = '99999999-9999-4999-8999-999999999999', other = '88888888-8888-4888-8888-888888888888'
let db: PGlite | undefined, root: string
beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'socius-qwik-private-durable-'))
  writeFileSync(join(root,'fixture-marker.json'), JSON.stringify({kind:'qwik-private-disposable-v1'}), {flag:'wx'})
  db = await qwikPrivateFixture({dataDir:join(root,'store')})
  await seedPrivateOwner(db, owner); await seedPrivateOwner(db, other); await privateActor(db, owner)
}, 30000)
afterAll(async () => { await db?.close() })

it('reads exact persisted private bytes in fresh owner and foreign-owner processes after the writer closes', async () => {
  const deadline = performance.now() + 30000
  const original = new TextEncoder().encode('\ufeff[ {"id":"synthetic-only", "bar_path":[0.1,-0.2],"unknown":{"numeric":"001.20","null":null}} ]\n')
  writeFileSync(join(root,'source.bin'), original, {flag:'wx'})
  await db!.close(); db = undefined // Seeded empty DB has no original yet.
  const run = promisify(execFile), script = resolve('test/fixtures/qwik-private-fresh-reader.cjs')
  // Preserve only the synthetic runner environment; no service keys/profile state.
  const env: NodeJS.ProcessEnv = { NODE_ENV:'test', SOCIUS_QWIK_DISPOSABLE:'true' }
  for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'PATHEXT', 'TEMP', 'TMP', 'TMPDIR']) {
    if (process.env[key]) env[key] = process.env[key]
  }
  // The qualification runner explicitly supplies its reviewed network veto.
  // Never forward arbitrary NODE_OPTIONS or provider credentials to children.
  const guard = process.env.SOCIUS_QWIK_NETWORK_GUARD
  if (guard) env.NODE_OPTIONS = `--require="${resolve(guard).replaceAll('\\', '/')}"`
  // All three sequential children share a 30s envelope inside the unchanged
  // 40s case. execFile settles after its owned child's close, including timeout.
  const runChild = (args: string[]) => {
    const remaining = Math.floor(deadline - performance.now())
    if (remaining <= 0) throw new Error('Synthetic child sequence deadline exceeded')
    return run(process.execPath,args,{env,timeout:Math.min(15000,remaining),maxBuffer:4096,windowsHide:true})
  }
  const written = await runChild([script,'write',root,owner])
  expect(written.stderr).toBe(''); const saved = JSON.parse(written.stdout)
  expect(saved.sha256).toBe(createHash('sha256').update(original).digest('hex')); expect(saved.byteLength).toBe(original.length)
  // execFile resolves only after the dedicated writer process has exited.
  writeFileSync(join(root,'source.bin'), new TextEncoder().encode('Synthetic input deliberately no longer contains the original'))
  const a = await runChild([script,'read',root,owner,saved.artifactId])
  expect(a.stderr).toBe('')
  const read = JSON.parse(a.stdout)
  expect(read).toMatchObject({state:'available',sha256:createHash('sha256').update(original).digest('hex'),byteLength:original.length,ownerMatches:true})
  expect(read.pid).not.toBe(saved.pid); expect(read.pid).not.toBe(process.pid)
  const b = await runChild([script,'read',root,other,saved.artifactId])
  expect(b.stderr).toBe(''); const foreign = JSON.parse(b.stdout)
  expect(foreign.state).toBe('missing_or_unauthorized'); expect(foreign.pid).not.toBe(read.pid)
  const receipt = {version:'synthetic-private-durability-1',writerPid:saved.pid,readerPid:read.pid,
    foreignReaderPid:foreign.pid,sha256:read.sha256,byteLength:read.byteLength,
    originalInputOverwritten:true,ownerState:read.state,foreignState:foreign.state}
  writeFileSync(join(root,'verification-receipt.json'),JSON.stringify(receipt),{flag:'wx'})
  console.info('[qwik-private-durability] '+JSON.stringify(receipt))
  // Evidence stays in the checked task-local TEMP directory; no recursive cleanup.
}, 40000)
