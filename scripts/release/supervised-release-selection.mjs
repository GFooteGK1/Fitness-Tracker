/** Prepare a filesystem-only review snapshot. No index, commit, install or hosted actions. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { buildSupervisedReleaseInventory, verifyInventory } from './supervised-release-inventory.mjs'

if (process.argv.length !== 2) throw Error('Fixed repository selection only')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true })
const indexPath = git('rev-parse', '--path-format=absolute', '--git-path', 'index').trim()
const indexBeforeSha256 = sha(fs.readFileSync(indexPath))
const inventory = buildSupervisedReleaseInventory()
if (inventory.branch !== 'codex/programming-quality' || inventory.globalNumericalPolicy !== false) throw Error('Wrong branch or policy')
verifyInventory(root, inventory)
const runtime = new Set(inventory.changedInScope)
const changed = [...new Set([...inventory.changedInScope, ...inventory.changedOutsideScope])].sort()
const separateEvidence = new Set([
  'docs/verification/programming-quality/holdout-preparer-receipt.md',
  'docs/verification/programming-quality/holdout-scenario.schema.json',
  'docs/verification/programming-quality/holdout-v1-manifest.json',
  'handoffs/investigations/Fitness-Tracker-i40.16.md',
])
function group(name) {
  if (separateEvidence.has(name) || /^docs\/verification\/programming-quality\/project-board-/.test(name)) return null
  if (runtime.has(name)) return name.startsWith('supabase/') ? 'migration' : 'runtime'
  if (['.gitignore', '.gitattributes'].includes(name)) return 'repository_configuration'
  if (name.startsWith('test/coach/programming-') || name.startsWith('test/fixtures/programming-')
    || name.startsWith('test/fixtures/frozen-whole-week-development-v1/')
    || name === 'test/fixtures/reviewed-hypertrophy-week.json'
    || name.startsWith('scripts/programming-') || name === 'scripts/jev-choice-contract.ts') return 'research_development'
  if (name.startsWith('test/')) return 'regression_support'
  if (name.startsWith('scripts/release/')) return 'local_qualification_operator'
  if (name === 'e2e/reviewed-week.pw.ts') return 'browser_regression'
  if (name.startsWith('docs/verification/programming-quality/') || name.startsWith('docs/decisions/')
    || name.startsWith('docs/architecture/') || name === 'docs/coach/initial-dose-policy-0.2-review.md'
    || ['docs/plans/jev-programming-decision-check.md', 'docs/plans/programming-readiness-assessment-2026-09-29.md',
      'docs/plans/whole-week-strategy-design.md'].includes(name)) return 'review_evidence'
  if (name === 'handoffs/programming-quality.md' || /^handoffs\/investigations\/Fitness-Tracker-(i40|u5l\.6)/.test(name)
    || name === 'handoffs/investigations/programming-quality-validation.md') return 'handoff'
  return null
}
function source(name) {
  if (path.isAbsolute(name) || name.includes('\\') || name.split('/').some(p => !p || p === '.' || p === '..')) throw Error('Unsafe source path')
  let cursor = root
  for (const part of name.split('/')) {
    cursor = path.join(cursor, part)
    if (fs.lstatSync(cursor).isSymbolicLink()) throw Error('Source link denied: ' + name)
  }
  if (!fs.statSync(cursor).isFile()) throw Error('Deleted or nonfile source requires separate review: ' + name)
  return fs.readFileSync(cursor)
}
const selected = changed.filter(name => group(name)).map(name => {
  const bytes = source(name)
  return { path: name, group: group(name), bytes: bytes.length, sha256: sha(bytes) }
})
const deferred = changed.filter(name => !group(name)).map(name => ({ path: name,
  reason: separateEvidence.has(name) || /^docs\/verification\/programming-quality\/project-board-/.test(name)
    ? 'Separate holdout custody or board setup evidence; preserved outside this milestone-one package.'
    : name.startsWith('output/') || name.startsWith('.playwright-cli/') ? 'Generated or private local runtime state; excluded without reading contents.'
    : 'Outside this release selection; preserved in the original worktree.' }))
const id = randomUUID(), directory = path.join(root, 'output/app-quality-release/supervised-selection-' + id)
fs.mkdirSync(directory)
const save = (name, value) => fs.writeFileSync(path.join(directory, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' })
save('inventory.json', inventory)
save('selection.json', { schema: 1, id, checkpoint: inventory.checkpoint, selected, deferred,
  archiveAttributes: { source: '.gitattributes', sha256: sha(source('.gitattributes')), selectedWorktreeAttributes: true },
  authority: { commit: false, push: false, hosted: false, numericalActivation: false },
  scope: 'Review selection, not release acceptance. Research/development remains included but unfinished and confers no runtime authority.',
  dynamicEdges: ['Reviewed bench/C2-R/source Markdown and frozen JSON are included explicitly; HEAD supplies unchanged baseline/rubric/SQL.',
    'Generated require(bundle) in W10 operators is a manual edge; generated outputs and sealed inputs remain excluded.'],
  limitations: ['Current raw overlay bytes differ from potential Git clean-filter normalization. Exact approved commit/CI remains required.',
    'Operators referencing retained databases/private status are retained as source only; execution and runtime inputs are not included.'] })
// Archive only maintained HEAD roots. Exclude tracked output, tracker database and environment inputs.
const baseRoots = git('ls-tree', '--name-only', inventory.checkpoint).trim().split('\n')
  .filter(name => !['.beads', 'output'].includes(name) && !name.startsWith('.env'))
const baseEntries = git('ls-tree', '-r', '-z', inventory.checkpoint, '--', ...baseRoots).split('\0').filter(Boolean)
for (const entry of baseEntries) {
  const [meta, name] = entry.split('\t')
  if (!/^(100644|100755) blob /.test(meta) || path.isAbsolute(name) || name.includes('\\') || name.split('/').includes('..')) throw Error('Unsafe archive entry')
}
const archive = path.join(directory, 'head.zip'), tree = path.join(directory, 'tree')
execFileSync('git', ['archive', '--worktree-attributes', '--format=zip', '--output=' + archive, inventory.checkpoint, '--', ...baseRoots], { cwd: root, windowsHide: true })
fs.mkdirSync(tree)
execFileSync('tar.exe', ['-xf', archive, '-C', tree], { windowsHide: true })
for (const entry of selected) {
  const bytes = source(entry.path)
  if (sha(bytes) !== entry.sha256) throw Error('Source changed during preparation')
  const target = path.resolve(tree, entry.path)
  if (!target.startsWith(tree + path.sep)) throw Error('Overlay escaped candidate')
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, bytes)
}
function manifest(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    if (entry.isSymbolicLink()) throw Error('Candidate source link denied')
    const name = prefix + entry.name, absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) return manifest(absolute, name + '/')
    const bytes = fs.readFileSync(absolute)
    return [{ path: name, bytes: bytes.length, sha256: sha(bytes) }]
  })
}
const treeFiles = manifest(tree)
save('tree-manifest.json', treeFiles)
const modules = fs.realpathSync(path.join(root, 'node_modules'))
save('dependencies.json', { sharedInstall: modules, installedLockSha256: sha(fs.readFileSync(path.join(modules, '.package-lock.json'))),
  selectedLockSha256: sha(fs.readFileSync(path.join(tree, 'package-lock.json'))),
  nodeVersion: process.version, installationPerformed: false })
const receipt = { schema: 1, id, status: 'prepared_not_qualified', checkpoint: inventory.checkpoint,
  archiveSha256: sha(fs.readFileSync(archive)), selectionSha256: sha(fs.readFileSync(path.join(directory, 'selection.json'))),
  treeManifestSha256: sha(fs.readFileSync(path.join(directory, 'tree-manifest.json'))), treeFiles: treeFiles.length,
  selectedFiles: selected.length, selectedSourceUnchanged: selected.every(entry => sha(source(entry.path)) === entry.sha256),
  indexBeforeSha256, indexAfterSha256: sha(fs.readFileSync(indexPath)), commitCreated: false, hostedAction: false }
receipt.workingIndexUnchanged = receipt.indexBeforeSha256 === receipt.indexAfterSha256
if (!receipt.selectedSourceUnchanged) throw Error('Selected source changed')
if (!receipt.workingIndexUnchanged) throw Error('Working index changed; inspect concurrent activity')
save('receipt.json', receipt)
console.log(JSON.stringify({ id, status: receipt.status, selected: selected.length, deferred: deferred.length,
  groups: Object.fromEntries([...new Set(selected.map(e => e.group))].map(g => [g, selected.filter(e => e.group === g).length])),
  treeFiles: treeFiles.length, directory }))
