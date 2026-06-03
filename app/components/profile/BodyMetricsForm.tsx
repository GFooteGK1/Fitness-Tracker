'use client'

import React, { useState, useEffect } from 'react'
import { BodyMetrics, UserPreferences } from '@/app/lib/auth/types'

interface BodyMetricsFormProps {
  initialData?: BodyMetrics
  preferences?: UserPreferences
  onDataChange: (data: BodyMetrics) => void
  onPreferencesChange: (preferences: UserPreferences) => void
  errors?: Record<string, string>
}

export default function BodyMetricsForm({
  initialData = {},
  preferences = { units: 'metric', notifications: true, privacy_level: 'private' },
  onDataChange,
  onPreferencesChange,
  errors = {}
}: BodyMetricsFormProps) {
  const [units, setUnits] = useState<'metric' | 'imperial'>(preferences.units || 'metric')
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [age, setAge] = useState('')
  const [gender, setGender] = useState<'male' | 'female' | 'other' | ''>('')

  // Initialize form with existing data (only on mount, not when units change)
  useEffect(() => {
    if (initialData.height_cm && !height) {
      setHeight(units === 'metric' ?
        initialData.height_cm.toString() :
        Math.round(initialData.height_cm / 2.54).toString()
      )
    }
    if (initialData.weight_kg && !weight) {
      setWeight(units === 'metric' ?
        initialData.weight_kg.toString() :
        Math.round(initialData.weight_kg * 2.205).toString()
      )
    }
    if (initialData.age && !age) {
      setAge(initialData.age.toString())
    }
    if (initialData.gender && !gender) {
      setGender(initialData.gender)
    }
  }, [age, gender, height, initialData, units, weight])

  // Convert and update data when form changes (debounced to prevent excessive calls)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const heightCm = height ? (units === 'metric' ?
        parseFloat(height) :
        parseFloat(height) * 2.54
      ) : undefined

      const weightKg = weight ? (units === 'metric' ?
        parseFloat(weight) :
        parseFloat(weight) / 2.205
      ) : undefined

      const ageNum = age ? parseInt(age) : undefined

      onDataChange({
        height_cm: heightCm,
        weight_kg: weightKg,
        age: ageNum,
        gender: gender || undefined
      })
    }, 300) // Debounce for 300ms

    return () => clearTimeout(timeoutId)
  }, [height, weight, age, gender, units, onDataChange])

  // Update preferences when units change
  const handleUnitsChange = (newUnits: 'metric' | 'imperial') => {
    // Only convert if we have existing values and units are actually changing
    if (units !== newUnits) {
      // Convert existing height value
      if (height) {
        const currentHeightCm = units === 'metric' ? parseFloat(height) : parseFloat(height) * 2.54
        const newHeight = newUnits === 'metric' ? currentHeightCm : currentHeightCm / 2.54
        setHeight((Math.round(newHeight * 10) / 10).toString()) // More precise rounding
      }

      // Convert existing weight value
      if (weight) {
        const currentWeightKg = units === 'metric' ? parseFloat(weight) : parseFloat(weight) / 2.205
        const newWeight = newUnits === 'metric' ? currentWeightKg : currentWeightKg * 2.205
        setWeight((Math.round(newWeight * 10) / 10).toString()) // More precise rounding
      }

      setUnits(newUnits)
      onPreferencesChange({
        ...preferences,
        units: newUnits
      })
    }
  }

  return (
    <div className="space-y-6">
      {/* Units Toggle */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Measurement Units
        </label>
        <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
          <button
            type="button"
            onClick={() => handleUnitsChange('metric')}
            className={`flex-1 px-4 py-2 rounded-md font-medium transition-colors text-sm touch-target ${
              units === 'metric'
                ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            Metric (kg, cm)
          </button>
          <button
            type="button"
            onClick={() => handleUnitsChange('imperial')}
            className={`flex-1 px-4 py-2 rounded-md font-medium transition-colors text-sm touch-target ${
              units === 'imperial'
                ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            Imperial (lbs, in)
          </button>
        </div>
      </div>

      {/* Body Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Height */}
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Height ({units === 'metric' ? 'cm' : 'inches'})
          </label>
          <input
            type="number"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base touch-target transition-colors ${
              errors.height
                ? 'border-red-300 dark:border-red-600'
                : 'border-gray-300 dark:border-gray-600'
            }`}
            placeholder={units === 'metric' ? '175' : '69'}
            min={units === 'metric' ? '50' : '20'}
            max={units === 'metric' ? '300' : '118'}
          />
          {errors.height && (
            <p className="text-sm text-red-600 dark:text-red-400">{errors.height}</p>
          )}
        </div>

        {/* Weight */}
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Weight ({units === 'metric' ? 'kg' : 'lbs'})
          </label>
          <input
            type="number"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base touch-target transition-colors ${
              errors.weight
                ? 'border-red-300 dark:border-red-600'
                : 'border-gray-300 dark:border-gray-600'
            }`}
            placeholder={units === 'metric' ? '70' : '154'}
            min={units === 'metric' ? '20' : '44'}
            max={units === 'metric' ? '500' : '1100'}
            step="0.1"
            inputMode="decimal"
          />
          {errors.weight && (
            <p className="text-sm text-red-600 dark:text-red-400">{errors.weight}</p>
          )}
        </div>

        {/* Age */}
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Age (years)
          </label>
          <input
            type="number"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base touch-target transition-colors ${
              errors.age
                ? 'border-red-300 dark:border-red-600'
                : 'border-gray-300 dark:border-gray-600'
            }`}
            placeholder="25"
            min="13"
            max="120"
          />
          {errors.age && (
            <p className="text-sm text-red-600 dark:text-red-400">{errors.age}</p>
          )}
        </div>

        {/* Gender */}
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Gender
          </label>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value as any)}
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base touch-target transition-colors ${
              errors.gender
                ? 'border-red-300 dark:border-red-600'
                : 'border-gray-300 dark:border-gray-600'
            }`}
          >
            <option value="">Select gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
          {errors.gender && (
            <p className="text-sm text-red-600 dark:text-red-400">{errors.gender}</p>
          )}
        </div>
      </div>

      {/* Help Text */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <span className="text-blue-600 dark:text-blue-400 text-lg">💡</span>
          <div className="text-sm text-blue-800 dark:text-blue-200">
            <p className="font-medium mb-1">Why we need this information:</p>
            <ul className="space-y-1 text-xs">
              <li>• Calculate personalized nutrition targets</li>
              <li>• Provide accurate fitness recommendations</li>
              <li>• Track your progress over time</li>
              <li>• Generate insights based on your goals</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
