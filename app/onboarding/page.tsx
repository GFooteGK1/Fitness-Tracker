'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/lib/auth/AuthContext'
import AuthLayout from '@/app/components/auth/AuthLayout'
import GoalsSelection from '@/app/components/profile/GoalsSelection'
import { isOnboardingComplete } from '@/app/lib/auth/onboarding'

export default function OnboardingPage() {
  const { user, profile, loading, refreshProfile, hasCompletedOnboarding } = useAuth()
  const router = useRouter()
  const [goals, setGoals] = useState<string[]>([])
  const [activity, setActivity] = useState('')
  const [age, setAge] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (!loading && !user) router.push('/auth/signin'); else if (!loading && hasCompletedOnboarding) router.push('/dashboard') }, [loading, user, hasCompletedOnboarding, router])
  useEffect(() => { if (profile) { setGoals(profile.fitnessGoals || []); setAge(profile.bodyMetrics.age?.toString() || '') } }, [profile])
  const complete = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!isOnboardingComplete({ age: Number(age) }, goals)) { setError('Choose at least one goal and enter an age from 13 to 120.'); return }
    if (!activity) { setError('Choose your usual activity level.'); return }
    setSaving(true); setError('')
    try {
      const response = await fetch('/api/profile/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body_metrics: { ...profile?.bodyMetrics, age: Number(age) }, fitness_goals: goals, activity_level: activity, preferences: profile?.preferences || { units: 'metric', notifications: true, privacy_level: 'private' } }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not save your setup. Try again.')
      if (!await refreshProfile()) throw new Error('Setup saved, but your profile could not refresh. Try again.')
      router.push('/dashboard')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save your setup. Try again.') }
    finally { setSaving(false) }
  }
  if (loading || !user) return <p role="status" className="p-6">Loading your profile…</p>
  return <AuthLayout title="What are you working toward?" subtitle="Start with your goal. Add other details when you need them."><form onSubmit={complete} className="space-y-5"><fieldset disabled={saving} className="space-y-5">
    <GoalsSelection selectedGoals={goals} selectedActivityLevel={activity} onGoalsChange={setGoals} onActivityLevelChange={setActivity} />
    <label className="block space-y-2 text-gray-700 dark:text-gray-300"><span>Age (years)</span><input type="number" inputMode="numeric" min="13" max="120" step="1" required value={age} onChange={event => setAge(event.target.value)} className="min-h-[44px] w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-base dark:border-gray-600 dark:bg-gray-800" /><span className="block text-sm text-gray-600 dark:text-gray-400">SociusFit supports ages 13 and up.</span></label>
    <p className="text-gray-600 dark:text-gray-400">Height, weight, and gender are optional. You can add them later in Profile for more tailored guidance.</p>
    {error && <p role="alert" className="text-red-600 dark:text-red-400">{error}</p>}
    <button type="submit" className="min-h-[44px] w-full rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-gray-950 disabled:opacity-50">{saving ? 'Saving…' : 'Start using SociusFit'}</button>
  </fieldset></form></AuthLayout>
}
