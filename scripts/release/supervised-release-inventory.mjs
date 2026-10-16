/** Offline source inventory. No credentials, database, network, staging or deployment. */
import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { supervisedMigrationFiles } from './supervised-local-migration-plan.mjs'

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const sha = value => createHash('sha256').update(value).digest('hex')
const slash = value => value.replaceAll('\\', '/')
const sorted = values => [...values].sort()

function sourcePath(root, relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.includes('\\')) throw Error('Repository-relative path required')
  const absolute = path.resolve(root, relative)
  const normalized = slash(path.relative(root, absolute))
  if (!normalized || normalized.startsWith('../') || normalized !== relative) throw Error('Source escapes repository or is not normalized: ' + relative)
  let cursor = root
  for (const segment of relative.split('/')) {
    cursor = path.join(cursor, segment)
    if (fs.lstatSync(cursor).isSymbolicLink()) throw Error('Source link denied: ' + relative)
  }
  if (!fs.statSync(absolute).isFile()) throw Error('Source file required: ' + relative)
  return absolute
}

/** Includes type imports and literal lazy imports. Computed imports fail closed. */
export function collectSourceClosure(root, entries) {
  root = path.resolve(root)
  const configPath = sourcePath(root, 'tsconfig.json')
  const config = ts.readConfigFile(configPath, ts.sys.readFile)
  if (config.error) throw Error('Invalid TypeScript configuration')
  const options = ts.parseJsonConfigFileContent(config.config, ts.sys, root).options
  const files = new Map(), edges = [], packages = new Set(), pending = sorted(new Set(entries))
  while (pending.length) {
    const relative = pending.shift()
    if (files.has(relative)) continue
    const absolute = sourcePath(root, relative), bytes = fs.readFileSync(absolute)
    files.set(relative, { path: relative, sha256: sha(bytes), bytes: bytes.length })
    if (!/\.[cm]?[jt]sx?$/.test(relative)) continue
    const source = ts.createSourceFile(absolute, bytes.toString('utf8'), ts.ScriptTarget.Latest, true)
    const imports = []
    function visit(node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
        if (!ts.isStringLiteralLike(node.moduleSpecifier)) throw Error('Computed module specifier: ' + relative)
        imports.push({ name: node.moduleSpecifier.text, kind: ts.isImportDeclaration(node) && node.importClause?.isTypeOnly ? 'type' : 'static' })
      } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
        if (!node.moduleReference.expression || !ts.isStringLiteralLike(node.moduleReference.expression)) throw Error('Computed import assignment: ' + relative)
        imports.push({ name: node.moduleReference.expression.text, kind: 'static' })
      } else if (ts.isImportTypeNode(node)) {
        if (!ts.isLiteralTypeNode(node.argument) || !ts.isStringLiteralLike(node.argument.literal)) throw Error('Computed import type: ' + relative)
        imports.push({ name: node.argument.literal.text, kind: 'type' })
      } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
        if (node.arguments.length !== 1 || !ts.isStringLiteralLike(node.arguments[0])) throw Error('Computed import requires manual scope: ' + relative)
        imports.push({ name: node.arguments[0].text, kind: 'lazy' })
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
    for (const imported of imports) {
      const local = imported.name.startsWith('.') || imported.name.startsWith('@/')
      if (!local) {
        const name = imported.name.startsWith('@') ? imported.name.split('/').slice(0, 2).join('/') : imported.name.split('/')[0]
        packages.add(name)
        edges.push({ from: relative, specifier: imported.name, kind: imported.kind, package: name })
        continue
      }
      const resolution = ts.resolveModuleName(imported.name, absolute, options, ts.sys).resolvedModule
      // TypeScript does not resolve side-effect CSS assets; record their exact bytes.
      const target = resolution?.resolvedFileName ?? (imported.name.endsWith('.css') ? path.resolve(path.dirname(absolute), imported.name) : null)
      if (!target) throw Error('Unresolved local import: ' + relative + ' -> ' + imported.name)
      const targetRelative = slash(path.relative(root, target))
      sourcePath(root, targetRelative)
      edges.push({ from: relative, specifier: imported.name, kind: imported.kind, to: targetRelative })
      pending.push(targetRelative)
    }
  }
  return { files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)), edges, packages: sorted(packages) }
}

function routes(relative) {
  const directory = path.join(repository, relative)
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.isSymbolicLink()) throw Error('Route link denied')
    const name = relative + '/' + entry.name
    return entry.isDirectory() ? routes(name) : entry.name === 'route.ts' ? [name] : []
  })
}

export function buildSupervisedReleaseInventory() {
  // These routes are called by runtime URLs in reachable UI/client modules.
  // Inclusion captures compatibility bytes; it does not authorize their actions.
  const runtimeCompatibilityRoots = [
    'app/api/coach/route.ts', 'app/api/coach/intake/route.ts', 'app/api/coach/assessments/route.ts',
    'app/api/coach/trust/route.ts', 'app/api/coach/intent/route.ts', 'app/api/coach/observations/route.ts',
    'app/api/coach/imports/qwik/route.ts', 'app/api/coach/proposals/[id]/accept/route.ts',
    'app/api/coach/sessions/[id]/complete/route.ts', 'app/api/coach/sessions/[id]/signals/route.ts',
    'app/api/capture/route.ts', 'app/api/capture/drafts/route.ts', 'app/api/logging/requests/[id]/route.ts',
    'app/api/meals/[id]/route.ts', 'app/api/recommendations/refresh/route.ts',
    'app/api/recommendations/coverage/route.ts', 'app/api/recommendations/[id]/shown/route.ts',
    'app/api/recommendations/[id]/response/route.ts',
    'app/api/parse-workout/route.ts', 'app/api/meals/parse-text/route.ts', 'app/api/meals/upload/route.ts',
    'app/api/meals/quick-log/route.ts', 'app/api/foods/log/route.ts', 'app/api/agent/process/route.ts',
  ]
  const entries = sorted([
    ...runtimeCompatibilityRoots,
    ...routes('app/api/coach/supervised'), ...routes('app/api/coach/reviewed'),
    'app/api/coach/weekly/route.ts', 'app/api/coach/weekly/convert/route.ts',
    'app/api/coach/weekly/review/route.ts', 'app/api/coach/weekly/reviews/[id]/proposal/route.ts',
    'app/program/supervised/page.tsx', 'app/program/reviewed/[id]/page.tsx',
    'app/program/reviewed/plans/[id]/page.tsx', 'app/program/page.tsx',
    'app/auth/signin/page.tsx', 'app/auth/callback/route.ts', 'app/api/profile/route.ts',
    'app/onboarding/page.tsx', 'app/api/profile/onboarding/route.ts',
    'app/api/whoop/initialize/route.ts', 'app/api/whoop/refresh/route.ts', 'app/api/whoop/disconnect/route.ts',
    'app/layout.tsx', 'app/sw.ts', 'next.config.ts',
  ])
  const closure = collectSourceClosure(repository, entries)
  if (closure.files.some(f => !f.path.startsWith('app/') && f.path !== 'next.config.ts')) throw Error('Nonproduction dependency in application closure')
  const locks = ['package.json', 'package-lock.json', 'tsconfig.json', 'postcss.config.mjs', 'tailwind.config.ts', 'vercel.json', '.github/workflows/ci.yml']
  const dependencies = fs.readFileSync(sourcePath(repository, 'package-lock.json'))
  const lock = JSON.parse(dependencies)
  const packages = closure.packages.map(name => ({ name, version: lock.packages?.['node_modules/' + name]?.version ?? null,
    category: name.startsWith('node:') || ['crypto', 'buffer', 'stream', 'util', 'fs', 'path'].includes(name) ? 'node_builtin' : 'package' }))
  if (packages.some(p => p.category === 'package' && !p.version)) throw Error('Dependency absent from lockfile')
  const migrations = [
    { layer: 'existing_context_and_pause', names: ['20260921010000_coach_proposal_context_revision.sql', '20260923010000_coaching_write_pause.sql'] },
    { layer: 'separate_setup_freshness_release', names: ['20260926010000_coach_setup_memory_bindings.sql'] },
    { layer: 'reviewed_session_and_proposal_foundation', names: [
      '20260928010000_reviewed_session_set_reports.sql', '20260928020000_reviewed_session_completion.sql',
      '20260928030000_reviewed_proposal_registration.sql', '20260928040000_reviewed_execution_slots.sql',
      '20260928050000_reviewed_next_week_transition.sql', '20260928060000_reviewed_registration_recovery.sql',
      '20260928070000_reviewed_session_request_resolution.sql', '20260928080000_reviewed_proposal_resolution.sql',
      '20260928090000_reviewed_qualitative_recovery.sql', '20260929010000_reviewed_effort_rir.sql',
    ] },
    { layer: 'supervised_programming', names: supervisedMigrationFiles },
  ].flatMap(group => group.names.map(name => ({ layer: group.layer, path: 'supabase/migrations/' + name })))
  const hashFile = ({ path: relative, ...rest }) => {
    const bytes = fs.readFileSync(sourcePath(repository, relative))
    return { ...rest, path: relative, bytes: bytes.length, sha256: sha(bytes) }
  }
  const git = (...args) => execFileSync('git', args, { cwd: repository, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const changed = new Set([...git('diff', '--name-only', '-z', '--no-renames', 'HEAD').split('\0'),
    ...git('ls-files', '--others', '--exclude-standard', '-z').split('\0')].filter(Boolean))
  const files = [...closure.files, ...locks.map(relative => hashFile({ path: relative })), ...migrations.map(hashFile)]
  const selected = new Set(files.map(f => f.path))
  const policy = fs.readFileSync(sourcePath(repository, 'app/lib/personalized-coaching-capabilities.ts'), 'utf8')
  const registry = fs.readFileSync(sourcePath(repository, 'app/lib/coach/reviewed-proposal-service.ts'), 'utf8')
  if (!/initialDosePolicy:\s*false\s*,/.test(policy) || !/reviewedProposalRegistry: readonly TrustedReviewedWeekRegistration\[\] = \[\]/.test(registry)) throw Error('Global policy or default registry changed')
  return { schema: 1, purpose: 'offline_scoped_dependency_inventory', id: randomUUID(), createdAt: new Date().toISOString(),
    branch: git('branch', '--show-current').trim(), checkpoint: git('rev-parse', 'HEAD').trim(), releaseCommit: null,
    authority: { hostedRead: false, hostedWrite: false, commit: false, push: false, activation: false },
    globalNumericalPolicy: false, defaultReviewedRegistry: 'empty', entries, runtimeCompatibilityRoots, files, edges: closure.edges, packages,
    changedInScope: sorted([...changed].filter(p => selected.has(p))), changedOutsideScope: sorted([...changed].filter(p => !selected.has(p))),
    runtimeReferenceReview: ['AuthContext WHOOP initialize/refresh/disconnect routes and onboarding profile writer are explicit roots for their runtime URLs.',
      'Auth callback, profile API and onboarding are explicit roots because static imports alone do not capture their routing.',
      'Program panels, legacy acceptance/completion and shared capture/logging/recommendation runtime URLs have explicit compatibility roots. These are not new activation scope.',
      'Existing vercel.json WHOOP cron is hashed for deployment compatibility; it is outside pilot activation scope.'],
    limitations: ['Static import closure includes type imports; it is not a deployment artifact or staging list.',
      'Runtime URLs, CSS resources, public assets and database objects need separate integration review.',
      'Migration layers are prerequisites to reconcile, not an approved replay or hosted apply sequence.',
      'Earlier baseline schema and historical migration bytes require current hosted readback.',
      'Exact release commit, complete app tests/build, bounded actual Next evidence and named hosted pilot remain separate gates.'] }
}

export function verifyInventory(root, manifest) {
  if (manifest.schema !== 1 || !Array.isArray(manifest.files) || !manifest.files.length) throw Error('Invalid inventory')
  const seen = new Set()
  for (const file of manifest.files) {
    if (seen.has(file.path)) throw Error('Duplicate inventory path')
    seen.add(file.path)
    const bytes = fs.readFileSync(sourcePath(path.resolve(root), file.path))
    if (bytes.length !== file.bytes || sha(bytes) !== file.sha256) throw Error('Source changed: ' + file.path)
  }
  return { checked: seen.size, sourceBytesMatch: true }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw Error('No arguments accepted; fixed repository offline inventory only')
  const inventory = buildSupervisedReleaseInventory()
  const verified = verifyInventory(repository, inventory)
  const directory = path.join(repository, 'output/app-quality-release/supervised-release-' + inventory.id)
  fs.mkdirSync(directory)
  const bytes = JSON.stringify(inventory, null, 2) + '\n'
  fs.writeFileSync(path.join(directory, 'inventory.json'), bytes, { flag: 'wx' })
  console.log(JSON.stringify({ id: inventory.id, checkpoint: inventory.checkpoint, entries: inventory.entries.length,
    ...verified, packages: inventory.packages.length, changedInScope: inventory.changedInScope.length,
    changedOutsideScope: inventory.changedOutsideScope.length, inventorySha256: sha(bytes), inventory: path.join(directory, 'inventory.json') }))
}
