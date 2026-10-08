/** Native loopback transport only; no Next, Auth, PostgreSQL or retained writes. */
import { describe,it,expect } from 'vitest'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { FirstReviewResponseLoss,firstReviewLocalTarget as t,firstReviewSuppressResponse,firstReviewAdmitted } from '../../scripts/release/first-reviewed-next-scope.mjs'
import { LocalRequestDrain } from '../../scripts/release/supervised-browser-finalization'

describe('single original acceptance response-loss control',()=>{
  it('arms once for the exact run/program and consumes only the original owner acceptance',()=>{
    const runId=randomUUID(),requestId=randomUUID(),control=new FirstReviewResponseLoss(runId)
    const arm={operation:'lose_acceptance_response',runId,programId:t.programId,requestId}
    expect(control.arm({...arm,runId:randomUUID()})).toBe(false)
    expect(control.arm({...arm,extra:true})).toBe(false)
    expect(control.arm(arm)).toBe(true)
    expect(control.arm(arm)).toBe(false)
    const pending={operation:'accept',userId:t.ownerId,body:{expectedUserId:t.ownerId,requestId}}
    expect(control.take('/api/coach/first-reviewed/resolution',pending)).toBe(false)
    expect(control.take('/api/coach/first-reviewed',{...pending,userId:t.foreignId})).toBe(false)
    expect(control.take('/api/coach/first-reviewed',pending)).toBe(true)
    expect(control.take('/api/coach/first-reviewed',pending)).toBe(false)
  })
  it('drops the successful native HTTP response after handler completion and permits getter-only recovery',async()=>{
    const drain=new LocalRequestDrain(),journal:unknown[]=[]
    let committed=false,writes=0,lost=false
    const server=createServer(async(req,res)=>{
      await firstReviewAdmitted(drain,async()=>{
        const chunks:Buffer[]=[]
        const didLose=firstReviewSuppressResponse(res,()=>req.method==='POST',(chunk:string|Uint8Array)=>chunks.push(typeof chunk==='string'?Buffer.from(chunk):Buffer.from(chunk)))
        res.writeHead(200,{'Content-Type':'application/json'})
        if(req.method==='POST'){writes++;await Promise.resolve();committed=true;res.end(JSON.stringify({kind:'accepted'}))}
        else res.end(JSON.stringify({kind:committed?'saved':'unresolved'}))
        lost ||= didLose();journal.push(JSON.parse(Buffer.concat(chunks).toString()))
      })
    })
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
    try{
      const address=server.address();if(!address||typeof address==='string')throw Error('Loopback port unavailable')
      const url=`http://127.0.0.1:${address.port}`
      await expect(fetch(url,{method:'POST'})).rejects.toThrow()
      expect(committed).toBe(true);expect(lost).toBe(true)
      expect(await(await fetch(url)).json()).toEqual({kind:'saved'})
      expect(writes).toBe(1);expect(journal).toEqual([{kind:'accepted'},{kind:'saved'}])
      await drain.begin()
    }finally{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()))}
  })
  it('leaves a denied response visible even when loss is armed',async()=>{
    const server=createServer((_req,res)=>{
      firstReviewSuppressResponse(res,()=>true,()=>undefined)
      res.writeHead(409,{'Content-Type':'application/json'});res.end(JSON.stringify({kind:'disabled'}))
    })
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
    try{
      const address=server.address();if(!address||typeof address==='string')throw Error('Loopback port unavailable')
      const response=await fetch(`http://127.0.0.1:${address.port}`)
      expect(response.status).toBe(409);expect(await response.json()).toEqual({kind:'disabled'})
    }finally{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()))}
  })
})
