/** Browser-safe exact setup requests. Declarations do not contain training facts. */
import { firstProfileUuid as uuid } from './first-reviewed-profile-contract'
import { validReviewedSetupEdit,reviewedSetupEditorValue } from './reviewed-setup-memory'
import { stableStringify } from './rolling-weekly-contracts'
import { isSupervisedJson } from './supervised-candidate-draft'

export const FIRST_REVIEW_SETUP_KEYS=['primary_goal','training_schedule','available_equipment','training_constraints'] as const
export type FirstReviewSetupKey=typeof FIRST_REVIEW_SETUP_KEYS[number]
export interface FirstReviewSetupDeclaration {
  memoryId:string;version:number;status:'confirmed'|'superseded'|'withdrawn';content:Record<string,unknown>
  effectiveFrom:string|null;effectiveUntil:string|null;reviewAfter:string|null
}
export type FirstReviewSetupDeclarations=Record<FirstReviewSetupKey,FirstReviewSetupDeclaration|null>
export type FirstReviewSetupContents=Record<FirstReviewSetupKey,Record<string,unknown>>
export interface FirstReviewSetupEditorSeed {
  schemaVersion:1;userId:string;programId:string;designationId:string;designationVersion:number;basePlanVersionId:string
  declarations:FirstReviewSetupDeclarations
}
export interface FirstReviewSetupRequest {
  schemaVersion:1;expectedUserId:string;programId:string;designationId:string;designationVersion:number;basePlanVersionId:string
  requestId:string;expectedDeclarations:FirstReviewSetupDeclarations;contents:FirstReviewSetupContents
}
export interface FirstReviewSetupReceipt {
  userId:string;programId:string;requestId:string
  memories:Record<FirstReviewSetupKey,{memoryId:string;version:number;content:Record<string,unknown>}>
}
export type FirstReviewSetupResolution={schemaVersion:1;request:FirstReviewSetupRequest;disposition:'not_found'}
  |{schemaVersion:1;request:FirstReviewSetupRequest;disposition:'no_write';receipt:null;resolvedAt:string}
  |{schemaVersion:1;request:FirstReviewSetupRequest;disposition:'saved';receipt:FirstReviewSetupReceipt;resolvedAt:string}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const exact=(v:Record<string,unknown>,keys:readonly string[])=>Object.keys(v).sort().join(',')===[...keys].sort().join(',')
const integer=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>0&&Number(v)<=2147483647
const date=(v:unknown):v is string=>typeof v==='string'&&v.length<=40
  &&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v))
const bounded=(v:unknown)=>isSupervisedJson(v)&&new TextEncoder().encode(JSON.stringify(v)).length<=100000
function declarations(v:unknown):v is FirstReviewSetupDeclarations{
  return record(v)&&exact(v,FIRST_REVIEW_SETUP_KEYS)&&FIRST_REVIEW_SETUP_KEYS.every(key=>{
    const d=v[key]
    return d===null||(record(d)&&exact(d,['memoryId','version','status','content','effectiveFrom','effectiveUntil','reviewAfter'])
      &&uuid(d.memoryId)&&integer(d.version)&&typeof d.status==='string'&&['confirmed','superseded','withdrawn'].includes(d.status)
      &&record(d.content)&&['effectiveFrom','effectiveUntil','reviewAfter'].every(k=>d[k]===null||date(d[k])))
  })
}
export function parseFirstReviewSetupEditorSeed(v:unknown,actor:string,program:string):FirstReviewSetupEditorSeed|null{
  try{
    return uuid(actor)&&uuid(program)&&bounded(v)&&record(v)&&exact(v,['schemaVersion','userId','programId','designationId','designationVersion','basePlanVersionId','declarations'])
      &&v.schemaVersion===1&&v.userId===actor&&v.programId===program&&uuid(v.designationId)&&uuid(v.basePlanVersionId)
      &&integer(v.designationVersion)&&declarations(v.declarations)?structuredClone(v) as unknown as FirstReviewSetupEditorSeed:null
  }catch{return null}
}
export function parseFirstReviewSetupRequest(v:unknown):FirstReviewSetupRequest|null{
  try{
    return bounded(v)&&record(v)&&exact(v,['schemaVersion','expectedUserId','programId','designationId','designationVersion','basePlanVersionId','requestId','expectedDeclarations','contents'])
      &&v.schemaVersion===1&&[v.expectedUserId,v.programId,v.designationId,v.basePlanVersionId,v.requestId].every(uuid)
      &&integer(v.designationVersion)&&declarations(v.expectedDeclarations)&&record(v.contents)&&exact(v.contents,FIRST_REVIEW_SETUP_KEYS)
      &&FIRST_REVIEW_SETUP_KEYS.every(key=>validReviewedSetupEdit(key,(v.contents as Record<string,unknown>)[key]))
      ?structuredClone(v) as unknown as FirstReviewSetupRequest:null
  }catch{return null}
}
export function firstReviewSetupEdits(seed:FirstReviewSetupEditorSeed):FirstReviewSetupContents{
  return Object.fromEntries(FIRST_REVIEW_SETUP_KEYS.map(key=>{
    const empty=key==='primary_goal'?{goal:'',primaryDomain:'',secondaryGoals:[]}:key==='training_constraints'?{constraints:'',constraintKinds:[]}:{}
    return [key,reviewedSetupEditorValue(key,seed.declarations[key]?.content??empty)]
  })) as FirstReviewSetupContents
}
export function parseFirstReviewSetupResolution(v:unknown,request:FirstReviewSetupRequest):FirstReviewSetupResolution|null{
  try{
    if(!bounded(v)||!record(v)||v.schemaVersion!==1||!parseFirstReviewSetupRequest(request)||stableStringify(v.request)!==stableStringify(request))return null
    if(v.disposition==='not_found')return exact(v,['schemaVersion','request','disposition'])?structuredClone(v) as FirstReviewSetupResolution:null
    if(!exact(v,['schemaVersion','request','disposition','receipt','resolvedAt'])||!date(v.resolvedAt))return null
    if(v.disposition==='no_write')return v.receipt===null?structuredClone(v) as FirstReviewSetupResolution:null
    const r=v.receipt
    if(v.disposition!=='saved'||!record(r)||!exact(r,['userId','programId','requestId','memories'])
      ||r.userId!==request.expectedUserId||r.programId!==request.programId||r.requestId!==request.requestId||!record(r.memories)
      ||!exact(r.memories,FIRST_REVIEW_SETUP_KEYS))return null
    const memories=r.memories
    if(!FIRST_REVIEW_SETUP_KEYS.every(key=>{
      const m=memories[key],prior=request.expectedDeclarations[key]
      return record(m)&&exact(m,['memoryId','version','content'])&&uuid(m.memoryId)&&integer(m.version)
        &&m.memoryId!==prior?.memoryId&&m.version===(prior?.version??0)+1&&stableStringify(m.content)===stableStringify(request.contents[key])
    })||new Set(FIRST_REVIEW_SETUP_KEYS.map(key=>(memories[key] as Record<string,unknown>).memoryId)).size!==4)return null
    return structuredClone(v) as FirstReviewSetupResolution
  }catch{return null}
}
