'use client'

import React, { useCallback } from 'react'
import { useAuth } from '@/app/lib/auth/AuthContext'
import ProtectedRoute from '@/app/components/auth/ProtectedRoute'
import BodyMetricsForm from '@/app/components/profile/BodyMetricsForm'
import GoalsSelection from '@/app/components/profile/GoalsSelection'
import Breadcrumbs from '@/app/components/Breadcrumbs'
import { WhoopConnectionSettings } from '@/app/components/whoop/WhoopConnectionSettings'

export default function ProfilePage() {
  const { user, profile, updateProfile } = useAuth()

  const handleProfileUpdate = useCallback(async (updates: any) => {
    try {
      await updateProfile(updates)
    } catch (error) {
      console.error('Failed to update profile:', error)
    }
  }, [updateProfile])

  const handleGoalsChange = useCallback((goals: string[]) => {
    handleProfileUpdate({ fitnessGoals: goals })
  }, [handleProfileUpdate])

  const handleActivityLevelChange = useCallback((level: string) => {
    handleProfileUpdate({ activityLevel: level })
  }, [handleProfileUpdate])

  const handleBodyMetricsChange = useCallback((data: any) => {
    handleProfileUpdate({ bodyMetrics: data })
  }, [handleProfileUpdate])

  const handlePreferencesChange = useCallback((prefs: any) => {
    handleProfileUpdate({ preferences: prefs })
  }, [handleProfileUpdate])

  const breadcrumbs = [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Profile', current: true }
  ]

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
          {/* Breadcrumbs - Hidden on mobile to save space */}
          <div className="mb-3 sm:mb-4 hidden sm:block">
            <Breadcrumbs items={breadcrumbs} />
          </div>

          {/* Page Title */}
          <div className="mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              Profile Settings
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Manage your fitness profile and preferences
            </p>
          </div>

          {/* Profile Content */}
          {!profile ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-center py-8">
                <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 dark:border-blue-400 mr-3"></div>
                <span className="text-gray-600 dark:text-gray-400">Loading profile...</span>
              </div>
            </div>
          ) : (
          <div className="space-y-6">
            {/* Account Information */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Account Information
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Email Address
                  </label>
                  <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                    {user?.email}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Member Since
                  </label>
                  <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                    {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
              </div>
            </div>

            {/* Body Metrics */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Body Metrics
              </h2>
              <BodyMetricsForm
                initialData={profile?.bodyMetrics || {}}
                preferences={profile?.preferences || { units: 'metric', notifications: true, privacy_level: 'private' }}
                onDataChange={handleBodyMetricsChange}
                onPreferencesChange={handlePreferencesChange}
              />
            </div>

            {/* Fitness Goals */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Fitness Goals
              </h2>
              <GoalsSelection
                selectedGoals={profile?.fitnessGoals || []}
                selectedActivityLevel={profile?.activityLevel || 'moderately_active'}
                onGoalsChange={handleGoalsChange}
                onActivityLevelChange={handleActivityLevelChange}
              />
            </div>

            {/* WHOOP Connection */}
            <div id="whoop">
              <WhoopConnectionSettings />
            </div>

            {/* Preferences */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Preferences
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Units
                  </label>
                  <select
                    value={profile?.preferences?.units || 'metric'}
                    onChange={(e) => handleProfileUpdate({
                      preferences: {
                        ...profile?.preferences,
                        units: e.target.value
                      }
                    })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value="metric">Metric (kg, cm)</option>
                    <option value="imperial">Imperial (lbs, ft/in)</option>
                  </select>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="notifications"
                    checked={profile?.preferences?.notifications !== false}
                    onChange={(e) => handleProfileUpdate({
                      preferences: {
                        ...profile?.preferences,
                        notifications: e.target.checked
                      }
                    })}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="notifications" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                    Enable notifications
                  </label>
                </div>
              </div>
            </div>
          </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
}
