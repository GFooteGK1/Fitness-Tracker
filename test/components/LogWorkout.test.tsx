// @vitest-environment jsdom
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import LogWorkout from '@/app/log/page'
import { sendLoggingRequest } from '@/app/lib/client/logging-request'
vi.mock('@/app/lib/auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 'athlete' } }) }))
vi.mock('@/app/lib/client/logging-request', () => ({ sendLoggingRequest: vi.fn() }))
vi.mock('@/app/components/PRNotification', () => ({ default: () => null }))
beforeEach(() => { vi.clearAllMocks(); window.history.replaceState({}, '', '/log') })
it('prefills a template once, including percent signs, without saving', () => {
  window.history.replaceState({}, '', '/log?workout=' + encodeURIComponent('Squat at 75% effort'))
  render(<LogWorkout />)
  expect(screen.getByRole('textbox')).toHaveValue('Squat at 75% effort')
  expect(sendLoggingRequest).not.toHaveBeenCalled()
})
it('preserves editable workout text when canonical save fails', async () => {
  vi.mocked(sendLoggingRequest).mockResolvedValue(new Response(JSON.stringify({ error: 'Try again' }), { status: 503 }))
  render(<LogWorkout />)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Grace 9:47 Rx' } })
  fireEvent.click(screen.getByRole('button', { name: /Submit Workout/ }))
  await waitFor(() => expect(screen.getByText('Error: Try again')).toBeInTheDocument())
  expect(screen.getByRole('textbox')).toHaveValue('Grace 9:47 Rx')
  expect(sendLoggingRequest).toHaveBeenCalledWith('/api/parse-workout', expect.objectContaining({ method: 'POST' }), 'athlete')
})
