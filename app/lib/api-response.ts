import { NextResponse } from 'next/server'

/**
 * Shared helper for consistent API error responses.
 * All API routes should use this instead of constructing NextResponse.json manually for errors.
 *
 * Shape: { error: string, details?: string }
 */
export function apiError(message: string, status: number, details?: string): NextResponse {
  return NextResponse.json(
    { error: message, ...(details ? { details } : {}) },
    { status }
  )
}
