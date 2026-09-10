'use client'

import React from 'react'
import { BodyMetrics, UserPreferences } from '@/app/lib/auth/types'

interface BodyMetricsFormProps {
  initialData?: BodyMetrics
  preferences?: UserPreferences
  onDataChange: (data: BodyMetrics) => void
  onPreferencesChange: (preferences: UserPreferences) => void
  errors?: Record<string, string>
}

export default function BodyMetricsForm({ initialData = {}, preferences = { units: 'metric', notifications: true, privacy_level: 'private' }, onDataChange, onPreferencesChange, errors = {} }: BodyMetricsFormProps) {
  const imperial = preferences.units === 'imperial'
  const fieldClass = 'w-full min-h-[44px] rounded-xl border border-gray-300 bg-white px-3 py-3 text-base text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'
  const numberField = (key: 'height_cm' | 'weight_kg' | 'age', label: string, factor: number, min: number, max: number, errorKey: string) => (
    <label className="block space-y-2 text-gray-700 dark:text-gray-300">
      <span>{label}</span>
      <input type="number" inputMode={key === 'age' ? 'numeric' : 'decimal'} min={min} max={max} step={key === 'age' ? '1' : 'any'} className={fieldClass}
        value={initialData[key] === undefined ? '' : Number((initialData[key]! * factor).toFixed(2))}
        onChange={event => onDataChange({ ...initialData, [key]: event.target.value === '' ? undefined : Number(event.target.value) / factor })} />
      {errors[errorKey] && <span className="block text-red-600 dark:text-red-400">{errors[errorKey]}</span>}
    </label>
  )
  return <div className="space-y-5">
    <label className="block space-y-2 text-gray-700 dark:text-gray-300"><span>Measurement units</span>
      <select className={fieldClass} value={preferences.units} onChange={event => onPreferencesChange({ ...preferences, units: event.target.value as UserPreferences['units'] })}>
        <option value="metric">Metric (kg, cm)</option><option value="imperial">Imperial (lb, in)</option>
      </select>
    </label>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {numberField('height_cm', `Height (${imperial ? 'in' : 'cm'}) — optional`, imperial ? 1 / 2.54 : 1, imperial ? 19.68 : 50, imperial ? 118.12 : 300, 'height')}
      {numberField('weight_kg', `Weight (${imperial ? 'lb' : 'kg'}) — optional`, imperial ? 2.2046226218 : 1, imperial ? 44.09 : 20, imperial ? 1102.31 : 500, 'weight')}
      {numberField('age', 'Age (years)', 1, 13, 120, 'age')}
      <label className="block space-y-2 text-gray-700 dark:text-gray-300"><span>Gender — optional</span>
        <select className={fieldClass} value={initialData.gender || ''} onChange={event => onDataChange({ ...initialData, gender: (event.target.value || undefined) as BodyMetrics['gender'] })}>
          <option value="">Not provided</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
        </select>
      </label>
    </div>
    <p className="text-gray-600 dark:text-gray-400">Add measurements when you want to use them for nutrition or training guidance. You can log meals and workouts without them.</p>
  </div>
}
