'use client'

import { use } from 'react'
import { useAuth } from '@/app/lib/auth/AuthContext'
import ProtectedRoute from '@/app/components/auth/ProtectedRoute'
import { ReviewedSessionRunner } from '../../reviewed-session-runner'

export default function ReviewedSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params), { user } = useAuth()
  return <ProtectedRoute>{user && <ReviewedSessionRunner key={`${user.id}:${id}`} userId={user.id} sessionId={id} />}</ProtectedRoute>
}
