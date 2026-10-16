/** Current declarations only. Legacy content supplies intake provenance, never current setup or facts. */
import type { SetupMemoryBindings } from './setup-memory-bindings'
import { parseReviewedScheduleMemory,parseReviewedEquipmentMemory,parseReviewedGoalMemory,parseReviewedConstraintMemory } from './reviewed-setup-memory'
import { validateExercisePreferences } from './exercise-preferences'
import type { CoachProgramDomainId } from './types'
import { validateReviewedProgrammingProfile,type ProgrammingProfile } from './programming-schema'
import { MOVEMENT_EQUIPMENT_IDS } from './movement-catalog'
import { REVIEWED_SESSION_DAYS as days } from './reviewed-session-contract'

export function firstReviewedSetupProfile(legacy:ProgrammingProfile,setup:SetupMemoryBindings,windowStart:string):
  {kind:'setup_ready';profile:ProgrammingProfile}|{kind:'setup_required';keys:string[]} {
  const keys=['primary_goal','training_schedule','available_equipment','training_constraints']
  const missing=keys.filter(k=>!setup.memories[k]?.currentAtRead)
  if(missing.length)return {kind:'setup_required',keys:missing}
  const goal=setup.memories.primary_goal!.content,schedule=setup.memories.training_schedule!.content,
    equipment=setup.memories.available_equipment!.content,constraints=setup.memories.training_constraints!.content
  const invalid:string[]=[]
  if(!parseReviewedGoalMemory(goal))invalid.push('primary_goal')
  let availability:ProgrammingProfile['sessionAvailability']=[],experience:ProgrammingProfile['trainingExperience']='new_or_returning'
  if(Object.hasOwn(schedule,'schemaVersion')){
    const saved=parseReviewedScheduleMemory(schedule)
    if(saved){availability=saved.sessionAvailability;experience=saved.experience}else invalid.push('training_schedule')
  }else if(typeof schedule.experience==='string'&&['new_or_returning','consistent','experienced'].includes(schedule.experience)
    &&Array.isArray(schedule.trainingDays)&&schedule.trainingDays.length>=2&&schedule.trainingDays.length<=6
    &&schedule.trainingDays.every(d=>typeof d==='string'&&days.includes(d as typeof days[number]))
    &&new Set(schedule.trainingDays).size===schedule.trainingDays.length&&Number.isSafeInteger(schedule.sessionMinutes)
    &&Number(schedule.sessionMinutes)>=30&&Number(schedule.sessionMinutes)<=90){
    experience=schedule.experience as typeof experience
    availability=schedule.trainingDays.map(day=>({day,minutes:schedule.sessionMinutes as number}))
  }else invalid.push('training_schedule')
  let equipmentProfile:ProgrammingProfile['equipment']={resolvedIds:[],unresolvedAthleteDescription:null}
  if(Object.hasOwn(equipment,'schemaVersion')){
    const saved=parseReviewedEquipmentMemory(equipment)
    if(saved)equipmentProfile={athleteDescription:saved.equipment,resolvedIds:saved.resolvedEquipmentIds,unresolvedAthleteDescription:saved.unresolvedAthleteDescription}
    else invalid.push('available_equipment')
  }else if(typeof equipment.equipment==='string'&&equipment.equipment.length<=4000&&Array.isArray(equipment.resolvedEquipmentIds)
    &&equipment.resolvedEquipmentIds.every(id=>typeof id==='string'&&MOVEMENT_EQUIPMENT_IDS.includes(id as typeof MOVEMENT_EQUIPMENT_IDS[number]))
    &&new Set(equipment.resolvedEquipmentIds).size===equipment.resolvedEquipmentIds.length){
    equipmentProfile={resolvedIds:[...equipment.resolvedEquipmentIds],unresolvedAthleteDescription:equipment.equipment.trim()||null}
  }else invalid.push('available_equipment')
  if(!parseReviewedConstraintMemory(constraints))invalid.push('training_constraints')
  const preference=setup.memories.exercise_preferences
  if(preference&&(!preference.currentAtRead||!validateExercisePreferences(preference.content)))invalid.push('exercise_preferences')
  if(invalid.length)return {kind:'setup_required',keys:invalid}
  const profile:ProgrammingProfile={schemaVersion:1,kernelVersion:'0.3.0',athleteGoalSummary:goal.goal as string,
    primaryGoal:{id:`goal:primary:${goal.primaryDomain}`,domain:goal.primaryDomain as CoachProgramDomainId,role:'primary',allocation:'lead',athleteIntent:goal.goal as string},
    secondaryGoals:(goal.secondaryGoals as Array<{domain:CoachProgramDomainId;allocation:'development'|'maintenance';athleteIntent:string}>).map(g=>({
      domain:g.domain,allocation:g.allocation,athleteIntent:g.athleteIntent,id:`goal:secondary:${g.domain}`,role:'secondary'})),trainingExperience:experience,startDate:windowStart,
    sessionAvailability:structuredClone(availability),equipment:equipmentProfile,
    explicitConstraints:(constraints.constraintKinds as Array<'no_overhead'|'no_running'>).map(kind=>({id:`constraint:${kind}`,kind,
      description:kind==='no_overhead'?'Athlete confirmed that overhead work is unavailable.':'Athlete confirmed that running is unavailable.',source:'athlete_confirmed'})),
    unresolvedConstraintNote:(constraints.constraints as string).trim()||null,preferences:[],assessments:[],
    recentTraining:{asOfDate:null,lookbackDays:0,completedSessionCount:0,performedMovementIds:[],doseByCoverageTarget:[]},
    inputSource:structuredClone(legacy.inputSource)}
  if(preference)profile.exercisePreferences=structuredClone(preference.content) as unknown as NonNullable<ProgrammingProfile['exercisePreferences']>
  const validation=validateReviewedProgrammingProfile(profile)
  return validation.ok?{kind:'setup_ready',profile}:{kind:'setup_required',keys:['primary_goal','training_schedule','available_equipment','training_constraints']}
}
