'use client'

import { useState } from 'react'
import type { ReviewedRest, ReviewedWeekActivity, ReviewedWeekStep } from '@/app/lib/coach/offline-reviewed-week'
import { REVIEWED_SESSION_DAYS as REVIEWED_WEEK_DAYS, reviewedSessionSchema } from '@/app/lib/coach/reviewed-session-contract'
import { MOVEMENT_CATALOG, MOVEMENT_EQUIPMENT_IDS } from '@/app/lib/coach/movement-catalog'
import { copySupervisedSession, removeSupervisedSession, editSupervisedStep, moveSupervisedSession, type SupervisedWeekSeed } from '@/app/lib/coach/supervised-draft-editor'

const inputClass = 'block min-h-11 w-full rounded border p-2 text-base text-gray-950'
function NumberField({ label, value, change, minimum = 0 }: { label: string; value: number; change: (n: number) => void; minimum?: number }) {
  return <label className="block">{label}<input className={inputClass} type="number" min={minimum} step="any" required
    value={Number.isFinite(value) ? value : ''} onChange={event => change(event.target.value === '' ? NaN : Number(event.target.value))} /></label>
}
function TextField({ label, value, change }: { label: string; value: string; change: (s: string) => void }) {
  return <label className="block">{label}<input className={inputClass} value={value} onChange={e => change(e.target.value)} /></label>
}
function Lines({ label, value, change }: { label: string; value: string[]; change: (s: string[]) => void }) {
  return <div><label className="block">{label}<textarea className={inputClass} rows={3} value={value.join('\n')}
    onChange={e => change(e.target.value.split('\n'))} /></label><p className="text-sm">One instruction per line.</p></div>
}
function RestField({ label, value, change }: { label: string; value: ReviewedRest; change: (s: ReviewedRest) => void }) {
  return typeof value === 'number' ? <NumberField label={`${label} (seconds)`} value={value} change={change} />
    : <div><p>{label}: rest as needed. This estimate does not cap recovery.</p>
      <NumberField label={`${label} estimate (seconds)`} value={value.estimatedSeconds} change={estimatedSeconds => change({ ...value, estimatedSeconds })} /></div>
}

/** Every field remains proposed work. Saving/approval and source verification are
 * deliberately separate from this editor. Never silently convert RIR into RPE.
 */
export function SupervisedActivityEditor({ activity, onChange, preparationOnly = false }: { activity: ReviewedWeekActivity; onChange: (a: ReviewedWeekActivity) => void; preparationOnly?: boolean }) {
  const work = activity.work, effort = activity.effort, load = activity.load
  const patch = (change: Partial<ReviewedWeekActivity>) => onChange({ ...structuredClone(activity), ...change })
  return <fieldset className="space-y-3 rounded border p-3">
    <legend className="px-1 font-semibold">{activity.movementId.replaceAll('_', ' ').replaceAll('-', ' ')} · {activity.role}</legend>
    <label className="block">Movement<select className={inputClass} value={activity.movementId} onChange={e => patch({ movementId: e.target.value })}>
      {!MOVEMENT_CATALOG.some(m => m.id === activity.movementId) && <option value={activity.movementId}>{activity.movementId}</option>}
      {MOVEMENT_CATALOG.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select></label>
    <p>After changing a movement, review its preparation, equipment, work, effort and any monitoring protocol before submitting.</p>
    <label className="block">Session role<select className={inputClass} value={activity.role} onChange={e => patch({ role: e.target.value as ReviewedWeekActivity['role'] })}>
      {(preparationOnly ? ['preparation'] : activity.protocolId ? ['monitoring'] : ['preparation', 'working', 'cooldown']).map(role => <option key={role}>{role}</option>)}
    </select></label>
    {activity.protocolId && <p>This activity has a linked monitoring protocol. Keep its monitoring role when editing its work.</p>}
    <details><summary className="min-h-11 cursor-pointer py-3">Required equipment</summary>
      {MOVEMENT_EQUIPMENT_IDS.map(id => <label key={id} className="flex min-h-11 items-center gap-3">
        <input type="checkbox" checked={activity.requiredEquipment.includes(id)} onChange={e => patch({ requiredEquipment: e.target.checked
          ? [...activity.requiredEquipment, id] : activity.requiredEquipment.filter(v => v !== id) })} />{id.replaceAll('_', ' ')}
      </label>)}
    </details>
    <NumberField label="Sets" value={activity.sets} change={sets => patch({ sets })} minimum={1} />
    <label className="block">Work type<select className={inputClass} value={work.kind} onChange={e => {
      const kind = e.target.value as typeof work.kind, sides = 'sides' in work ? work.sides : 1
      patch({ work: kind === 'repetitions' ? { kind, repetitions: { min: NaN, max: NaN }, sides, secondsPerRep: NaN }
        : kind === 'effort_repetitions' ? { kind, targetRir: NaN, sides, estimatedSecondsPerSet: NaN, sideSwitchSeconds: 0 }
          : kind === 'duration' ? { kind, seconds: NaN, sides, sideSwitchSeconds: 0 }
            : { kind, stages: [{ label: '', metres: NaN }], targetSeconds: null, allowanceSeconds: NaN, finish: '' } })
    }}><option value="repetitions">Repetition range</option><option value="effort_repetitions">Effort-led repetitions</option>
      <option value="duration">Duration</option><option value="distance">Distance or stages</option></select></label>
    <p className="font-semibold">{work.kind === 'effort_repetitions' ? 'Repetitions guided by effort' : work.kind.replaceAll('_', ' ')}</p>
    {work.kind === 'repetitions' && <>
      <NumberField label="Minimum repetitions" value={work.repetitions.min} change={min => patch({ work: { ...work, repetitions: { ...work.repetitions, min } } })} minimum={1} />
      <NumberField label="Maximum repetitions" value={work.repetitions.max} change={max => patch({ work: { ...work, repetitions: { ...work.repetitions, max } } })} minimum={1} />
      <NumberField label="Estimated seconds per repetition (time planning only)" value={work.secondsPerRep} change={secondsPerRep => patch({ work: { ...work, secondsPerRep } })} />
      <button type="button" className="min-h-11 underline" onClick={() => patch({ work: { kind: 'effort_repetitions', targetRir: NaN,
        sides: work.sides, estimatedSecondsPerSet: NaN, sideSwitchSeconds: 0 } })}>Use effort-led repetitions instead</button>
    </>}
    {work.kind === 'effort_repetitions' && <>
      <NumberField label="Target reps in reserve (RIR)" value={work.targetRir} change={targetRir => patch({ work: { ...work, targetRir } })} />
      <p>Choose repetitions that reach this effort with the selected weight. The time estimate is not a repetition target or cap.</p>
      <NumberField label="Estimated seconds per set" value={work.estimatedSecondsPerSet} change={estimatedSecondsPerSet => patch({ work: { ...work, estimatedSecondsPerSet } })} />
      <NumberField label="Side-switch seconds" value={work.sideSwitchSeconds} change={sideSwitchSeconds => patch({ work: { ...work, sideSwitchSeconds } })} />
      <button type="button" className="min-h-11 underline" onClick={() => patch({ work: { kind: 'repetitions', repetitions: { min: NaN, max: NaN }, sides: work.sides, secondsPerRep: NaN } })}>Use a repetition range instead</button>
    </>}
    {work.kind === 'duration' && <>
      <NumberField label="Work seconds" value={work.seconds} change={seconds => patch({ work: { ...work, seconds } })} />
      <NumberField label="Side-switch seconds" value={work.sideSwitchSeconds} change={sideSwitchSeconds => patch({ work: { ...work, sideSwitchSeconds } })} />
    </>}
    {'sides' in work && <label className="block">Sides<select className={inputClass} value={work.sides}
      onChange={e => patch({ work: { ...work, sides: Number(e.target.value) as 1 | 2 } })}>
      <option value={1}>One total count</option><option value={2}>Each side</option>
    </select></label>}
    {work.kind === 'distance' && <>
      {work.stages.map((stage, i) => <div key={i} className="space-y-2">
        <TextField label={`Stage ${i + 1} name`} value={stage.label} change={label => patch({ work: { ...work, stages: work.stages.map((s, j) => i === j ? { ...s, label } : s) } })} />
        <NumberField label={`Stage ${i + 1} metres`} value={stage.metres} change={metres => patch({ work: { ...work, stages: work.stages.map((s, j) => i === j ? { ...s, metres } : s) } })} />
        <button type="button" className="min-h-11 underline" disabled={work.stages.length === 1}
          onClick={() => patch({ work: { ...work, stages: work.stages.filter((_, j) => j !== i) } })}>Remove stage {i + 1}</button>
      </div>)}
      <button type="button" className="min-h-11 underline" onClick={() => patch({ work: { ...work, stages: [...work.stages, { label: '', metres: NaN }] } })}>Add distance stage</button>
      <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={work.targetSeconds !== null}
        onChange={e => patch({ work: { ...work, targetSeconds: e.target.checked ? NaN : null } })} />Prescribe a target time</label>
      {work.targetSeconds !== null && <NumberField label="Target seconds" value={work.targetSeconds} change={targetSeconds => patch({ work: { ...work, targetSeconds } })} />}
      <NumberField label="Work time allowance (seconds)" value={work.allowanceSeconds} change={allowanceSeconds => patch({ work: { ...work, allowanceSeconds } })} />
      <TextField label="Finish and quality guidance" value={work.finish} change={finish => patch({ work: { ...work, finish } })} />
    </>}
    <label className="block">Load type<select className={inputClass} value={load.kind} onChange={e => {
      const kind = e.target.value as typeof load.kind
      patch({ load: kind === 'external' ? { kind, value: NaN, unit: 'lb', convention: 'total' }
        : kind === 'athlete_selected' ? { kind, instruction: '' } : { kind } })
    }}><option value="external">Prescribed weight</option><option value="bodyweight">Bodyweight</option>
      <option value="athlete_selected">Athlete selects weight</option><option value="not_applicable">No load applies</option></select></label>
    {load.kind === 'external' && <>
      <NumberField label="Weight" value={load.value} change={value => patch({ load: { ...load, value } })} />
      <label className="block">Weight unit<select className={inputClass} value={load.unit} onChange={e => patch({ load: { ...load, unit: e.target.value as 'lb' | 'kg' } })}><option>lb</option><option>kg</option></select></label>
      <label className="block">Weight convention<select className={inputClass} value={load.convention} onChange={e => patch({ load: { ...load, convention: e.target.value as 'total' | 'per_hand' } })}><option value="total">Total</option><option value="per_hand">Per hand</option></select></label>
    </>}
    {load.kind === 'athlete_selected' && <TextField label="How to choose the weight" value={load.instruction} change={instruction => patch({ load: { ...load, instruction } })} />}
    <p className="font-semibold">Effort target</p>
    <label className="block">Effort type<select className={inputClass} value={effort.kind} onChange={e => {
      const kind = e.target.value as typeof effort.kind
      patch({ effort: kind === 'rpe' ? { kind, min: NaN, max: NaN }
        : kind === 'rpe_ceiling' ? { kind, max: NaN } : kind === 'quality' ? { kind, cue: '' } : { kind, min: NaN, max: NaN, cue: '' } })
    }}><option value="rpe">RPE range</option><option value="rpe_ceiling">RPE ceiling</option><option value="quality">Movement quality</option>
      <option value="perceived_percent">Perceived effort percent</option></select></label>
    {effort.kind === 'rpe' && <NumberField label="Minimum RPE" value={effort.min} change={min => patch({ effort: { ...effort, min } })} />}
    {(effort.kind === 'rpe' || effort.kind === 'rpe_ceiling') && <NumberField label={effort.kind === 'rpe_ceiling' ? 'RPE ceiling' : 'Maximum RPE'} value={effort.max} change={max => patch({ effort: { ...effort, max } })} />}
    {effort.kind === 'perceived_percent' && <>
      <NumberField label="Minimum perceived percent" value={effort.min} change={min => patch({ effort: { ...effort, min } })} />
      <NumberField label="Maximum perceived percent" value={effort.max} change={max => patch({ effort: { ...effort, max } })} />
    </>}
    {'cue' in effort && <TextField label="Effort and quality cue" value={effort.cue} change={cue => patch({ effort: { ...effort, cue } })} />}
    <RestField label="Rest between sets" value={activity.restBetweenSeconds} change={restBetweenSeconds => patch({ restBetweenSeconds })} />
    <RestField label="Rest after this movement" value={activity.restAfterSeconds} change={restAfterSeconds => patch({ restAfterSeconds })} />
    <Lines label="Movement instructions" value={activity.instructions} change={instructions => patch({ instructions })} />
  </fieldset>
}

export function SupervisedWeekEditor({ value, onChange, disabled = false }: {
  value: SupervisedWeekSeed; onChange: (next: SupervisedWeekSeed) => void; disabled?: boolean
}) {
  const [structureError, setStructureError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [copySource, setCopySource] = useState(''), [copyDay, setCopyDay] = useState('')
  const structural = (change: () => SupervisedWeekSeed) => {
    try {
      const next = change()
      for (const session of next.recipe.sessions) if (reviewedSessionSchema(session) === 1) delete session.conditionalTiming
      onChange(next); setStructureError(null)
    } catch (e) { setStructureError(e instanceof Error ? e.message : 'This structural change could not be prepared.') }
  }
  function edit(change: (next: SupervisedWeekSeed) => void) {
    const next = structuredClone(value); change(next)
    for (const session of next.recipe.sessions) {
      if (reviewedSessionSchema(session) === 1) delete session.conditionalTiming
    }
    onChange(next)
  }
  function step(sessionIndex: number, stepIndex: number, next: ReviewedWeekStep) { edit(d => { d.recipe.sessions[sessionIndex].steps[stepIndex] = next }) }
  const schedule = value.recipe.schedules.find(s => s.id === value.scheduleId)!
  const emptyDays = REVIEWED_WEEK_DAYS.filter(day => schedule.days[day] === null)
  return <fieldset disabled={disabled} className="space-y-5 text-base">
    <legend className="text-xl font-bold">Edit the proposed week</legend>
    <p>Week starting {value.windowStart}. Changes need coach review and athlete acceptance. RPE and RIR are separate targets.</p>
    <p>Replacing the current week may be unavailable after training has begun. Next-week proposals require unfinished sessions to be resolved first.</p>
    {structureError && <p role="alert">{structureError}</p>}
    {value.recipe.sessions.map((session, si) => <section key={session.id} className="space-y-3 rounded-xl border p-4">
      <button type="button" className="min-h-11 cursor-pointer py-3 text-lg font-bold" aria-expanded={expanded.has(session.id)} onClick={() => setExpanded(previous => {
        const next = new Set(previous); if (next.has(session.id)) next.delete(session.id); else next.add(session.id); return next
      })}>Session {si + 1} · {REVIEWED_WEEK_DAYS.find(day => schedule.days[day] === session.id)}</button>
      {expanded.has(session.id) && <>
      <button type="button" className="min-h-11 underline" disabled={value.recipe.sessions.length <= 1}
        onClick={() => structural(() => removeSupervisedSession(value, session.id))}>Remove session {si + 1}</button>
      <label className="block">Training day<select className={inputClass} value={REVIEWED_WEEK_DAYS.find(day => schedule.days[day] === session.id)}
        onChange={e => onChange(moveSupervisedSession(value, session.id, e.target.value as typeof REVIEWED_WEEK_DAYS[number]))}>
        {REVIEWED_WEEK_DAYS.map(day => <option key={day}>{day}</option>)}
      </select></label><p>Choosing an occupied day swaps both sessions.</p>
      <Lines label="Session focus" value={session.themes} change={themes => edit(d => { d.recipe.sessions[si].themes = themes })} />
      <Lines label="Session instructions" value={session.instructions} change={instructions => edit(d => { d.recipe.sessions[si].instructions = instructions })} />
      {reviewedSessionSchema(session) > 1 && <TextField label="If time is insufficient" value={session.conditionalTiming?.whenOverBudget ?? ''}
        change={whenOverBudget => edit(d => { d.recipe.sessions[si].conditionalTiming = { kind: 'conditional', whenOverBudget } })} />}
      {session.optionalTail && <TextField label="Why the final work is optional" value={session.optionalTail.reason}
        change={reason => edit(d => { d.recipe.sessions[si].optionalTail!.reason = reason })} />}
      <label className="block">Optional work begins<select className={inputClass} value={session.optionalTail?.fromStepId ?? ''} onChange={e => edit(d => {
        if (!e.target.value) delete d.recipe.sessions[si].optionalTail
        else d.recipe.sessions[si].optionalTail = { fromStepId: e.target.value, reason: session.optionalTail?.reason ?? '' }
      })}><option value="">No optional tail</option>{session.steps.filter(s => s.kind !== 'allowance' || s.purpose !== 'logging').map((s, i) =>
        <option key={s.id} value={s.id}>Step {i + 1} · {s.kind === 'activity' ? s.movementId.replaceAll('_', ' ') : s.kind.replaceAll('_', ' ')}</option>)}</select></label>
      {session.steps.map((s, index) => <div key={s.id}>
        <div className="flex flex-wrap gap-3" aria-label={`Step ${index + 1} controls`}>
          <button type="button" className="min-h-11 underline" disabled={index === 0} onClick={() => structural(() => editSupervisedStep(value, session.id, s.id, 'earlier', () => crypto.randomUUID()))}>Move step {index + 1} earlier</button>
          <button type="button" className="min-h-11 underline" disabled={index === session.steps.length - 1} onClick={() => structural(() => editSupervisedStep(value, session.id, s.id, 'later', () => crypto.randomUUID()))}>Move step {index + 1} later</button>
          <button type="button" className="min-h-11 underline" onClick={() => structural(() => editSupervisedStep(value, session.id, s.id, 'copy', () => crypto.randomUUID()))}>Copy step {index + 1}</button>
          <button type="button" className="min-h-11 underline" disabled={session.optionalTail?.fromStepId === s.id} onClick={() => structural(() => editSupervisedStep(value, session.id, s.id, 'remove', () => crypto.randomUUID()))}>Remove step {index + 1}</button>
        </div>
        {session.optionalTail?.fromStepId === s.id && <p className="font-semibold">Optional work begins here; final logging stays required.</p>}
        {s.kind === 'activity' ? <SupervisedActivityEditor activity={s} onChange={a => step(si, index, a)} />
          : s.kind === 'allowance' ? <NumberField label={`${s.purpose} seconds`} value={s.seconds} change={seconds => step(si, index, { ...s, seconds })} />
            : <fieldset className="space-y-3 rounded border p-3"><legend>Preparation</legend>
              <NumberField label="Preparation window seconds" value={s.seconds} change={seconds => step(si, index, { ...s, seconds })} />
              <Lines label="Preparation instructions" value={s.instructions} change={instructions => step(si, index, { ...s, instructions })} />
              {s.activities.map((a, ai) => <SupervisedActivityEditor key={a.id} activity={a} preparationOnly onChange={activity => step(si, index,
                { ...s, activities: s.activities.map((old, i) => i === ai ? activity : old) })} />)}
            </fieldset>}
      </div>)}
      {value.recipe.protocols.filter(p => p.sessionId === session.id).map(protocol => <Lines key={protocol.id}
        label="Monitoring protocol instructions" value={protocol.instructions} change={instructions => edit(d => {
          d.recipe.protocols.find(p => p.id === protocol.id)!.instructions = instructions
        })} />)}
      </>}
    </section>)}
    {emptyDays.length > 0 && <section className="space-y-3 rounded border p-3">
      <h2 className="font-semibold">Add a session from existing work</h2>
      <p>Copy a complete session, then review its movements, volume, preparation and effort for the new day.</p>
      <label className="block">Session to copy<select className={inputClass} value={copySource} onChange={e => setCopySource(e.target.value)}>
        <option value="">Choose a session</option>{value.recipe.sessions.map((s, i) => <option key={s.id} value={s.id}>Session {i + 1}</option>)}
      </select></label>
      <label className="block">Empty day<select className={inputClass} value={copyDay} onChange={e => setCopyDay(e.target.value)}>
        <option value="">Choose an empty day</option>{emptyDays.map(day => <option key={day}>{day}</option>)}
      </select></label>
      <button type="button" className="min-h-11 underline" disabled={!copySource || !copyDay} onClick={() => structural(() =>
        copySupervisedSession(value, copySource, copyDay as typeof REVIEWED_WEEK_DAYS[number], () => crypto.randomUUID()))}>Copy complete session</button>
    </section>}
    <Lines label="Week instructions" value={value.recipe.instructions} change={instructions => edit(d => { d.recipe.instructions = instructions })} />
    <Lines label="Limitations and questions for review" value={value.recipe.limitations} change={limitations => edit(d => { d.recipe.limitations = limitations })} />
  </fieldset>
}
