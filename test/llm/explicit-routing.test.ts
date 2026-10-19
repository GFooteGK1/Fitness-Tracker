import { afterEach,beforeEach,expect,it,vi } from 'vitest'
const {openai,anthropic}=vi.hoisted(()=>({openai:vi.fn(),anthropic:vi.fn()}))
vi.mock('@/app/lib/llm/providers/openai',()=>({openaiProvider:{chat:openai}}))
vi.mock('@/app/lib/llm/providers/anthropic',()=>({anthropicProvider:{chat:anthropic}}))
import {complete} from '@/app/lib/llm/client'
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('LLM_PROVIDER','anthropic');vi.stubEnv('LLM_VISION_PROVIDER','anthropic')})
afterEach(()=>vi.unstubAllEnvs())
const request={purpose:'vision' as const,messages:[],maxTokens:1024,maxRetries:0}
it('pins only the explicit call to OpenAI and leaves default routing unchanged',async()=>{
  openai.mockResolvedValue({provider:'openai',model:'test',usage:{input:1,output:1}})
  anthropic.mockResolvedValue({provider:'anthropic',model:'test',usage:{input:1,output:1}})
  await complete(request,{provider:'openai'});expect(openai).toHaveBeenCalledTimes(1);expect(anthropic).not.toHaveBeenCalled()
  await complete(request);expect(anthropic).toHaveBeenCalledTimes(1)
})
it('never falls back to another provider on explicit OpenAI failure',async()=>{
  openai.mockRejectedValue(new Error('unavailable'))
  await expect(complete(request,{provider:'openai'})).rejects.toThrow('unavailable')
  expect(openai).toHaveBeenCalledTimes(1);expect(anthropic).not.toHaveBeenCalled()
})

it('pins the approved model despite provider-wide and purpose overrides',async()=>{
  vi.stubEnv('LLM_OPENAI_VISION_MODEL','other-model');vi.stubEnv('LLM_OPENAI_MODEL','other-model')
  openai.mockResolvedValue({provider:'openai',model:'gpt-5.6-luna',usage:{input:1,output:1}})
  await complete(request,{provider:'openai',model:'gpt-5.6-luna'})
  expect(openai.mock.calls[0][1]).toBe('gpt-5.6-luna');expect(anthropic).not.toHaveBeenCalled()
})
