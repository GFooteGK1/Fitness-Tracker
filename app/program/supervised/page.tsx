'use client'

import { useAuth } from '@/app/lib/auth/AuthContext'
import ProtectedRoute from '@/app/components/auth/ProtectedRoute'
import { SupervisedWorkspace } from '../supervised-workspace'

export default function SupervisedProgrammingPage() {
  const { user } = useAuth()
  return <ProtectedRoute>{user && <SupervisedWorkspace key={user.id} userId={user.id} />}</ProtectedRoute>
}
