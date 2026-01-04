import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { MealUpdates, MealEntry } from '@/app/lib/types/food-tracking'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id: mealId } = await params
    const updates: MealUpdates = await request.json()

    // Validate required fields
    if (!mealId) {
      return NextResponse.json(
        { error: 'Meal ID is required' },
        { status: 400 }
      )
    }

    // Validate macro values if provided
    if (updates.totalProtein !== undefined && (updates.totalProtein < 0 || updates.totalProtein > 500)) {
      return NextResponse.json(
        { error: 'Protein must be between 0 and 500g' },
        { status: 400 }
      )
    }

    if (updates.totalCarbs !== undefined && (updates.totalCarbs < 0 || updates.totalCarbs > 1000)) {
      return NextResponse.json(
        { error: 'Carbs must be between 0 and 1000g' },
        { status: 400 }
      )
    }

    if (updates.totalFat !== undefined && (updates.totalFat < 0 || updates.totalFat > 300)) {
      return NextResponse.json(
        { error: 'Fat must be between 0 and 300g' },
        { status: 400 }
      )
    }

    if (updates.totalCalories !== undefined && (updates.totalCalories < 0 || updates.totalCalories > 5000)) {
      return NextResponse.json(
        { error: 'Calories must be between 0 and 5000' },
        { status: 400 }
      )
    }

    // Validate food items if provided
    if (updates.items) {
      for (const item of updates.items) {
        if (!item.food?.trim()) {
          return NextResponse.json(
            { error: 'All food items must have a name' },
            { status: 400 }
          )
        }
        if (!item.portion?.trim()) {
          return NextResponse.json(
            { error: 'All food items must have a portion' },
            { status: 400 }
          )
        }
        if (item.protein < 0 || item.carbs < 0 || item.fat < 0 || item.calories < 0) {
          return NextResponse.json(
            { error: 'All macro values must be non-negative' },
            { status: 400 }
          )
        }
      }
    }

    // First, get the current meal to ensure it belongs to authenticated user
    const { data: currentMeal, error: fetchError } = await supabase
      .from('meals')
      .select('*')
      .eq('id', mealId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !currentMeal) {
      return NextResponse.json(
        { error: 'Meal not found or access denied' },
        { status: 404 }
      )
    }

    // Prepare update data (convert camelCase to snake_case for database)
    const updateData: any = {
      updated_at: new Date().toISOString()
    }

    if (updates.totalProtein !== undefined) {
      updateData.total_protein = updates.totalProtein
    }
    if (updates.totalCarbs !== undefined) {
      updateData.total_carbs = updates.totalCarbs
    }
    if (updates.totalFat !== undefined) {
      updateData.total_fat = updates.totalFat
    }
    if (updates.totalCalories !== undefined) {
      updateData.total_calories = updates.totalCalories
    }
    if (updates.items !== undefined) {
      updateData.items = updates.items
    }
    if (updates.manualOverride !== undefined) {
      updateData.manual_override = updates.manualOverride
    }
    if (updates.reviewedAt !== undefined) {
      updateData.reviewed_at = updates.reviewedAt.toISOString()
    }

    // If this is a manual override, clear the needs_review flag
    if (updates.manualOverride) {
      updateData.needs_review = false
    }

    // Update the meal in the database (ensure user owns the meal)
    const { data: updatedMeal, error: updateError } = await supabase
      .from('meals')
      .update(updateData)
      .eq('id', mealId)
      .eq('user_id', user.id)
      .select('*')
      .single()

    if (updateError) {
      console.error('Database update error:', updateError)
      return NextResponse.json(
        { error: 'Failed to update meal' },
        { status: 500 }
      )
    }

    // Convert snake_case back to camelCase for response
    const responseData: MealEntry = {
      id: updatedMeal.id,
      userId: updatedMeal.user_id,
      mealTimestamp: new Date(updatedMeal.meal_timestamp),
      photoUrl: updatedMeal.photo_url,
      photoExpiresAt: updatedMeal.photo_expires_at ? new Date(updatedMeal.photo_expires_at) : undefined,
      items: updatedMeal.items,
      totalProtein: updatedMeal.total_protein,
      totalCarbs: updatedMeal.total_carbs,
      totalFat: updatedMeal.total_fat,
      totalCalories: updatedMeal.total_calories,
      needsReview: updatedMeal.needs_review,
      manualOverride: updatedMeal.manual_override,
      aiConfidence: updatedMeal.ai_confidence,
      reviewedAt: updatedMeal.reviewed_at ? new Date(updatedMeal.reviewed_at) : undefined,
      createdAt: new Date(updatedMeal.created_at),
      updatedAt: new Date(updatedMeal.updated_at)
    }

    return NextResponse.json({
      success: true,
      meal: responseData
    })

  } catch (error) {
    console.error('Meal update error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: mealId } = await params

    if (!mealId) {
      return NextResponse.json(
        { error: 'Meal ID is required' },
        { status: 400 }
      )
    }

    const supabase = await createServerClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get the meal from the database (ensure user owns the meal)
    const { data: meal, error } = await supabase
      .from('meals')
      .select('*')
      .eq('id', mealId)
      .eq('user_id', user.id)
      .single()

    if (error || !meal) {
      return NextResponse.json(
        { error: 'Meal not found' },
        { status: 404 }
      )
    }

    // Convert snake_case to camelCase for response
    const responseData: MealEntry = {
      id: meal.id,
      userId: meal.user_id,
      mealTimestamp: new Date(meal.meal_timestamp),
      photoUrl: meal.photo_url,
      photoExpiresAt: meal.photo_expires_at ? new Date(meal.photo_expires_at) : undefined,
      items: meal.items,
      totalProtein: meal.total_protein,
      totalCarbs: meal.total_carbs,
      totalFat: meal.total_fat,
      totalCalories: meal.total_calories,
      needsReview: meal.needs_review,
      manualOverride: meal.manual_override,
      aiConfidence: meal.ai_confidence,
      reviewedAt: meal.reviewed_at ? new Date(meal.reviewed_at) : undefined,
      createdAt: new Date(meal.created_at),
      updatedAt: new Date(meal.updated_at)
    }

    return NextResponse.json({
      success: true,
      meal: responseData
    })

  } catch (error) {
    console.error('Meal fetch error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}