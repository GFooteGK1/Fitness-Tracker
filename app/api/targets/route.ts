/**
 * Daily Targets Management API
 * Handles CRUD operations for user nutritional targets
 * Requirements: 4.1, 4.2, 4.4, 4.5
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { DailyTargets, DailyTargetsInsert } from '../../lib/types/food-tracking'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET /api/targets - Retrieve user's daily targets
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('daily_targets')
      .select('*')
      .eq('user_id', userId)
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
        userId,
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
    const body = await request.json()
    const {
      userId,
      targetProtein,
      targetCarbs,
      targetFat,
      targetCalories,
      tolerancePct = 5.0
    } = body

    // Validate required fields
    if (!userId || targetProtein === undefined || targetCarbs === undefined || 
        targetFat === undefined || targetCalories === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, targetProtein, targetCarbs, targetFat, targetCalories' },
        { status: 400 }
      )
    }

    // Validate positive target values (Requirement 4.5)
    if (targetProtein <= 0 || targetCarbs <= 0 || targetFat <= 0 || targetCalories <= 0) {
      return NextResponse.json(
        { error: 'All target values must be positive numbers' },
        { status: 400 }
      )
    }

    // Validate tolerance percentage
    if (tolerancePct < 0 || tolerancePct > 100) {
      return NextResponse.json(
        { error: 'Tolerance percentage must be between 0 and 100' },
        { status: 400 }
      )
    }

    // Prepare data for database insert/update
    const targetsData: DailyTargetsInsert = {
      user_id: userId,
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
    const body = await request.json()
    const {
      userId,
      targetProtein,
      targetCarbs,
      targetFat,
      targetCalories,
      tolerancePct
    } = body

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    // Build update object with only provided fields
    const updateData: Partial<DailyTargetsInsert> = {}
    
    if (targetProtein !== undefined) {
      if (targetProtein <= 0) {
        return NextResponse.json(
          { error: 'Target protein must be a positive number' },
          { status: 400 }
        )
      }
      updateData.target_protein = targetProtein
    }

    if (targetCarbs !== undefined) {
      if (targetCarbs <= 0) {
        return NextResponse.json(
          { error: 'Target carbs must be a positive number' },
          { status: 400 }
        )
      }
      updateData.target_carbs = targetCarbs
    }

    if (targetFat !== undefined) {
      if (targetFat <= 0) {
        return NextResponse.json(
          { error: 'Target fat must be a positive number' },
          { status: 400 }
        )
      }
      updateData.target_fat = targetFat
    }

    if (targetCalories !== undefined) {
      if (targetCalories <= 0) {
        return NextResponse.json(
          { error: 'Target calories must be a positive number' },
          { status: 400 }
        )
      }
      updateData.target_calories = targetCalories
    }

    if (tolerancePct !== undefined) {
      if (tolerancePct < 0 || tolerancePct > 100) {
        return NextResponse.json(
          { error: 'Tolerance percentage must be between 0 and 100' },
          { status: 400 }
        )
      }
      updateData.tolerance_pct = tolerancePct
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
      .eq('user_id', userId)
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