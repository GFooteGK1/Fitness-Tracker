/** Owner-only current declarations. This is not factual confirmation or write authority. */
import { firstProfileUuid as uuid } from './first-reviewed-profile-contract'
import { validateReviewedProgrammingProfile,type ProgrammingProfile } from './programming-schema'
import { isSupervisedJson } from './supervised-candidate-draft'
import { hasOnlySupervisedReviewFields } from './supervised-programming-contract'
import { isValidTimezoneOffset,localDateToUTCStart,formatUTCAsLocalDateWithOffset } from '../timezone-utils'

export interface FirstReviewedSetupSeed {
  schemaVersion:1;userId:string;programId:string;basePlanVersionId:string;designationId:string;designationVersion:number;
  windowStart:string;sequenceNumber:number;historyDays:number;tzOffset:number;readAt:string;sourceHash:string;
  targetSetup:ProgrammingProfile;factsLoaded:false;numericRuntimeEligible:false
}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).sort().join(',')===[...keys].sort().join(',')
export function parseFirstReviewedSetupRead(v:unknown){
  if(!record(v)||!exact(v,['expectedUserId','programId','historyDays','tzOffset'])||![v.expectedUserId,v.programId].every(uuid)
    ||!Number.isSafeInteger(v.historyDays)||Number(v.historyDays)<1||Number(v.historyDays)>180
    ||!Number.isSafeInteger(v.tzOffset)||typeof v.tzOffset!=='number'||!isValidTimezoneOffset(v.tzOffset))return null
  return v as unknown as {expectedUserId:string;programId:string;historyDays:number;tzOffset:number}
}
export function parseFirstReviewedSetupSeed(v:unknown,actor:string,program:string):FirstReviewedSetupSeed|null {
  try{
    if(!isSupervisedJson(v)||!record(v)||!exact(v,['schemaVersion','userId','programId','basePlanVersionId','designationId','designationVersion',
      'windowStart','sequenceNumber','historyDays','tzOffset','readAt','sourceHash','targetSetup','factsLoaded','numericRuntimeEligible'])
      ||v.schemaVersion!==1||!uuid(actor)||!uuid(program)||v.userId!==actor||v.programId!==program
      ||![v.basePlanVersionId,v.designationId].every(uuid)||!Number.isSafeInteger(v.designationVersion)||Number(v.designationVersion)<1||Number(v.designationVersion)>2147483647
      ||!Number.isSafeInteger(v.sequenceNumber)||Number(v.sequenceNumber)<2||Number(v.sequenceNumber)>2147483647
      ||!parseFirstReviewedSetupRead({expectedUserId:actor,programId:program,historyDays:v.historyDays,tzOffset:v.tzOffset})
      ||typeof v.windowStart!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v.windowStart)
      ||formatUTCAsLocalDateWithOffset(localDateToUTCStart(v.windowStart,0),0)!==v.windowStart||new Date(localDateToUTCStart(v.windowStart,0)).getUTCDay()!==1
      ||typeof v.readAt!=='string'||!Number.isFinite(Date.parse(v.readAt))||typeof v.sourceHash!=='string'||!/^[a-f0-9]{64}$/.test(v.sourceHash)
      ||v.factsLoaded!==false||v.numericRuntimeEligible!==false||!record(v.targetSetup)||!hasOnlySupervisedReviewFields(v.targetSetup,'profile')
      ||!validateReviewedProgrammingProfile(v.targetSetup as unknown as ProgrammingProfile).ok||v.targetSetup.startDate!==v.windowStart
      ||JSON.stringify(v).length>500000)return null
    const profile=v.targetSetup
    // Retrieval and performed facts have a separate server preparation stage.
    // Reject a response claiming that the declaration seed already supplied them.
    if(profile.trainingIntent!==undefined||profile.planningContext!==undefined||profile.prescriptionBasis!==undefined||profile.executionPriority!==undefined
      ||!Array.isArray(profile.assessments)||profile.assessments.length||!record(profile.recentTraining)
      ||profile.recentTraining.asOfDate!==null||profile.recentTraining.lookbackDays!==0||profile.recentTraining.completedSessionCount!==0
      ||!Array.isArray(profile.recentTraining.performedMovementIds)||profile.recentTraining.performedMovementIds.length
      ||!Array.isArray(profile.recentTraining.doseByCoverageTarget)||profile.recentTraining.doseByCoverageTarget.length)return null
    return structuredClone(v) as unknown as FirstReviewedSetupSeed
  }catch{return null}
}
