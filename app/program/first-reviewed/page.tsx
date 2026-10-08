'use client'
import { useAuth } from '@/app/lib/auth/AuthContext'
import ProtectedRoute from '@/app/components/auth/ProtectedRoute'
import { FirstReviewedWorkspace } from '../first-reviewed-workspace'
export default function FirstReviewedProgrammingPage(){
  const {user}=useAuth()
  return <ProtectedRoute>{user&&<FirstReviewedWorkspace key={user.id} userId={user.id}/>}</ProtectedRoute>
}
