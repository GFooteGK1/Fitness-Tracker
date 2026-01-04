'use client'

import React, { useState, useEffect } from 'react'
import { FITNESS_GOALS, ACTIVITY_LEVELS } from '@/app/lib/auth/types'

interface GoalsSelectionProps {
  selectedGoals: string[]
  selectedActivityLevel: string
  onGoalsChange: (goals: string[]) => void
  onActivityLevelChange: (level: string) => void
  errors?: Record<string, string>
}

export default function GoalsSelection({
  selectedGoals,
  selectedActivityLevel,
  onGoalsChange,
  onActivityLevelChange,
  errors = {}
}: GoalsSelectionProps) {
  const [goals, setGoals] = useState<string[]>(selectedGoals)
  const [activityLevel, setActivityLevel] = useState(selectedActivityLevel)

  // Update local state when props change
  useEffect(() => {
    setGoals(selectedGoals)
  }, [selectedGoals])

  useEffect(() => {
    setActivityLevel(selectedActivityLevel)
  }, [selectedActivityLevel])

  // Update parent when local state changes (but not on initial mount)
  useEffect(() => {
    // Only call if goals have actually changed from the initial value
    if (JSON.stringify(goals) !== JSON.stringify(selectedGoals)) {
      onGoalsChange(goals)
    }
  }, [goals]) // Remove onGoalsChange from dependencies to prevent infinite loop

  useEffect(() => {
    // Only call if activity level has actually changed from the initial value
    if (activityLevel !== selectedActivityLevel) {
      onActivityLevelChange(activityLevel)
    }
  }, [activityLevel]) // Remove onActivityLevelChange from dependencies to prevent infinite loop

  const toggleGoal = (goalId: string) => {
    setGoals(prev => 
      prev.includes(goalId) 
        ? prev.filter(id => id !== goalId)
        : [...prev, goalId]
    )
  }

  return (
    <div className="space-y-6">
      {/* Fitness Goals */}
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            What are your fitness goals? (Select all that apply)
          </label>
          {errors.goals && (
            <p className="text-sm text-red-600 dark:text-red-400 mb-2">{errors.goals}</p>
          )}
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FITNESS_GOALS.map((goal) => (
            <button
              key={goal.id}
              type="button"
              onClick={() => toggleGoal(goal.id)}
              className={`p-4 border-2 rounded-lg transition-all duration-200 text-left touch-target ${
                goals.includes(goal.id)
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100'
                  : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:border-gray-300 dark:hover:border-gray-500'
              }`}
            >
              <div className="flex items-center space-x-3">
                <span className="text-2xl">{goal.icon}</span>
                <div className="flex-1">
                  <div className="font-medium">{goal.label}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {goal.description}
                  </div>
                </div>
                {goals.includes(goal.id) && (
                  <span className="text-blue-600 dark:text-blue-400 text-xl">✓</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Activity Level */}
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            How active are you currently?
          </label>
          {errors.activityLevel && (
            <p className="text-sm text-red-600 dark:text-red-400 mb-2">{errors.activityLevel}</p>
          )}
        </div>
        
        <div className="space-y-2">
          {ACTIVITY_LEVELS.map((level) => (
            <button
              key={level.id}
              type="button"
              onClick={() => setActivityLevel(level.id)}
              className={`w-full p-4 border-2 rounded-lg transition-all duration-200 text-left touch-target ${
                activityLevel === level.id
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100'
                  : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:border-gray-300 dark:hover:border-gray-500'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-medium">{level.label}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {level.description}
                  </div>
                </div>
                {activityLevel === level.id && (
                  <span className="text-blue-600 dark:text-blue-400 text-xl ml-3">✓</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Help Text */}
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <span className="text-green-600 dark:text-green-400 text-lg">🎯</span>
          <div className="text-sm text-green-800 dark:text-green-200">
            <p className="font-medium mb-1">Your goals help us:</p>
            <ul className="space-y-1 text-xs">
              <li>• Suggest appropriate nutrition targets</li>
              <li>• Recommend workout intensities</li>
              <li>• Provide relevant insights and tips</li>
              <li>• Track progress toward your objectives</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}