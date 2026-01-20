'use client'

import React from 'react'
import { MealEntry, FoodItem } from '@/app/lib/types/food-tracking'

interface MealEntryCardProps {
  meal: MealEntry
  onEdit?: (mealId: string) => void
  onDelete?: (mealId: string) => void
  showPhoto?: boolean
  compact?: boolean
}

export default function MealEntryCard({ 
  meal, 
  onEdit,
  onDelete,
  showPhoto = true, 
  compact = false 
}: MealEntryCardProps) {
  const formatTime = (date: Date | string | undefined | null) => {
    if (!date) return 'Unknown time'
    try {
      // Simply parse the date - JavaScript will handle timezone conversion automatically
      const dateObj = typeof date === 'string' ? new Date(date) : date
      if (!dateObj || isNaN(dateObj.getTime())) {
        return 'Unknown time'
      }
      return new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }).format(dateObj)
    } catch (error) {
      console.error('Error formatting time:', error)
      return 'Unknown time'
    }
  }

  const formatDateTime = (date: Date | string | undefined | null) => {
    if (!date) return 'Unknown'
    try {
      const dateObj = typeof date === 'string' ? new Date(date) : date
      if (!dateObj || isNaN(dateObj.getTime())) {
        return 'Unknown'
      }
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      }).format(dateObj)
    } catch (error) {
      console.error('Error formatting date:', error)
      return 'Unknown'
    }
  }

  const formatMacro = (value: number, unit: string = 'g') => {
    return `${Math.round(value * 10) / 10}${unit}`
  }

  const getConfidenceColor = (confidence?: number) => {
    if (!confidence) return 'text-gray-500'
    if (confidence >= 0.8) return 'text-green-600'
    if (confidence >= 0.6) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getConfidenceText = (confidence?: number) => {
    if (!confidence) return 'Unknown'
    if (confidence >= 0.8) return 'High'
    if (confidence >= 0.6) return 'Medium'
    return 'Low'
  }

  const isPhotoExpired = meal.photoExpiresAt && 
    meal.photoExpiresAt instanceof Date && 
    !isNaN(meal.photoExpiresAt.getTime()) && 
    new Date() > meal.photoExpiresAt

  return (
    <div className={`bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow ${
      compact ? 'p-3' : 'p-4'
    }`}>
      {/* Header with time and status indicators */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <span className={`font-medium ${compact ? 'text-sm' : 'text-base'} text-gray-900`}>
            {formatTime(meal.mealTimestamp)}
          </span>
          
          {/* Review flag indicator */}
          {meal.needsReview && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
              <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Review
            </span>
          )}
          
          {/* Manual override indicator */}
          {meal.manualOverride && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
              Edited
            </span>
          )}
        </div>

        {/* Edit and Delete buttons */}
        <div className="flex items-center space-x-1">
          {onEdit && (
            <button
              onClick={() => onEdit(meal.id)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
              title="Edit meal"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => {
                if (confirm('Are you sure you want to delete this meal?')) {
                  onDelete(meal.id)
                }
              }}
              className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20"
              title="Delete meal"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className={`${compact ? 'space-y-2' : 'space-y-3'}`}>
        {/* Photo section */}
        {showPhoto && meal.photoUrl && !isPhotoExpired && (
          <div className="relative">
            <img
              src={meal.photoUrl}
              alt="Meal photo"
              className={`w-full object-cover rounded-md ${compact ? 'h-32' : 'h-48'}`}
              onError={(e) => {
                // Hide image if it fails to load
                e.currentTarget.style.display = 'none'
              }}
            />
            
            {/* AI confidence indicator overlay */}
            {meal.aiConfidence && !meal.manualOverride && (
              <div className="absolute top-2 right-2">
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-white bg-opacity-90 ${getConfidenceColor(meal.aiConfidence)}`}>
                  <div className={`w-2 h-2 rounded-full mr-1 ${
                    meal.aiConfidence >= 0.8 ? 'bg-green-500' :
                    meal.aiConfidence >= 0.6 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}></div>
                  AI: {getConfidenceText(meal.aiConfidence)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Photo expired message */}
        {showPhoto && meal.photoUrl && isPhotoExpired && (
          <div className={`bg-gray-100 rounded-md flex items-center justify-center ${compact ? 'h-32' : 'h-48'}`}>
            <div className="text-center text-gray-500">
              <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm">Photo expired</p>
            </div>
          </div>
        )}

        {/* Macro breakdown */}
        <div className="grid grid-cols-4 gap-2">
          <div className="text-center">
            <div className={`font-semibold ${compact ? 'text-sm' : 'text-base'} text-gray-900`}>
              {formatMacro(meal.totalProtein)}
            </div>
            <div className={`${compact ? 'text-xs' : 'text-sm'} text-gray-500`}>Protein</div>
          </div>
          <div className="text-center">
            <div className={`font-semibold ${compact ? 'text-sm' : 'text-base'} text-gray-900`}>
              {formatMacro(meal.totalCarbs)}
            </div>
            <div className={`${compact ? 'text-xs' : 'text-sm'} text-gray-500`}>Carbs</div>
          </div>
          <div className="text-center">
            <div className={`font-semibold ${compact ? 'text-sm' : 'text-base'} text-gray-900`}>
              {formatMacro(meal.totalFat)}
            </div>
            <div className={`${compact ? 'text-xs' : 'text-sm'} text-gray-500`}>Fat</div>
          </div>
          <div className="text-center">
            <div className={`font-semibold ${compact ? 'text-sm' : 'text-base'} text-gray-900`}>
              {formatMacro(meal.totalCalories, '')}
            </div>
            <div className={`${compact ? 'text-xs' : 'text-sm'} text-gray-500`}>Cal</div>
          </div>
        </div>

        {/* Food items list */}
        {!compact && meal.items && meal.items.length > 0 && (
          <div className="border-t border-gray-100 pt-3">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Food Items</h4>
            <div className="space-y-1">
              {meal.items.map((item: FoodItem, index: number) => (
                <div key={index} className="flex justify-between items-center text-sm">
                  <div className="flex-1">
                    <span className="text-gray-900">{item.food}</span>
                    <span className="text-gray-500 ml-2">({item.portion})</span>
                  </div>
                  <div className="flex space-x-3 text-xs text-gray-600">
                    <span>{formatMacro(item.protein)} P</span>
                    <span>{formatMacro(item.carbs)} C</span>
                    <span>{formatMacro(item.fat)} F</span>
                    <span>{formatMacro(item.calories, '')} cal</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Compact food items summary */}
        {compact && meal.items && meal.items.length > 0 && (
          <div className="text-xs text-gray-600">
            {meal.items.length} item{meal.items.length !== 1 ? 's' : ''}: {
              meal.items.slice(0, 2).map(item => item.food).join(', ')
            }{meal.items.length > 2 && `, +${meal.items.length - 2} more`}
          </div>
        )}

        {/* Footer with metadata */}
        <div className="flex justify-between items-center text-xs text-gray-500 pt-2 border-t border-gray-100">
          <div className="flex items-center space-x-3">
            {/* AI confidence for non-manual entries */}
            {meal.aiConfidence && !meal.manualOverride && (
              <span className={getConfidenceColor(meal.aiConfidence)}>
                AI Confidence: {Math.round(meal.aiConfidence * 100)}%
              </span>
            )}
            
            {/* Review timestamp */}
            {meal.reviewedAt && (
              <span>
                Reviewed: {formatDateTime(meal.reviewedAt)}
              </span>
            )}
          </div>
          
          {/* Created timestamp */}
          <span>
            Logged: {formatDateTime(meal.createdAt)}
          </span>
        </div>
      </div>
    </div>
  )
}