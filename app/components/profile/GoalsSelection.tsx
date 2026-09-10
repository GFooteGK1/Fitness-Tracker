'use client'

import React from 'react'
import { FITNESS_GOALS, ACTIVITY_LEVELS } from '@/app/lib/auth/types'

interface GoalsSelectionProps {
  selectedGoals: string[]
  selectedActivityLevel: string
  onGoalsChange: (goals: string[]) => void
  onActivityLevelChange: (level: string) => void
  errors?: Record<string, string>
}

export default function GoalsSelection({ selectedGoals, selectedActivityLevel, onGoalsChange, onActivityLevelChange, errors = {} }: GoalsSelectionProps) {
  return <div className="space-y-5">
    <fieldset className="space-y-3"><legend className="mb-2 font-medium text-gray-700 dark:text-gray-300">Your goals — choose any that fit</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{FITNESS_GOALS.map(goal => <button key={goal.id} type="button" aria-pressed={selectedGoals.includes(goal.id)} onClick={() => onGoalsChange(selectedGoals.includes(goal.id) ? selectedGoals.filter(id => id !== goal.id) : [...selectedGoals, goal.id])} className={`min-h-[44px] rounded-xl border p-3 text-left font-medium ${selectedGoals.includes(goal.id) ? 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-100' : 'border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'}`}>{goal.label}{selectedGoals.includes(goal.id) && <span aria-hidden="true" className="ml-2">✓</span>}</button>)}</div>
      {errors.goals && <p role="alert" className="text-red-600 dark:text-red-400">{errors.goals}</p>}
    </fieldset>
    <label className="block space-y-2 text-gray-700 dark:text-gray-300"><span>Usual activity level</span><select value={selectedActivityLevel} onChange={event => onActivityLevelChange(event.target.value)} className="min-h-[44px] w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-base dark:border-gray-600 dark:bg-gray-800"><option value="">Choose your activity level</option>{ACTIVITY_LEVELS.map(level => <option key={level.id} value={level.id}>{level.label}</option>)}</select><span className="block text-sm text-gray-600 dark:text-gray-400">{ACTIVITY_LEVELS.find(level => level.id === selectedActivityLevel)?.description || 'Choose what a typical week looks like for you.'}</span></label>
    {errors.activityLevel && <p role="alert" className="text-red-600 dark:text-red-400">{errors.activityLevel}</p>}
  </div>
}
