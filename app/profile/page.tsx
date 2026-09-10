'use client'

import React, { useState } from 'react'
import { useAuth } from '@/app/lib/auth/AuthContext'
import ProtectedRoute from '@/app/components/auth/ProtectedRoute'
import BodyMetricsForm from '@/app/components/profile/BodyMetricsForm'
import GoalsSelection from '@/app/components/profile/GoalsSelection'
import { WhoopConnectionSettings } from '@/app/components/whoop/WhoopConnectionSettings'
import { FITNESS_GOALS, UserProfile } from '@/app/lib/auth/types'
import { validateBodyMetrics } from '@/app/lib/auth/onboarding'

export default function ProfilePage() {
  const { user, profile, profileError, refreshProfile, updateProfile } = useAuth()
  const [editing, setEditing] = useState<'body' | 'goals' | 'preferences' | null>(null)
  const [draft, setDraft] = useState<UserProfile | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const startEdit = (section: typeof editing) => { setDraft(profile ? structuredClone(profile) : null); setEditing(section); setError(''); setMessage('') }
  const save = async () => {
    if (!draft || !editing) return
    const validation = editing === 'body' ? validateBodyMetrics(draft.bodyMetrics) : editing === 'goals' && !draft.fitnessGoals.length ? 'Select at least one fitness goal.' : null
    if (validation) { setError(validation); return }
    setSaving(true); setError('')
    try {
      const updates = editing === 'body' ? { bodyMetrics: draft.bodyMetrics, preferences: draft.preferences } : editing === 'goals' ? { fitnessGoals: draft.fitnessGoals, activityLevel: draft.activityLevel } : { preferences: draft.preferences }
      await updateProfile(updates)
      setEditing(null); setDraft(null); setMessage('Changes saved.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save. Your changes are still here. Try again.') }
    finally { setSaving(false) }
  }
  const button = 'min-h-[44px] rounded-xl px-4 py-2 font-medium text-gray-900 dark:text-gray-100'
  const controls = <div className="mt-5 flex gap-3"><button type="button" disabled={saving} onClick={save} className="min-h-[44px] rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-gray-950 disabled:opacity-50">{saving ? 'Saving…' : 'Save changes'}</button><button type="button" disabled={saving} onClick={() => { setEditing(null); setDraft(null); setError('') }} className={button}>Cancel</button></div>
  const section = (key: NonNullable<typeof editing>, title: string, summary: string, content: React.ReactNode) => <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
    <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{title}</h2><p className="mt-1 text-gray-600 dark:text-gray-400">{summary}</p></div>{editing !== key && <button type="button" disabled={saving || editing !== null} onClick={() => startEdit(key)} className={button} aria-label={`Edit ${title.toLowerCase()}`}>Edit</button>}</div>
    {editing === key && draft && <fieldset disabled={saving} className="mt-5">{content}{error && <p role="alert" className="mt-4 text-red-600 dark:text-red-400">{error}</p>}{controls}</fieldset>}
  </section>
  return <ProtectedRoute><main className="mx-auto max-w-3xl space-y-5 px-4 py-6 text-gray-900 dark:text-gray-100">
    <header><h1 className="text-3xl font-semibold">Profile</h1><p className="mt-1 break-words text-gray-600 dark:text-gray-400">{user?.email}</p></header>
    {message && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">{message}</p>}
    <div id="whoop"><WhoopConnectionSettings /></div>
    {!profile ? <div role="status">{profileError || 'Loading profile…'}{profileError && <button className={button} onClick={() => refreshProfile()}>Retry</button>}</div> : <>
      {section('goals', 'Goals and activity', profile.fitnessGoals.map(goal => FITNESS_GOALS.find(item => item.id === goal)?.label || goal).join(' · ') || 'Choose your direction', draft && <GoalsSelection selectedGoals={draft.fitnessGoals} selectedActivityLevel={draft.activityLevel} onGoalsChange={fitnessGoals => setDraft(previous => previous && { ...previous, fitnessGoals })} onActivityLevelChange={activityLevel => setDraft(previous => previous && { ...previous, activityLevel: activityLevel as UserProfile['activityLevel'] })} />)}
      {section('body', 'Measurements and units', `${profile.preferences.units === 'imperial' ? 'Imperial' : 'Metric'} · ${profile.bodyMetrics.age ? `${profile.bodyMetrics.age} years` : 'Age needed'}${profile.bodyMetrics.weight_kg ? ` · ${Math.round(profile.bodyMetrics.weight_kg * (profile.preferences.units === 'imperial' ? 2.2046226218 : 1) * 10) / 10} ${profile.preferences.units === 'imperial' ? 'lb' : 'kg'}` : ' · Measurements optional'}`, draft && <BodyMetricsForm initialData={draft.bodyMetrics} preferences={draft.preferences} onDataChange={bodyMetrics => setDraft(previous => previous && { ...previous, bodyMetrics })} onPreferencesChange={preferences => setDraft(previous => previous && { ...previous, preferences })} />)}
      {section('preferences', 'Notifications', profile.preferences.notifications ? 'Enabled' : 'Disabled', draft && <label className="flex min-h-[44px] items-center gap-3"><input type="checkbox" checked={draft.preferences.notifications} onChange={event => setDraft({ ...draft, preferences: { ...draft.preferences, notifications: event.target.checked } })} className="h-5 w-5 accent-emerald-500" />Enable notifications</label>)}
    </>}
  </main></ProtectedRoute>
}
