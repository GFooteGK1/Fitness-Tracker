import type { SetupMemoryBindings } from '@/app/lib/coach/setup-memory-bindings'
import type { ProgrammingProfile } from '@/app/lib/coach/programming-schema'

/** Synthetic current declarations, deliberately different from the legacy fixture. */
export function currentSetupBindings():SetupMemoryBindings {
  const content:Record<string,Record<string,unknown>>={
    primary_goal:{goal:'Develop running capacity with strength maintained.',primaryDomain:'aerobic',secondaryGoals:[
      {domain:'strength',allocation:'maintenance',athleteIntent:'Maintain strength while developing running.'}]},
    training_schedule:{schemaVersion:2,experience:'experienced',sessionAvailability:[{day:'tuesday',minutes:45},{day:'saturday',minutes:75}]},
    available_equipment:{schemaVersion:2,equipment:' A bench, barbell and an unmeasured outdoor area. ',
      resolvedEquipmentIds:['barbell','bench','bodyweight'],unresolvedAthleteDescription:'Outdoor distance and runout need confirmation.'},
    training_constraints:{constraints:'Ask about the outdoor surface.',constraintKinds:[]},
  }
  return {schemaVersion:1,memories:Object.fromEntries(Object.entries(content).map(([key,value],i)=>[key,{
    memoryId:`00000000-0000-4000-8000-${String(i+100).padStart(12,'0')}`,memoryVersion:2,currentAtRead:true,
    lifecycle:{status:'confirmed',effectiveFrom:null,effectiveUntil:null,reviewAfter:null},content:value}]))}
}
export function currentSetupContents() {
  return Object.fromEntries(Object.entries(currentSetupBindings().memories).map(([key,binding])=>[key,binding!.content]))
}
export function declarationSeed(profile:ProgrammingProfile) {
  return {schemaVersion:1,userId:'00000000-0000-4000-8000-000000000001',programId:'00000000-0000-4000-8000-000000000010',
    basePlanVersionId:'00000000-0000-4000-8000-000000000011',designationId:'00000000-0000-4000-8000-000000000020',
    designationVersion:1,windowStart:'2026-10-05',sequenceNumber:2,historyDays:90,tzOffset:300,
    readAt:'2026-10-05T12:00:00Z',sourceHash:'a'.repeat(64),targetSetup:profile,factsLoaded:false,numericRuntimeEligible:false}
}
