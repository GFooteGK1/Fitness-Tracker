'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { DailyTargets } from '@/app/lib/types/food-tracking'
import { useAuth } from '@/app/lib/auth/AuthContext'

interface TargetManagementProps {
  onTargetsUpdated?: (targets: DailyTargets) => void
  className?: string
}

export default function TargetManagement({ onTargetsUpdated, className = '' }: TargetManagementProps) {
  const { user } = useAuth()
  const [targets, setTargets] = useState<DailyTargets | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Form state
  const [formData, setFormData] = useState({
    targetProtein: 0,
    targetCarbs: 0,
    targetFat: 0,
    targetCalories: 0,
    tolerancePct: 5.0
  })

  const fetchTargets = useCallback(async () => {
    if (!user) return

    try {
      setLoading(true)
      setError('')

      const response = await fetch('/api/targets')
      if (!response.ok) {
        throw new Error('Failed to fetch targets')
      }

      const data: DailyTargets = await response.json()
      setTargets(data)
      setFormData({
        targetProtein: data.targetProtein,
        targetCarbs: data.targetCarbs,
        targetFat: data.targetFat,
        targetCalories: data.targetCalories,
        tolerancePct: data.tolerancePct
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load targets')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (user) {
      fetchTargets()
    }
  }, [fetchTargets, user])

  const handleSave = async () => {
    if (!user) return

    try {
      setSaving(true)
      setError('')

      const response = await fetch('/api/targets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to save targets')
      }

      const savedTargets: DailyTargets = await response.json()
      setTargets(savedTargets)
      setIsEditing(false)

      // Notify parent component
      onTargetsUpdated?.(savedTargets)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save targets')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    if (targets) {
      setFormData({
        targetProtein: targets.targetProtein,
        targetCarbs: targets.targetCarbs,
        targetFat: targets.targetFat,
        targetCalories: targets.targetCalories,
        tolerancePct: targets.tolerancePct
      })
    }
    setIsEditing(false)
    setError('')
  }

  const handleInputChange = (field: keyof typeof formData, value: number) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const formatMacro = (value: number, unit: string = 'g') => {
    return `${Math.round(value * 10) / 10}${unit}`
  }

  const hasTargets = targets && (targets.targetProtein > 0 || targets.targetCarbs > 0 || targets.targetFat > 0 || targets.targetCalories > 0)

  if (loading) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}>
        <div className="flex items-center justify-center py-6 sm:py-8">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 dark:border-blue-400"></div>
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Daily Targets</h2>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium text-sm touch-target"
          >
            {hasTargets ? 'Edit' : 'Set Targets'}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {!hasTargets && !isEditing && (
        <div className="text-center py-6 sm:py-8">
          <div className="text-3xl sm:text-4xl mb-3">🎯</div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No Targets Set</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm sm:text-base px-2">
            Set your daily macro targets to track adherence and get personalized guidance.
          </p>
          <button
            onClick={() => setIsEditing(true)}
            className="bg-blue-600 dark:bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors font-medium text-sm sm:text-base touch-target"
          >
            Set Your Targets
          </button>
        </div>
      )}

      {hasTargets && !isEditing && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
              {formatMacro(targets!.targetProtein)}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Protein</div>
          </div>
          <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
              {formatMacro(targets!.targetCarbs)}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Carbs</div>
          </div>
          <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
              {formatMacro(targets!.targetFat)}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Fat</div>
          </div>
          <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
              {formatMacro(targets!.targetCalories, '')}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Calories</div>
          </div>
        </div>
      )}

      {isEditing && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Protein (g)
              </label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={formData.targetProtein}
                onChange={(e) => handleInputChange('targetProtein', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base touch-target"
                placeholder="150"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Carbohydrates (g)
              </label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={formData.targetCarbs}
                onChange={(e) => handleInputChange('targetCarbs', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base touch-target"
                placeholder="200"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Fat (g)
              </label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={formData.targetFat}
                onChange={(e) => handleInputChange('targetFat', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base touch-target"
                placeholder="80"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Calories
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={formData.targetCalories}
                onChange={(e) => handleInputChange('targetCalories', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base touch-target"
                placeholder="2000"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Tolerance (%)
            </label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={formData.tolerancePct}
              onChange={(e) => handleInputChange('tolerancePct', parseFloat(e.target.value) || 5.0)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base touch-target"
              placeholder="5.0"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Acceptable deviation from targets (default: 5%)
            </p>
          </div>

          <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-3 pt-4">
            <button
              onClick={handleCancel}
              disabled={saving}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 text-sm sm:text-base touch-target"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center justify-center text-sm sm:text-base touch-target"
            >
              {saving && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              )}
              {saving ? 'Saving...' : 'Save Targets'}
            </button>
          </div>
        </div>
      )}

      {hasTargets && !isEditing && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
          <div className="text-center text-sm text-gray-600 dark:text-gray-400">
            Tolerance: ±{targets!.tolerancePct}% • Last updated: {' '}
            {new Intl.DateTimeFormat('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit'
            }).format(new Date(targets!.updatedAt))}
          </div>
        </div>
      )}
    </div>
  )
}
