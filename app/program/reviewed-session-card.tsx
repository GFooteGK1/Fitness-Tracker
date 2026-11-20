import { describeReviewedActivity, parseReviewedSession, reviewedStepActivities, isOptionalReviewedStep, reviewedSessionTimeBudget } from '@/app/lib/coach/reviewed-session-contract'
import { parseReviewedRollingWeek } from '@/app/lib/coach/reviewed-week-plan-contract'
import { MOVEMENT_CATALOG } from '@/app/lib/coach/movement-catalog'
import type { ReviewedWeekActivity, ReviewedWeekProtocol } from '@/app/lib/coach/offline-reviewed-week'

const label = (value: string) => value.replaceAll('_', ' ').replaceAll('-', ' ')
const duration = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
const movementName = (id: string) => MOVEMENT_CATALOG.find(movement => movement.id === id)?.name ?? label(id)

function ActivityPrescription({ activity, protocols }: { activity: ReviewedWeekActivity; protocols: ReviewedWeekProtocol[] }) {
  const work = activity.work, effort = activity.effort, load = activity.load
  const range = (min: number, max: number) => min === max ? String(min) : `${min}–${max}`
  const description = describeReviewedActivity({ ...activity, instructions: [] })
  const explicitPreparation = activity.role === 'preparation' && load.kind === 'athlete_selected'
  const dose = work.kind === 'distance'
    ? `${activity.sets} × ${work.stages.map(stage => `${stage.metres} m ${stage.label}`).join(' + ')}${work.targetSeconds === null ? '' : ` in ${work.targetSeconds} seconds each`}`
    : description[0]
  const target = effort.kind === 'perceived_percent' ? `${range(effort.min, effort.max)}% perceived effort`
    : effort.kind === 'quality' ? null : description[1]
  const weight = load.kind === 'external' ? `${load.value} ${load.unit} ${load.convention === 'total' ? 'total' : 'per hand'}`
    : load.kind === 'bodyweight' ? 'Bodyweight' : load.kind === 'athlete_selected' ? explicitPreparation ? load.instruction : 'Athlete-selected weight' : null
  const guidance = [...activity.instructions,
    ...protocols.filter(protocol => protocol.id === activity.protocolId).flatMap(protocol => protocol.instructions),
    ...('cue' in effort ? [effort.cue] : []), ...(work.kind === 'distance' ? [work.finish] : []),
    ...(load.kind === 'athlete_selected' && !explicitPreparation ? [load.instruction] : []),
    ...description.filter(line => line.startsWith('Time estimate allows'))]
  return <div className="mt-2 min-w-0">
    <h4 className="break-words font-semibold">{movementName(activity.movementId)}{activity.role !== 'working' && ` · ${activity.role}`}</h4>
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-gray-700 dark:text-gray-200">
      {[dose, weight, target].filter((line): line is string => line !== null).map((line, index) => <p key={index} className="min-w-0 break-words">{line}</p>)}
    </div>
    {description.filter(line => line.startsWith('Rest ')).map((line, index) => <p key={index} className="mt-1 break-words text-gray-700 dark:text-gray-200">{line}</p>)}
    {guidance.length > 0 && <details className="mt-2">
      <summary className="min-h-11 cursor-pointer py-3 font-medium">{movementName(activity.movementId)} guidance</summary>
      {[...new Set(guidance)].map((line, index) => <p key={index} className="mt-1 whitespace-pre-wrap break-words text-gray-700 dark:text-gray-200">{line}</p>)}
    </details>}
  </div>
}

/** Shared read-only view. Set-level logging for this format has a separate contract. */
export function ReviewedSessionCard({ prescription }: { prescription: unknown }) {
  const session = parseReviewedSession(prescription)
  if (!session) return <p role="status">This session could not be read. Refresh your program before training from it.</p>
  return <article className="min-w-0 rounded-xl border border-gray-200 bg-gray-50 p-4 text-base dark:border-gray-700 dark:bg-gray-950/50">
    <h3 className="break-words font-bold capitalize text-gray-950 dark:text-white">{/^[a-f0-9]{8}(?:[ -][a-f0-9]{4}){3}[ -][a-f0-9]{12}$/i.test(session.title) ? session.intent : session.title}</h3>
    <p className="mt-2 text-gray-700 dark:text-gray-200">Estimated {duration(session.estimatedSeconds)} · {session.scheduledMinutes} minutes available</p>
    {session.content.conditionalTiming && <div className="mt-2 text-gray-700 dark:text-gray-200">
      <p>{session.schemaVersion === 3 ? 'Time fit is conditional. Work and recovery estimates are not limits.' : 'Time fit is conditional. Rest as needed; recovery estimates are not limits.'}</p>
      <p>{session.content.conditionalTiming.whenOverBudget}</p>
    </div>}
    {session.content.optionalTail && <p className="mt-2 text-gray-700 dark:text-gray-200">
      Required work estimate: {duration(reviewedSessionTimeBudget(session.content).requiredSeconds)}. Optional work is included in the full estimate above. {session.content.optionalTail.reason}
    </p>}
    <p className="mt-2 text-gray-600 dark:text-gray-300">Keep the prescribed rests. Record changes if you need to adjust the session.</p>
    <ol className="mt-4 space-y-4">
      {session.content.steps.map(step => <li key={step.id} className="min-w-0 border-l-2 border-[var(--accent-line)] pl-3">
        {isOptionalReviewedStep(session.content, step.id) && <p className="font-semibold">Optional if time remains</p>}
        {step.kind === 'allowance' ? <p className="text-gray-700 dark:text-gray-200">{label(step.purpose)}: {step.seconds} seconds</p> : <>
          {step.kind === 'preparation_window' ? <>
            <h4 className="font-semibold">Preparation · {duration(step.seconds)}</h4>
            {step.instructions.map((instruction, index) => <p key={index} className="mt-1 break-words">{instruction}</p>)}
            {step.activities.length === 1 && ['bike', 'bike_erg'].includes(step.activities[0].movementId)
              && step.instructions.some(instruction => /\bbike\b/i.test(instruction)) ? <details className="mt-2">
              <summary className="min-h-11 cursor-pointer py-3 font-medium">Preparation details</summary>
              {step.activities.map(activity => <ActivityPrescription key={activity.id} activity={activity} protocols={session.protocols} />)}
            </details> : step.activities.map(activity => <ActivityPrescription key={activity.id} activity={activity} protocols={session.protocols} />)}
          </> : reviewedStepActivities(step).map(activity => <ActivityPrescription key={activity.id} activity={activity} protocols={session.protocols} />)}
        </>}
      </li>)}
    </ol>
    <details className="mt-4 rounded-lg border border-gray-200 dark:border-gray-700">
      <summary className="flex min-h-11 cursor-pointer items-center p-3 font-semibold">Full session guidance</summary>
      <div className="space-y-3 p-3 pt-0">
        <p className="break-words">{session.intent}</p>
        {session.content.instructions.map((instruction, index) => <p key={index} className="whitespace-pre-wrap break-words">{instruction}</p>)}
      </div>
    </details>
  </article>
}

export function ReviewedWeekView({ value, sessionLinks = {}, showLogging = true }: { value: unknown; sessionLinks?: Record<string, string>; showLogging?: boolean }) {
  const plan = parseReviewedRollingWeek(value)
  if (!plan) return <p role="status">The reviewed week could not be read. Refresh your program.</p>
  return <section className="space-y-4 text-base">
    <h2 className="break-words text-2xl font-bold">{plan.title}</h2>
    <p>{plan.windowStart}–{plan.windowEnd}</p>
    <p className="break-words">{plan.basis.reason}</p>
    <details className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
      <summary className="flex min-h-11 cursor-pointer items-center font-semibold">Week guidance and limitations</summary>
      {[...plan.instructions, ...plan.limitations].map((instruction, index) => <p key={index} className="mt-2 whitespace-pre-wrap break-words">{instruction}</p>)}
    </details>
    {showLogging && <><p>Record your actual work and each working set’s RPE in your workout log.</p>
      <a href="/log" className="app-primary inline-flex min-h-11 items-center px-4 py-3">Open workout log</a></>}
    {plan.scheduledSessions.map(session => <section key={session.prescription.sessionId} className="space-y-2">
      <h3 className="font-semibold capitalize">{session.prescription.day} · {session.scheduledDate}</h3>
      <ReviewedSessionCard prescription={session.prescription} />
      {sessionLinks[session.prescription.sessionId] && <a className="app-primary inline-flex min-h-11 items-center px-4 py-3"
        href={`/program/reviewed/${encodeURIComponent(sessionLinks[session.prescription.sessionId])}`}>Open session and actual sets</a>}
    </section>)}
    <details className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
      <summary className="flex min-h-11 cursor-pointer items-center font-semibold">How the schedule changed</summary>
      <ul className="space-y-2">
        {plan.spacing.filter(pair => pair.baseDays !== pair.selectedDays).map(pair => <li key={`${pair.from}:${pair.to}`} className="break-words">
          {label(pair.from)} → {label(pair.to)}: {pair.baseDays} to {pair.selectedDays} calendar days.
        </li>)}
      </ul>
      <p className="mt-2">Different spacing can change recovery even when the session itself stays the same.</p>
    </details>
  </section>
}
