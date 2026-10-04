import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { collectSourceClosure, verifyInventory } from './supervised-release-inventory.mjs'

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'socius-inventory-test-'))
  t.after(() => {
    assert.equal(path.dirname(root), fs.realpathSync(os.tmpdir()))
    assert.ok(path.basename(root).startsWith('socius-inventory-test-'))
    fs.rmSync(root, { recursive: true })
  })
  const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), text) }
  write('tsconfig.json', JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['./*'] } } }))
  return { root, write }
}

test('traces aliases, reexports, lazy imports and import types without reading packages', t => {
  const { root, write } = fixture(t)
  write('app/route.ts', "import '@/app/types'; export * from './public'; void import('./lazy'); type R=import('./record').R; import x from 'react'")
  for (const name of ['types', 'public', 'lazy', 'record']) write('app/' + name + '.ts', 'export type R=string')
  const result = collectSourceClosure(root, ['app/route.ts'])
  assert.equal(result.files.length, 5)
  assert.deepEqual(result.packages, ['react'])
  assert.ok(result.edges.some(e => e.to === 'app/record.ts' && e.kind === 'type'))
  assert.ok(result.edges.some(e => e.to === 'app/lazy.ts' && e.kind === 'lazy'))
  assert.deepEqual(verifyInventory(root, { schema: 1, files: result.files }), { checked: 5, sourceBytesMatch: true })
  write('app/lazy.ts', 'export const changed=true')
  assert.throws(() => verifyInventory(root, { schema: 1, files: result.files }), /Source changed: app\/lazy.ts/)
})

test('rejects computed and missing local modules rather than issuing an incomplete inventory', t => {
  const { root, write } = fixture(t)
  write('app/route.ts', 'const name="./lazy"; void import(name)')
  assert.throws(() => collectSourceClosure(root, ['app/route.ts']), /Computed import requires manual scope/)
  write('app/route.ts', 'export * from "./missing"')
  assert.throws(() => collectSourceClosure(root, ['app/route.ts']), /Unresolved local import/)
})

test('rejects escaping paths, linked source trees and duplicate receipt records', t => {
  const { root, write } = fixture(t)
  write('app/route.ts', 'export const safe=true')
  assert.throws(() => collectSourceClosure(root, ['../outside.ts']), /escapes repository/)
  fs.symlinkSync(path.join(root, 'app'), path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
  assert.throws(() => collectSourceClosure(root, ['linked/route.ts']), /Source link denied/)
  const result = collectSourceClosure(root, ['app/route.ts'])
  assert.throws(() => verifyInventory(root, { schema: 1, files: [...result.files, ...result.files] }), /Duplicate inventory path/)
})
