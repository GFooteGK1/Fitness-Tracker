import {describe,it,expect} from 'vitest'
import {historyDigest} from './setup-freshness-live-lifecycle.mjs'
const owner='12345678-1234-4123-8123-123456789013',planId='12345678-1234-4123-8123-123456789014'
const fixture=()=>({plan:{id:planId,user_id:owner,intent:{goal:'synthetic'},input_snapshot:{setup:{days:['monday']}}},
  sessions:[{id:'12345678-1234-4123-8123-123456789015',plan_version_id:planId,user_id:owner,scheduled_date:'2026-09-14',week_number:1,session_index:1,prescription:{dose:{sets:2},rest:'Two minutes'}}]})
describe('accepted history proof',()=>{
  it.each(['intent','input_snapshot','prescription','scheduled_date'])('detects changes to %s',field=>{
    const original=fixture(),changed:any=structuredClone(original)
    if(field==='intent')changed.plan.intent.goal='changed'
    if(field==='input_snapshot')changed.plan.input_snapshot.setup.days=['tuesday']
    if(field==='prescription')changed.sessions[0].prescription.dose.sets=3
    if(field==='scheduled_date')changed.sessions[0].scheduled_date='2026-09-15'
    expect(historyDigest(changed,owner,planId)).not.toBe(historyDigest(original,owner,planId))
  })
  it('rejects a session belonging to a different owner',()=>{
    const data=fixture();data.sessions[0].user_id=planId
    expect(()=>historyDigest(data,owner,planId)).toThrow('history_session_owner')
  })
  it('ignores object field order and legitimate superseded status',()=>{
    const data=fixture(),reordered:any=structuredClone(data)
    reordered.plan.intent={goal:'synthetic'};reordered.plan.status='superseded'
    reordered.sessions[0].prescription={rest:'Two minutes',dose:{sets:2}}
    expect(historyDigest(reordered,owner,planId)).toBe(historyDigest(data,owner,planId))
  })
})
