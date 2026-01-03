'use client'

import React, { useState } from 'react'
import MealEntryCard from './MealEntryCard'
import MealEditModal from './MealEditModal'
import { MealEntry } from '@/app/lib/types/food-tracking'

interface MealDisplayExampleProps {
  meals: MealEntry[]
  onMealUpdated?: (updatedMeal: MealEntry) => void
}

export default function MealDisplayExample({ meals, onMealUpdated }: MealDisplayExampleProps) {
  const [editingMeal, setEditingMeal] = useState<MealEntry | null>(null)

  const handleEditMeal = (mealId: string) => {
    const meal = meals.find(m => m.id === mealId)
    if (meal) {
      setEditingMeal(meal)
    }
  }

  const handleCloseModal = () => {
    setEditingMeal(null)
  }

  const handleMealUpdated = (updatedMeal: MealEntry) => {
    setEditingMeal(null)
    onMealUpdated?.(updatedMeal)
  }

  return (
    <div className="space-y-4">
      {meals.map((meal) => (
        <MealEntryCard
          key={meal.id}
          meal={meal}
          onEdit={handleEditMeal}
          showPhoto={true}
          compact={false}
        />
      ))}

      {editingMeal && (
        <MealEditModal
          meal={editingMeal}
          isOpen={true}
          onClose={handleCloseModal}
          onMealUpdated={handleMealUpdated}
        />
      )}
    </div>
  )
}