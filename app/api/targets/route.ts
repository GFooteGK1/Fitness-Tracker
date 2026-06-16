/**
 * Daily Targets Management API
 * Handles CRUD operations for user nutritional targets
 * Requirements: 4.1, 4.2, 4.4, 4.5
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '../../lib/auth/supabase-server'
import { DailyTargets, DailyTargetsInsert } from '../../lib/types/food-tracking'
import { calculateTargetCalories } from '../../lib/target-management'

/**
 * GET /api/targets - Retrieve user's daily targets
 */
export async function GET(request: NextRequest) {
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

    const { data, error } = await supabase
      .from('daily_targets')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('Error fetching daily targets:', error)
      return NextResponse.json(
        { error: 'Failed to fetch daily targets' },
        { status: 500 }
      )
    }

    // If no targets found, return default values
    if (!data) {
      return NextResponse.json({
        userId: user.id,
        targetProtein: 0,
        targetCarbs: 0,
        targetFat: 0,
        targetCalories: 0,
        tolerancePct: 5.0,
        updatedAt: new Date().toISOString()
      })
    }

    // Convert snake_case to camelCase for response
    const targets: DailyTargets = {
      userId: data.user_id,
      targetProtein: parseFloat(data.target_protein),
      targetCarbs: parseFloat(data.target_carbs),
      targetFat: parseFloat(data.target_fat),
      targetCalories: parseFloat(data.target_calories),
      tolerancePct: parseFloat(data.tolerance_pct),
      updatedAt: new Date(data.updated_at)
    }

    return NextResponse.json(targets)
  } catch (error) {
    console.error('Unexpected error in GET /api/targets:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/targets - Create or update user's daily targets
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json()
    const {
      targetProtein,
      targetCarbs,
      targetFat,
      tolerancePct = 5.0
    } = body

    // Validate required fields
    if (targetProtein === undefined || targetCarbs === undefined || 
        targetFat === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: targetProtein, targetCarbs, targetFat' },
        { status: 400 }
      )
    }

    // Validate positive target values (Requirement 4.5)
    if (
      typeof targetProtein !== 'number' ||
      typeof targetCarbs !== 'number' ||
      typeof targetFat !== 'number' ||
      !Number.isFinite(targetProtein) ||
      !Number.isFinite(targetCarbs) ||
      !Number.isFinite(targetFat) ||
      targetProtein <= 0 ||
      targetCarbs <= 0 ||
      targetFat <= 0
    ) {
      return NextResponse.json(
        { error: 'All target values must be positive numbers' },
        { status: 400 }
      )
    }

    // Validate tolerance percentage
    if (typeof tolerancePct !== 'number' || !Number.isFinite(tolerancePct) || tolerancePct < 0 || tolerancePct > 100) {
      return NextResponse.json(
        { error: 'Tolerance percentage must be between 0 and 100' },
        { status: 400 }
      )
    }

    const targetCalories = calculateTargetCalories(targetProtein, targetCarbs, targetFat)

    // Prepare data for database insert/update
    const targetsData: DailyTargetsInsert = {
      user_id: user.id,
      target_protein: targetProtein,
      target_carbs: targetCarbs,
      target_fat: targetFat,
      target_calories: targetCalories,
      tolerance_pct: tolerancePct
    }

    // Use upsert to handle both create and update cases
    const { data, error } = await supabase
      .from('daily_targets')
      .upsert(targetsData, { onConflict: 'user_id' })
      .select()
      .single()

    if (error) {
      console.error('Error upserting daily targets:', error)
      return NextResponse.json(
        { error: 'Failed to save daily targets' },
        { status: 500 }
      )
    }

    // Convert response to camelCase
    const savedTargets: DailyTargets = {
      userId: data.user_id,
      targetProtein: parseFloat(data.target_protein),
      targetCarbs: parseFloat(data.target_carbs),
      targetFat: parseFloat(data.target_fat),
      targetCalories: parseFloat(data.target_calories),
      tolerancePct: parseFloat(data.tolerance_pct),
      updatedAt: new Date(data.updated_at)
    }

    return NextResponse.json(savedTargets, { status: 201 })
  } catch (error) {
    console.error('Unexpected error in POST /api/targets:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/targets - Update existing daily targets
 */
export async function PUT(request: NextRequest) {
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

    const body = await request.json()
    const {
      targetProtein,
      targetCarbs,
      targetFat,
      tolerancePct
    } = body

    // Build update object with only provided fields
    const updateData: Partial<DailyTargetsInsert> = {}
    const hasMacroUpdate = targetProtein !== undefined || targetCarbs !== undefined || targetFat !== undefined
    
    if (targetProtein !== undefined) {
      if (typeof targetProtein !== 'number' || !Number.isFinite(targetProtein) || targetProtein <= 0) {
        return NextResponse.json(
          { error: 'Target protein must be a positive number' },
          { status: 400 }
        )
      }
      updateData.target_protein = targetProtein
    }

    if (targetCarbs !== undefined) {
      if (typeof targetCarbs !== 'number' || !Number.isFinite(targetCarbs) || targetCarbs <= 0) {
        return NextResponse.json(
          { error: 'Target carbs must be a positive number' },
          { status: 400 }
        )
      }
      updateData.target_carbs = targetCarbs
    }

    if (targetFat !== undefined) {
      if (typeof targetFat !== 'number' || !Number.isFinite(targetFat) || targetFat <= 0) {
        return NextResponse.json(
          { error: 'Target fat must be a positive number' },
          { status: 400 }
        )
      }
      updateData.target_fat = targetFat
    }

    if (tolerancePct !== undefined) {
      if (typeof tolerancePct !== 'number' || !Number.isFinite(tolerancePct) || tolerancePct < 0 || tolerancePct > 100) {
        return NextResponse.json(
          { error: 'Tolerance percentage must be between 0 and 100' },
          { status: 400 }
        )
      }
      updateData.tolerance_pct = tolerancePct
    }

    if (hasMacroUpdate) {
      let protein = updateData.target_protein
      let carbs = updateData.target_carbs
      let fat = updateData.target_fat

      if (protein === undefined || carbs === undefined || fat === undefined) {
        const { data: existingTargets, error: existingTargetsError } = await supabase
          .from('daily_targets')
          .select('target_protein, target_carbs, target_fat')
          .eq('user_id', user.id)
          .single()

        if (existingTargetsError) {
          console.error('Error fetching existing daily targets for calorie calculation:', existingTargetsError)
          return NextResponse.json(
            { error: 'Failed to update daily targets' },
            { status: 500 }
          )
        }

        protein = protein ?? parseFloat(existingTargets.target_protein)
        carbs = carbs ?? parseFloat(existingTargets.target_carbs)
        fat = fat ?? parseFloat(existingTargets.target_fat)
      }

      updateData.target_calories = calculateTargetCalories(protein, carbs, fat)
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields provided for update' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('daily_targets')
      .update(updateData)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating daily targets:', error)
      return NextResponse.json(
        { error: 'Failed to update daily targets' },
        { status: 500 }
      )
    }

    // Convert response to camelCase
    const updatedTargets: DailyTargets = {
      userId: data.user_id,
      targetProtein: parseFloat(data.target_protein),
      targetCarbs: parseFloat(data.target_carbs),
      targetFat: parseFloat(data.target_fat),
      targetCalories: parseFloat(data.target_calories),
      tolerancePct: parseFloat(data.tolerance_pct),
      updatedAt: new Date(data.updated_at)
    }

    return NextResponse.json(updatedTargets)
  } catch (error) {
    console.error('Unexpected error in PUT /api/targets:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
