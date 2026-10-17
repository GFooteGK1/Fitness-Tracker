import React from 'react'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ReviewedWeekView } from '@/app/program/reviewed-session-card'
import { SupervisedWeekEditor } from '@/app/program/supervised-week-editor'
import { seedSupervisedWeek } from '@/app/lib/coach/supervised-draft-editor'
import { parseReviewedRollingWeek } from '@/app/lib/coach/reviewed-week-plan-contract'
import { ISOMETRIC_GUIDANCE } from '@/app/lib/coach/isometric-guidance'
import { isometricReviewedPlan } from '../fixtures/isometric-reviewed-week'

describe('isometric complete-week readback', () => {
  it('renders the exact compiled holds and leaves accepted work unchanged when opening first/same/next authoring', () => {
    const { plan } = isometricReviewedPlan(), original = structuredClone(plan)
    expect(parseReviewedRollingWeek(plan)).not.toBeNull()
    const readback = renderToStaticMarkup(<ReviewedWeekView value={plan} showLogging={false} />)
    expect(readback).toContain('Hold the explicitly reviewed split-squat position')
    expect(readback).toContain('Hold the explicitly reviewed heel height')
    expect(readback).toContain('20 seconds per side')
    expect(readback).toContain('10 seconds per side')
    expect(readback).toContain('RPE 6–7')
    let editor = ''
    for (const transition of ['same_week', 'next_week'] as const) {
      const seed = seedSupervisedWeek(plan, transition)!
      expect(seed.recipe.sessions.flatMap(s => s.steps).some(s => s.id === 'split-squat-accessory')).toBe(true)
      editor = renderToStaticMarkup(<SupervisedWeekEditor value={seed} onChange={() => { throw new Error('Rendering must not edit work') }} exercisePreferences={plan.profileSnapshot.exercisePreferences} />)
      expect(editor).toContain('Your confirmed context requests isometrics')
      expect(editor).toContain(ISOMETRIC_GUIDANCE.continuity)
    }
    expect(plan).toEqual(original)
    const output = process.env.ISOMETRIC_GUIDANCE_OUTPUT
    if (output) {
      mkdirSync(output, { recursive: true })
      writeFileSync(join(output, 'synthetic-week.json'), JSON.stringify(plan, null, 2))
      writeFileSync(join(output, 'synthetic-week.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isometric programming verification</title><style>body{font:16px/1.5 system-ui;margin:0;padding:20px;color:#17231f;background:#f4f6f3}main{max-width:900px;margin:auto}fieldset,article,section,details{min-width:0;border:1px solid #bcc9bd;border-radius:10px;padding:16px;margin:12px 0;background:white}summary,button{min-height:44px;cursor:pointer}button,input,select,textarea{font:inherit;max-width:100%}p,h1,h2,h3,h4,li{overflow-wrap:anywhere}h1{font-size:28px}h2{font-size:23px}h3{font-size:20px}h4{margin-bottom:4px}ol{padding-left:22px}a{color:#145d42}</style><main><h1>Isometric programming verification</h1><p><strong>Synthetic example only.</strong> Test doses demonstrate authoring, time accounting and readback. This is not Greg's accepted week or a validated dose protocol.</p><h2>Reviewed authoring guidance</h2>${editor}<h2>Complete compiled week</h2>${readback}</main></html>`)
    }
  })
})
