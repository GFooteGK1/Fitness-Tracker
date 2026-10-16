import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { denialProbe, fixedDenialBody, allowedDenialPath } from './supervised-next-denial-scope.mjs'
const body={expectedUserId:'owner',requestId:'reserved',report:{rir:2,rpe:7}}
const envelope={path:'/api/coach/reviewed/sessions/fixed/sets',method:'POST',body,bodySha256:createHash('sha256').update(JSON.stringify(body)).digest('hex')}
const source={requests:{revoked_set:envelope}}
test('only exact pre-reserved actor, path and body can enter actual denial handler',()=>{
  assert.deepEqual(denialProbe(source,'revoked_set','owner'),envelope)
  assert.throws(()=>denialProbe(source,'revoked_set','reviewer'))
  assert.throws(()=>denialProbe(source,'unknown','owner'))
  assert.throws(()=>denialProbe({requests:{revoked_set:{...envelope,bodySha256:'changed'}}},'revoked_set','owner'))
  assert.equal(fixedDenialBody(source,envelope.path,body,JSON.stringify(body)),true)
  assert.equal(fixedDenialBody(source,envelope.path,body,JSON.stringify(body,null,2)),false)
  assert.equal(fixedDenialBody(source,envelope.path,body),false)
  assert.equal(fixedDenialBody(source,envelope.path,{...body,requestId:'replacement'},JSON.stringify({...body,requestId:'replacement'})),false)
  assert.equal(fixedDenialBody(source,'/api/coach/supervised/issue',body,JSON.stringify(body)),false)
})
test('allowlist admits local cookie controls and exact handlers while rejecting unrelated writes/queries',()=>{
  assert.equal(allowedDenialPath(source,'POST',envelope.path),true)
  assert.equal(allowedDenialPath(source,'GET',envelope.path),false)
  assert.equal(allowedDenialPath(source,'POST',envelope.path,'?extra=1'),false)
  assert.equal(allowedDenialPath(source,'POST','/api/profile'),false)
  assert.equal(allowedDenialPath(source,'GET','/api/profile'),true)
  assert.equal(allowedDenialPath(source,'POST','/api/local-supervised-test/login'),true)
  assert.equal(allowedDenialPath(source,'GET','/_next/static/chunks/a.js','?v=1'),true)
  assert.equal(allowedDenialPath(source,'POST','/api/coach/supervised/candidates'),false)
})
