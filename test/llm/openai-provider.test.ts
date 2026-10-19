/**
 * Tests for the OpenAI provider's request/response mapping (Responses API).
 *
 * Verifies neutral LlmRequest -> Responses params (instructions, images,
 * tools, json_schema, reasoning) and Response -> LlmResult normalization
 * (output_text, function_call extraction, usage, stop-reason incl. length).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockCreate = vi.fn()
const clientOptions: Array<{fetch?: typeof fetch; baseURL?:string; maxRetries?:number}> = []
vi.mock('openai', () => ({
  default: class {
    constructor(options:typeof clientOptions[number]){clientOptions.push(options)}
    responses = { create: mockCreate }
  },
}))

import { openaiProvider } from '../../app/lib/llm/providers/openai'
import type { LlmRequest } from '../../app/lib/llm/types'

function baseResponse(overrides: Record<string, unknown> = {}) {
  return {
    output_text: '',
    output: [],
    usage: { input_tokens: 0, output_tokens: 0 },
    status: 'completed',
    incomplete_details: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('OPENAI_API_KEY', 'test-key')
  clientOptions.length=0
})

afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks()})

describe('openaiProvider.chat', () => {
  it.each([
    { status: 'incomplete', incomplete_details: { reason: 'content_filter' }, output: [] },
    { status: 'failed', output: [] },
    { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'Synthetic refusal' }] }] },
  ])('rejects any incomplete or refused evidence response even with usable-looking JSON: %j', async overrides => {
    mockCreate.mockResolvedValue(baseResponse({ ...overrides, output_text: '{"items":[]}' }))
    await expect(openaiProvider.chat({ purpose:'vision',messages:[],maxTokens:1024,maxRetries:0,requireComplete:true },'synthetic-model')).rejects.toThrow('Incomplete or refused')
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })
  it('honors non-storage for the pilot and retains the provider-reported model identifier', async () => {
    mockCreate.mockResolvedValue(baseResponse({ output_text:'{}',model:'synthetic-provider-snapshot' }))
    const result=await openaiProvider.chat({purpose:'vision',messages:[],maxTokens:1024,store:false,requireComplete:true},'synthetic-request-alias')
    expect(mockCreate.mock.calls[0][0].store).toBe(false);expect(result.model).toBe('synthetic-provider-snapshot')
  })
  it('normalizes a plain text response and maps system -> instructions', async () => {
    mockCreate.mockResolvedValue(
      baseResponse({ output_text: 'hello world', usage: { input_tokens: 12, output_tokens: 3 } })
    )

    const req: LlmRequest = {
      purpose: 'nutrition',
      system: 'You are a nutritionist.',
      messages: [{ role: 'user', content: 'log my lunch' }],
      maxTokens: 1024,
      temperature: 0,
    }
    const result = await openaiProvider.chat(req, 'gpt-5.4-nano')

    expect(result.text).toBe('hello world')
    expect(result.usage).toEqual({ input: 12, output: 3 })
    expect(result.stopReason).toBe('stop')
    expect(result.provider).toBe('openai')

    const params = mockCreate.mock.calls[0][0]
    expect(params.model).toBe('gpt-5.4-nano')
    expect(params.max_output_tokens).toBe(1024)
    expect(params.instructions).toBe('You are a nutritionist.')
  })

  it('maps an image content part to an input_image data URL', async () => {
    mockCreate.mockResolvedValue(baseResponse({ output_text: 'ok' }))

    const req: LlmRequest = {
      purpose: 'vision',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', mediaType: 'image/png', base64: 'AAAA' },
            { type: 'text', text: 'what is this?' },
          ],
        },
      ],
      maxTokens: 512,
    }
    await openaiProvider.chat(req, 'gpt-5.6-luna')

    const params = mockCreate.mock.calls[0][0]
    const block = params.input[0].content[0]
    expect(block).toEqual({
      type: 'input_image',
      image_url: 'data:image/png;base64,AAAA',
      detail: 'auto',
    })
  })

  it('extracts function_call output items and maps to tool_calls', async () => {
    mockCreate.mockResolvedValue(
      baseResponse({
        output: [
          { type: 'function_call', call_id: 'c1', name: 'log_meal', arguments: '{"food":"eggs"}' },
        ],
      })
    )

    const req: LlmRequest = {
      purpose: 'agent',
      messages: [{ role: 'user', content: 'log 3 eggs' }],
      tools: [{ name: 'log_meal', description: 'log a meal', parameters: { type: 'object' } }],
      maxTokens: 4096,
    }
    const result = await openaiProvider.chat(req, 'gpt-5.6-terra')

    expect(result.toolCalls).toEqual([{ id: 'c1', name: 'log_meal', input: { food: 'eggs' } }])
    expect(result.stopReason).toBe('tool_calls')

    const params = mockCreate.mock.calls[0][0]
    expect(params.tools[0]).toEqual({
      type: 'function',
      name: 'log_meal',
      description: 'log a meal',
      parameters: { type: 'object' },
      strict: false,
    })
  })

  it('requests strict json_schema structured output when asked', async () => {
    mockCreate.mockResolvedValue(baseResponse({ output_text: '{}' }))

    const req: LlmRequest = {
      purpose: 'nutrition',
      messages: [{ role: 'user', content: 'parse this' }],
      maxTokens: 1024,
      responseFormat: 'json',
      jsonSchema: { name: 'meal', schema: { type: 'object' } },
      reasoningEffort: 'low',
    }
    await openaiProvider.chat(req, 'gpt-5.4-nano')

    const params = mockCreate.mock.calls[0][0]
    expect(params.text.format).toEqual({
      type: 'json_schema',
      name: 'meal',
      schema: { type: 'object' },
      strict: true,
    })
    expect(params.reasoning).toEqual({ effort: 'low' })
  })

  it('maps an incomplete (length-capped) response to max_tokens', async () => {
    mockCreate.mockResolvedValue(
      baseResponse({
        output_text: 'partial',
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
      })
    )

    const result = await openaiProvider.chat(
      { purpose: 'workout', messages: [{ role: 'user', content: 'x' }], maxTokens: 8 },
      'gpt-5.4-nano'
    )
    expect(result.stopReason).toBe('max_tokens')
  })
})

it('checks the request-local guard at final fetch and pins endpoint/tier/retries',async()=>{
  const transport=vi.fn(async(_input:RequestInfo | URL,_init?:RequestInit)=>new Response('{}'));vi.stubGlobal('fetch',transport)
  mockCreate.mockImplementation(async()=>{await clientOptions.at(-1)!.fetch!('https://api.openai.com/v1/responses',{method:'POST'});return baseResponse()})
  const req:LlmRequest={purpose:'vision',messages:[],maxTokens:1024,maxRetries:0,serviceTier:'default',beforeDispatch:()=>{throw new Error('expired')}}
  await expect(openaiProvider.chat(req,'gpt-5.6-luna')).rejects.toThrow('expired');expect(transport).not.toHaveBeenCalled()
  req.beforeDispatch=vi.fn();await openaiProvider.chat(req,'gpt-5.6-luna')
  expect(req.beforeDispatch).toHaveBeenCalledOnce();expect(transport).toHaveBeenCalledOnce()
  expect(transport.mock.calls[0][1]).toMatchObject({redirect:'error'})
  expect(clientOptions.at(-1)).toMatchObject({baseURL:'https://api.openai.com/v1',maxRetries:0})
  expect(mockCreate.mock.calls.at(-1)![0]).toMatchObject({model:'gpt-5.6-luna',service_tier:'default',max_output_tokens:1024})
  expect(mockCreate.mock.calls.at(-1)![1].maxRetries).toBe(0)
})

it('refuses final fetch after asynchronous SDK preparation outlives the grant',async()=>{
  const {photoDispatchGuard}=await import('@/app/lib/nutrition/photo-pilot-budget')
  const transport=vi.fn(async(_input:RequestInfo | URL,_init?:RequestInit)=>new Response('{}'));vi.stubGlobal('fetch',transport)
  let now=0;vi.spyOn(performance,'now').mockImplementation(()=>now)
  mockCreate.mockImplementation(async()=>{await Promise.resolve();now=11000;await clientOptions.at(-1)!.fetch!('https://api.openai.com/v1/responses',{method:'POST'});return baseResponse()})
  const grant={policy:'openai-owner-30d-v1',stage:'estimate',captureId:'synthetic',model:'gpt-5.6-luna',reservedMicroUsd:600000,remainingMs:60001}
  await expect(openaiProvider.chat({purpose:'vision',messages:[],maxTokens:1024,maxRetries:0,beforeDispatch:photoDispatchGuard(grant,'estimate','synthetic',0)},'gpt-5.6-luna')).rejects.toThrow('expired')
  expect(transport).not.toHaveBeenCalled()
})

it('retains raw complete provider counts separately from legacy zero defaults',async()=>{
  mockCreate.mockResolvedValue(baseResponse({id:'resp_synthetic',model:'gpt-5.6-luna',service_tier:'default',usage:{input_tokens:5000,output_tokens:1024,total_tokens:6024}}))
  const request:LlmRequest={purpose:'vision',messages:[],maxTokens:1024,maxRetries:0,store:false,requireComplete:true,beforeDispatch:()=>{},serviceTier:'default'}
  expect((await openaiProvider.chat(request,'gpt-5.6-luna')).billing).toEqual({receiptId:'resp_synthetic',inputTokens:5000,outputTokens:1024,totalTokens:6024,serviceTier:'default'})
  mockCreate.mockResolvedValue(baseResponse({id:'resp_missing',model:'gpt-5.6-luna',service_tier:'default',usage:undefined}))
  const absent=await openaiProvider.chat(request,'gpt-5.6-luna')
  expect(absent.usage).toEqual({input:0,output:0});expect(absent.billing).toBeUndefined()
})
