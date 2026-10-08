/** Read-only local database/journal readback. Does not log in, seed or resend. */
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
const runId = process.argv[2], final = process.argv[3] === '--final', uuid = v => typeof v === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)
if ((process.argv.length !== 3 && !(process.argv.length === 4 && final)) || !uuid(runId)) throw Error('Exact local browser run required; optional --final only')
const directory = `output/playwright/supervised-browser-${runId}`, sourcePath = `${directory}/server-receipt.json`
const receiptBytes = readFileSync(sourcePath), receipt = JSON.parse(receiptBytes)
if (receipt.runId !== runId || receipt.origin !== 'http://127.0.0.1:3013' || receipt.target !== 'http://127.0.0.1:55321'
  || !uuid(receipt.programId) || receipt.globalNumericalPolicy !== false || !Array.isArray(receipt.journal)) throw Error('Local receipt mismatch')
const output = `${directory}/readback-${randomUUID()}.json`
// Exclusive report reservation before this exact read-only query; prior evidence remains.
writeFileSync(output, JSON.stringify({ status: 'readback_started', runId }), { flag: 'wx' })
const checks = [], check = (value, name) => { if (!value) throw Error(name); checks.push(name) }
const podman = 'output/app-quality-release/tools/podman-5.8.3/podman-5.8.3/usr/bin/podman.exe', target = 'supabase_db_sociusfit-programming-local'
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|HOMEDRIVE|HOMEPATH)$/i.test(key)))
const call = args => {
  const result = spawnSync(podman, ['--connection', 'sociusfit-local', ...args], { encoding: 'utf8', env, windowsHide: true, timeout: 10000, maxBuffer: 8 * 1024 * 1024 })
  if (result.status !== 0) throw Error('Fixed local read-only query failed')
  return JSON.parse(result.stdout)
}
try {
  const container = call(['inspect', target])[0]
  check(container.State.Running && container.Config.Labels['com.supabase.cli.project'] === 'sociusfit-programming-local', 'Verified local container')
  const p = receipt.programId, query = `SELECT jsonb_build_object(
    'program',(SELECT jsonb_build_object('id',id,'userId',user_id,'activePlanVersionId',active_plan_version_id) FROM public.training_programs WHERE id='${p}'),
    'plans',(SELECT jsonb_agg(jsonb_build_object('id',id,'status',status,'windowStart',window_start,'sequenceNumber',sequence_number)) FROM public.training_plan_versions WHERE program_id='${p}'),
    'proposals',(SELECT jsonb_agg(jsonb_build_object('id',id,'status',status,'planVersionId',proposed_plan_version_id)) FROM public.adaptation_proposals WHERE program_id='${p}'),
    'sessions',(SELECT jsonb_agg(jsonb_build_object('id',id,'planVersionId',plan_version_id,'status',status,'workoutId',completed_workout_id)) FROM public.prescribed_sessions WHERE program_id='${p}'),
    'reports',(SELECT jsonb_agg(jsonb_build_object('id',id,'sessionId',prescribed_session_id,'requestId',request_id,'activityId',activity_id,'revision',revision,'report',report)) FROM public.coach_reviewed_set_reports WHERE program_id='${p}'));`
  const db = call(['exec', target, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', query])
  const http = receipt.journal.filter(e => e.name === 'browser_http'), posts = http.filter(e => e.payload.method === 'POST')
  check(receipt.journal.every(e => e.disposition === 'response_received'), 'All journaled intended requests have responses')
  check(posts.every(e => e.result.status === 200), 'All intended browser POSTs confirmed')
  const submissions = posts.filter(e => e.payload.path === '/api/coach/supervised/candidates')
  check(submissions.length === 2 && submissions.every(e => e.payload.actor === 'athlete' && e.result.result.kind === 'saved'), 'Exactly two athlete submissions')
  check(new Set(submissions.map(e => e.result.result.candidate.candidateId)).size === 2, 'Distinct immutable candidates')
  const decisions = posts.filter(e => e.payload.path === '/api/coach/supervised/decisions')
  check(decisions.length === 2 && decisions.every(e => e.payload.actor === 'reviewer' && e.result.result.kind === 'decided'), 'Exactly two designated reviewer decisions')
  const issued = posts.filter(e => e.payload.path === '/api/coach/supervised/issue')
  check(issued.length === 2 && issued.every(e => e.payload.actor === 'athlete' && e.result.result.kind === 'issued'), 'Exactly two separate athlete proposal issuances')
  check(db.proposals?.length === 2 && db.proposals.every(p => p.status === 'accepted'), 'Both proposals accepted in database')
  const cycles = []
  for (let i = 0; i < submissions.length; i++) {
    const submitted = submissions[i], candidate = submitted.result.result.candidate, issue = issued.find(e => e.payload.body.candidateId === candidate.candidateId)
    check(issue && decisions.some(e => e.payload.body.candidateId === candidate.candidateId && e.payload.body.decision === 'approve'), `Cycle${i + 1} exact candidate/decision lineage`)
    const proposalId = issue.result.result.proposalId, planVersionId = issue.result.result.planVersionId
    check(db.proposals.some(p => p.id === proposalId && p.planVersionId === planVersionId), `Cycle${i + 1} saved issuance IDs match`)
    check(posts.some(e => e.payload.path === `/api/coach/reviewed/proposals/${proposalId}/accept` && e.payload.actor === 'athlete' && e.result.result.kind === 'accepted'), `Cycle${i + 1} explicit athlete acceptance`)
    const sessions = db.sessions.filter(s => s.planVersionId === planVersionId)
    check(sessions.length === 5 && sessions.filter(s => s.status === 'completed').length === 1 && sessions.filter(s => s.status === 'skipped').length === 4, `Cycle${i + 1} complete/skipped sessions distinguish work`)
    const completed = sessions.find(s => s.status === 'completed'), reports = db.reports.filter(r => r.sessionId === completed.id)
    check(reports.length === 3, `Cycle${i + 1} original, correction and omission retained`)
    const corrected = reports.find(r => r.activityId === 'required-work' && r.revision === 2), omitted = reports.find(r => r.activityId === 'optional-work')
    check(corrected && corrected.report.rpe.value === 7 && corrected.report.rpe.scale === 'effort_0_10'
      && corrected.report.rir === 1.5 && corrected.report.repetitions === 9 + i, `Cycle${i + 1} corrected RIR independent of RPE`)
    check(omitted && omitted.report.status === 'not_performed' && ['repetitions','durationSeconds','distanceMetres','load','rpe','rir','restAfterSeconds','velocity'].every(k => omitted.report[k] === null), `Cycle${i + 1} omission has no invented quantities`)
    cycles.push({ candidateId: candidate.candidateId, proposalId, planVersionId, sessionId: completed.id, workoutId: completed.workoutId, correctedReportId: corrected.id })
  }
  check(db.program.activePlanVersionId === cycles[1].planVersionId, 'Second accepted week is active')
  const nextEvidence = submissions[1].result.result.candidate.reviewPacket.evidence.map(e => JSON.parse(e.summary))
  check(nextEvidence.some(e => e.setEvidence?.reportId === cycles[0].correctedReportId && e.setEvidence.revision === 2 && e.setEvidence.rir === 1.5 && e.effort?.value === 7), 'Next-week evidence contains first-cycle corrected report')
  check(http.some(e => e.payload.actor === 'foreign' && e.payload.path === '/api/coach/supervised/programs' && e.result.result.page.programs.length === 0), 'Foreign browser sees no assigned fixture')
  // Exact production boundary: foreign actor has no scoped supervised resource,
  // so the globally disabled reviewed handler returns409/disabled, not404.
  check(http.some(e => e.payload.actor === 'foreign' && e.payload.path === `/api/coach/reviewed/sessions/${cycles[1].sessionId}`
    && e.result.status === 409 && e.result.result.kind === 'disabled' && !e.result.result.session), 'Foreign browser cannot read owner session')
  if (final) {
    check(receipt.status === 'stopped' && receipt.priorRowsPreserved === true, 'Graceful local finalization verified')
    check(receipt.retainedBuild === `${directory}/build` && ['bundle.js', 'server.cjs', 'style.css'].every(name =>
      createHash('sha256').update(readFileSync(`${directory}/build/${name}`)).digest('hex') === receipt.build.output[name]), 'Exact run build artifacts retained')
    const bytes = readFileSync(`${directory}/prior-row-digests.json`), baseline = JSON.parse(bytes)
    const tables = ['training_programs', 'training_plan_versions', 'prescribed_sessions', 'workouts', 'coach_reviewed_set_reports']
    check(receipt.priorSnapshotSha256 === createHash('sha256').update(bytes).digest('hex')
      && baseline.runId === runId && baseline.programId === p && baseline.target === receipt.target
      && Object.keys(baseline.tables).sort().join(',') === [...tables].sort().join(','), 'Exact durable prior-row baseline')
    const query = `SELECT jsonb_object_agg(table_name, rows) FROM (${tables.map(table =>
      `SELECT '${table}' AS table_name, coalesce(jsonb_object_agg(id::text,md5(to_jsonb(x)::text)),'{}'::jsonb) AS rows FROM public.${table} x`).join(' UNION ALL ')}) snapshots;`
    const current = call(['exec', target, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', query])
    for (const table of tables) check(Object.entries(baseline.tables[table]).every(([id, hash]) => uuid(id)
      && typeof hash === 'string' && /^[a-f0-9]{32}$/.test(hash) && current[table]?.[id] === hash), `${table} all prior rows unchanged at final readback`)
  }
  writeFileSync(output, JSON.stringify({ status: 'passed', runId, finishedAt: new Date().toISOString(), serverReceiptSha256: createHash('sha256').update(receiptBytes).digest('hex'), checks, cycles,
    browserPosts: posts.length, journalEntries: receipt.journal.length, finalPreservationVerified: final,
    limitations: ['Test login shell does not qualify full Next Auth.', 'Mechanical fixture does not approve athlete suitability.',
      ...(!final ? ['Final all-prior-row preservation check requires --final after graceful local finalization.'] : [])] }, null, 2))
  console.log(JSON.stringify({ status: 'passed', checks: checks.length, browserPosts: posts.length, output }))
} catch(error) { writeFileSync(output, JSON.stringify({ status: 'inspect_required', runId, checks, failure: error.message }, null, 2)); throw error }
