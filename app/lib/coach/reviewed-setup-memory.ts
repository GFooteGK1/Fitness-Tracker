/** Saved reviewed setup is separate from the automatic intake's uniform schedule. */
import { MOVEMENT_EQUIPMENT_IDS } from './movement-catalog'
import type { ProgrammingProfile, ProgrammingSessionAvailability } from './programming-schema'
import { REVIEWED_EQUIPMENT_ALIASES } from './reviewed-movement-eligibility'
import { COACH_PROGRAM_DOMAIN_IDS,type CoachProgramDomainId } from './types'

export interface ReviewedGoalMemory {
  goal:string;primaryDomain:CoachProgramDomainId;
  secondaryGoals:Array<{domain:CoachProgramDomainId;allocation:'development'|'maintenance';athleteIntent:string}>
}
export interface ReviewedConstraintMemory {constraints:string;constraintKinds:Array<'no_overhead'|'no_running'>}

export interface ReviewedScheduleMemory {
  schemaVersion: 2
  experience: ProgrammingProfile['trainingExperience']
  sessionAvailability: ProgrammingSessionAvailability[]
}
export interface ReviewedEquipmentMemory {
  schemaVersion: 2
  /** Athlete wording is retained even after every available implement is resolved. */
  equipment: string
  resolvedEquipmentIds: string[]
  unresolvedAthleteDescription: string | null
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).sort().join(',') === keys.sort().join(',')
const description = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v.length <= 4000
const equipmentIds = new Set<string>([...MOVEMENT_EQUIPMENT_IDS, ...Object.keys(REVIEWED_EQUIPMENT_ALIASES)])
const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const domain=(v:unknown):v is CoachProgramDomainId=>typeof v==='string'&&COACH_PROGRAM_DOMAIN_IDS.includes(v as CoachProgramDomainId)
export function parseReviewedGoalMemory(v:unknown):ReviewedGoalMemory|null {
  if(!record(v)||!exact(v,['goal','primaryDomain','secondaryGoals'])||typeof v.goal!=='string'||v.goal.trim().length<5||v.goal.length>500
    ||!domain(v.primaryDomain)||!Array.isArray(v.secondaryGoals)||v.secondaryGoals.length>=COACH_PROGRAM_DOMAIN_IDS.length
    ||v.secondaryGoals.some(g=>!record(g)||!exact(g,['domain','allocation','athleteIntent'])||!domain(g.domain)||g.domain===v.primaryDomain
      ||!['development','maintenance'].includes(g.allocation as string)||typeof g.athleteIntent!=='string'||!g.athleteIntent.trim()||g.athleteIntent.length>500)
    ||new Set(v.secondaryGoals.map(g=>g.domain)).size!==v.secondaryGoals.length)return null
  return structuredClone(v) as unknown as ReviewedGoalMemory
}
export function parseReviewedConstraintMemory(v:unknown):ReviewedConstraintMemory|null {
  if(!record(v)||!exact(v,['constraints','constraintKinds'])||typeof v.constraints!=='string'||v.constraints.length>4000||!Array.isArray(v.constraintKinds)
    ||v.constraintKinds.some(k=>typeof k!=='string'||!['no_overhead','no_running'].includes(k))||new Set(v.constraintKinds).size!==v.constraintKinds.length)return null
  return structuredClone(v) as unknown as ReviewedConstraintMemory
}

/** Editable saved declarations only. New choices remain blank until the athlete supplies them. */
export function reviewedSetupEditorValue(key:string,content:Record<string,unknown>):Record<string,unknown> {
  if(key==='training_schedule'&&!Object.hasOwn(content,'schemaVersion'))return {schemaVersion:2,experience:content.experience??'',
    sessionAvailability:Array.isArray(content.trainingDays)?content.trainingDays.map(day=>({day,minutes:content.sessionMinutes??Number.NaN})):[]}
  if(key==='available_equipment'&&!Object.hasOwn(content,'schemaVersion'))return {schemaVersion:2,equipment:content.equipment??'',
    resolvedEquipmentIds:content.resolvedEquipmentIds??[],unresolvedAthleteDescription:typeof content.equipment==='string'?content.equipment.trim()||null:null}
  return structuredClone(content)
}
export function validReviewedSetupEdit(key:string,content:unknown):boolean {
  return key==='primary_goal'?!!parseReviewedGoalMemory(content):key==='training_constraints'?!!parseReviewedConstraintMemory(content):validReviewedSetupMemory(key,content)
}

export function parseReviewedScheduleMemory(v: unknown): ReviewedScheduleMemory | null {
  if (!record(v) || !exact(v, ['schemaVersion','experience','sessionAvailability']) || v.schemaVersion !== 2
    || typeof v.experience !== 'string' || !['new_or_returning','consistent','experienced'].includes(v.experience)
    || !Array.isArray(v.sessionAvailability) || v.sessionAvailability.length < 2 || v.sessionAvailability.length > 6
    || !v.sessionAvailability.every(a => record(a) && exact(a, ['day','minutes']) && typeof a.day === 'string' && days.includes(a.day)
      && Number.isSafeInteger(a.minutes) && Number(a.minutes) >= 30 && Number(a.minutes) <= 90)
    || new Set(v.sessionAvailability.map(a => a.day)).size !== v.sessionAvailability.length) return null
  return structuredClone(v) as unknown as ReviewedScheduleMemory
}
export function parseReviewedEquipmentMemory(v: unknown): ReviewedEquipmentMemory | null {
  if (!record(v) || !exact(v, ['schemaVersion','equipment','resolvedEquipmentIds','unresolvedAthleteDescription'])
    || v.schemaVersion !== 2 || !description(v.equipment) || !Array.isArray(v.resolvedEquipmentIds)
    || v.resolvedEquipmentIds.length > equipmentIds.size
    || !v.resolvedEquipmentIds.every(id => typeof id === 'string' && equipmentIds.has(id))
    || new Set(v.resolvedEquipmentIds).size !== v.resolvedEquipmentIds.length
    || (v.unresolvedAthleteDescription !== null && !description(v.unresolvedAthleteDescription))
    || (!v.resolvedEquipmentIds.length && v.unresolvedAthleteDescription === null)) return null
  return structuredClone(v) as unknown as ReviewedEquipmentMemory
}
export function validReviewedSetupMemory(key: string, v: unknown): boolean {
  return key === 'training_schedule' ? !!parseReviewedScheduleMemory(v)
    : key === 'available_equipment' && !!parseReviewedEquipmentMemory(v)
}

/** Compare without flattening daily minutes, trimming original prose or inferring implements. */
export function reviewedSetupMatchesProfile(key: string, content: unknown, profile: ProgrammingProfile): boolean {
  if (key === 'training_schedule') {
    const saved = parseReviewedScheduleMemory(content)
    const availability = (a: ProgrammingSessionAvailability[]) => JSON.stringify([...a].sort((x,y) => x.day.localeCompare(y.day)))
    return !!saved && saved.experience === profile.trainingExperience
      && availability(saved.sessionAvailability) === availability(profile.sessionAvailability)
  }
  const saved = parseReviewedEquipmentMemory(content)
  return !!saved && saved.equipment === profile.equipment.athleteDescription
    && saved.unresolvedAthleteDescription === profile.equipment.unresolvedAthleteDescription
    && JSON.stringify([...saved.resolvedEquipmentIds].sort()) === JSON.stringify([...profile.equipment.resolvedIds].sort())
}
