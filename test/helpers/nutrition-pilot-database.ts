import type { PGlite } from '@electric-sql/pglite'
import { photoDraftDatabase } from './photo-draft-database'
import { sqlFile } from '../database/fixture'
import { createHash } from 'node:crypto'

export const pilotTestOwner = '11111111-1111-4111-8111-111111111111'
export async function nutritionPilotDatabase(active = true, clock?: string) {
  const db = await photoDraftDatabase()
  // Only this disposable synthetic copy changes the literal activation gate and
  // owner digest. Production SQL/file is not modified or executed externally.
  if (clock) {
    await db.exec(`CREATE TABLE pilot_test_clock(at TIMESTAMPTZ NOT NULL);
      CREATE FUNCTION public.pilot_test_clock() RETURNS timestamptz LANGUAGE sql SECURITY DEFINER AS $$ SELECT at FROM public.pilot_test_clock $$;`)
    await db.query('INSERT INTO pilot_test_clock VALUES($1)',[clock])
  }
  let sql = sqlFile('docs/migrations/nutrition-photo-owner-pilot.sql')
  if (active) sql = sql.replaceAll('IF NOT false THEN','IF NOT true THEN')
  sql = sql.replaceAll('2bf29505900fa586ff4ff34b6f049944c0f44fcc7786ffb5ac6acb1d66b76543',createHash('sha256').update(pilotTestOwner).digest('hex'))
  if(clock)sql=sql.replaceAll('clock_timestamp()', 'public.pilot_test_clock()')
  await db.exec(sql)
  await db.exec(`CREATE TABLE daily_targets(user_id UUID PRIMARY KEY,target_protein NUMERIC,target_carbs NUMERIC,target_fat NUMERIC,target_calories NUMERIC,tolerance_pct NUMERIC,updated_at TIMESTAMPTZ DEFAULT now());
    ALTER TABLE daily_targets ENABLE ROW LEVEL SECURITY;
    CREATE POLICY owner ON daily_targets TO authenticated USING(user_id=auth.uid());
    GRANT SELECT ON daily_targets TO authenticated;`)
  return db
}

/** Real SQL functions/RLS, mock storage transport only. Never an external client. */
export function nutritionPilotClient(db: PGlite, owner: () => string|null) {
  const objects = new Map<string,Uint8Array>()
  const rpcArgs: Record<string,string[]> = { nutrition_photo_pilot:['p_id','p_action','p_payload'],
    amend_logged_activity:['p_kind','p_entity_id','p_expected_revision','p_request_id','p_record','p_blocks','p_provenance'] }
  const client = {
    objects,
    auth:{getUser:async()=>({data:{user:owner()?{id:owner()}:null},error:null})},
    storage:{from:(bucket:string)=>({upload:async(path:string,bytes:Uint8Array,options:{upsert:boolean})=>{
      if (bucket!=='meal-photos' || !owner() || !path.startsWith('meals/'+owner()+'/nutrition-pilot/') || options.upsert || objects.has(path)) return {error:{code:'rejected'}}
      objects.set(path,bytes);return {error:null}
    }})},
    rpc:async(name:string,args:Record<string,unknown>)=>{
      const names=rpcArgs[name];if(!names)throw new Error('Unsupported test RPC')
      try { const result=await db.query<{value:unknown}>(`SELECT ${name}(${names.map((_,i)=>'$'+(i+1)).join(',')}) value`,names.map(k=>args[k]??null));return {data:result.rows[0].value,error:null} }
      catch(error){return {data:null,error:{code:(error as {code:string}).code,message:(error as Error).message}}}
    },
    from:(table:string)=>{
      if(!['nutrition_photo_captures','meals','daily_targets','activity_revisions'].includes(table))throw new Error('Unsupported test table')
      let fields='*',limit=50,single=false;const filters:string[]=[],values:unknown[]=[],orders:string[]=[]
      const column=(c:string)=>{if(!/^[a-z_]+$/.test(c))throw new Error('Invalid test field');return c}
      const filter=(c:string,v:unknown,op:string)=>{values.push(v);filters.push(`${column(c)}${op}$${values.length}`);return q}
      const run=async()=>{try{
        const where=filters.length?' WHERE '+filters.join(' AND '):''
        const count=await db.query<{n:number}>(`SELECT count(*)::int n FROM ${table}${where}`,values)
        const result=await db.query(`SELECT ${fields} FROM ${table}${where}${orders.length?' ORDER BY '+orders.join(','):''} LIMIT ${limit}`,values)
        if(single&&result.rows.length>1)return {data:null,error:{code:'many'},count:null}
        return {data:single?result.rows[0]??null:result.rows,error:null,count:count.rows[0].n}
      }catch(error){return {data:null,error:{code:(error as {code:string}).code},count:null}}}
      const q={select:(value='*',_options?:unknown)=>{if(!/^(\*|[a-z_,]+)$/.test(value))throw new Error('Invalid test fields');fields=value;return q},
        eq:(c:string,v:unknown)=>filter(c,v,'='),gte:(c:string,v:unknown)=>filter(c,v,'>='),lt:(c:string,v:unknown)=>filter(c,v,'<'),
        order:(c:string,options:{ascending?:boolean})=>{orders.push(column(c)+(options.ascending===false?' DESC':' ASC'));return q},
        limit:(v:number)=>{limit=Math.floor(v);return q},maybeSingle:()=>{single=true;return run()},single:()=>{single=true;return run()},
        then:<T,>(resolve:(r:Awaited<ReturnType<typeof run>>)=>T)=>run().then(resolve)}
      return q
    }
  }
  return client
}

/** Test-only service transport. SET LOCAL is contained in its own transaction;
 * no HTTP, credential, hosted DB or shared role mutation is involved. */
export function nutritionPilotSettlementClient(db:PGlite) {
  return {rpc:async(name:string,args:Record<string,unknown>)=>{
    if(name!=='settle_nutrition_photo_usage')throw new Error('Unsupported service test RPC')
    try{return await db.transaction(async tx=>{
      await tx.exec('SET LOCAL ROLE service_role')
      const result=await tx.query<{value:unknown}>('SELECT settle_nutrition_photo_usage($1,$2,$3,$4) value',
        [args.p_capture_id,args.p_owner,args.p_stage,args.p_evidence])
      return {data:result.rows[0].value,error:null}
    })}catch(error){return {data:null,error:{code:(error as {code:string}).code}}}
  }}
}
