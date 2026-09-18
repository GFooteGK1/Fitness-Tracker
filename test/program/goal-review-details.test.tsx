/** @vitest-environment jsdom */
import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it } from 'vitest'
import { GoalReviewDetails } from '@/app/program/goal-review-details'
import { decodeTargetedGoalReviews } from '@/app/lib/coach/targeted-review-contracts'
import { runningOutcome } from '../fixtures/personalized-coaching/intent'
function goal(id:string,attained:boolean) { return {version:'targeted-review-1',goalId:id,attained,disposition:'deferred',actionCandidate:'continue',includedSourceIds:['source'],excludedSources:[],matchingAssignmentIds:[],missing:[],evaluator:{},binding:runningOutcome(id)} }
describe('optional separate outcome disclosure',()=>{
  it('shows independent attainment and a readable assessment without claiming the whole event is met',()=>{
    render(<GoalReviewDetails value={[goal('5k',true),goal('mile',false)]}/> )
    expect(screen.getByText('Review each outcome')).toBeInTheDocument()
    expect(screen.getByText(/This outcome is attained/)).toBeInTheDocument()
    expect(screen.getByText(/This outcome is not established as attained/)).toBeInTheDocument()
    expect(screen.getAllByText(/same movement, distance, equipment/)).toHaveLength(2)
    expect(screen.queryByText(/run[.]time|run-time-trial-standard/)).not.toBeInTheDocument()
  })
  it('keeps legacy absence readable and refuses future or malformed additive metadata',()=>{
    for(const value of [undefined,[{...goal('a',false),version:'future'}],[{...goal('a',false),missing:[{}]}],[goal('a',false),goal('a',true)]]) expect(decodeTargetedGoalReviews(value)).toBeNull()
    const {container}=render(<GoalReviewDetails value={undefined}/>);expect(container).toBeEmptyDOMElement()
  })
})
