// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { QwikImportPanel } from '@/app/program/qwik-import-panel'

const rawFixture = readFileSync(join(
  process.cwd(),
  'test',
  'fixtures',
  'qwik',
  'qwik-vbt-json-1.10.json'
), 'utf8')

describe('QwikImportPanel', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('previews locally and reuses the exact normalized request after interruption', async () => {
    const bodies: string[] = []
    const onImported = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(String(init?.body))
      if (bodies.length === 1) return response({ error: 'Write interrupted' }, 503)
      return response({
        result: { import_id: 'import-1', disposition: 'recorded', observation_group_count: 3, review_required: true },
        evidenceStatus: 'pending_review', adaptationEligible: false
      }, 201)
    }))

    render(<QwikImportPanel onImported={onImported} />)
    const fileInput = screen.getByLabelText('Choose Qwik JSON')
    expect(fileInput.className).toContain('min-h-11')
    expect(fileInput.className).toContain('text-base')
    await act(async () => fireEvent.change(fileInput, {
      target: { files: [file('qwik-export-2026-08-31.json', rawFixture)] }
    }))

    expect(await screen.findByRole('heading', { name: 'Normalized preview' })).not.toBeNull()
    expect(screen.getByText(/3 sets · 5 velocity readings/)).not.toBeNull()
    expect(screen.getByText(/2 mapped · 1 need a choice · 0 unsupported/)).not.toBeNull()
    expect(screen.getByText(/Original JSON and bar-path arrays stay on this device/)).not.toBeNull()

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save for review' })))
    expect((await screen.findByRole('alert')).textContent).toContain('preview is still here')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry same import' })))

    await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1))
    expect(bodies).toHaveLength(2)
    expect(bodies[0]).toBe(bodies[1])
    const request = JSON.parse(bodies[0])
    expect(request).toMatchObject({
      action: 'save_for_review',
      idempotencyKey: expect.stringMatching(/^qwik-import:/),
      normalizedImport: {
        sourceSystem: 'qwik_vbt',
        sourceSchemaVersion: 'qwik-vbt-json-1.10',
        rawStoragePolicy: 'user_retained_not_uploaded',
        sets: expect.arrayContaining([expect.objectContaining({ sourceSetId: 'set-bench-paused-1' })])
      }
    })
    expect(bodies[0]).not.toContain('rawText')
    expect(bodies[0]).not.toContain('export_format_version')
    expect(bodies[0]).not.toContain('"barPath":')
    expect(bodies[0]).not.toContain('bar_path')
  })

  it('shows validation errors and prevents a malformed file from being saved', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<QwikImportPanel onImported={vi.fn()} />)

    await act(async () => fireEvent.change(screen.getByLabelText('Choose Qwik JSON'), {
      target: { files: [file('not-qwik.json', '{bad json')] }
    }))

    expect(await screen.findByText('The file is not valid JSON.')).not.toBeNull()
    expect(screen.getByRole('alert').textContent).toContain('cannot be saved')
    expect((screen.getByRole('button', { name: 'Save for review' }) as HTMLButtonElement).disabled).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
function file(name: string, content: string): File {
  return {
    name,
    size: new TextEncoder().encode(content).byteLength,
    text: vi.fn().mockResolvedValue(content)
  } as unknown as File
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}
