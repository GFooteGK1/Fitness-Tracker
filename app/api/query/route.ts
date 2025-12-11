import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(request: Request) {
  try {
    const { question } = await request.json()

    if (!question || !question.trim()) {
      return NextResponse.json(
        { error: 'Question is required' },
        { status: 400 }
      )
    }

    // Get recent workouts (last 6 months)
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const { data: workouts, error: workoutsError } = await supabase
      .from('workouts')
      .select('workout_date, input_text, primary_score')
      .gte('workout_date', sixMonthsAgo.toISOString().split('T')[0])
      .order('workout_date', { ascending: false })

    if (workoutsError) {
      throw new Error('Failed to fetch workouts: ' + workoutsError.message)
    }

    // Get benchmark PRs
    const { data: prs, error: prsError } = await supabase
      .from('benchmark_prs')
      .select('benchmark_name, date, score_value, score_display, rx_status')
      .order('date', { ascending: false })

    if (prsError) {
      throw new Error('Failed to fetch PRs: ' + prsError.message)
    }

    // Build context for Claude
    const context = {
      parsed_workouts: workouts?.map(w => ({
        date: w.workout_date,
        input_text: w.input_text?.substring(0, 400), // First 400 chars
        primary_score: w.primary_score
      })) || [],
      benchmark_prs: prs || []
    }

    // Query Claude
    const systemPrompt = `You are a fitness tracking assistant analyzing workout history data.

DATA AVAILABLE:
- parsed_workouts: Array of workout logs with date, input_text (full workout description), and primary_score
- benchmark_prs: Personal records for named benchmark workouts

YOUR TASK:
Answer the user's question by analyzing the workout data. Parse the input_text field to find:
- Movement patterns (squats, deadlifts, presses, etc.)
- Rep schemes (5x5, 3x3, 1RM, etc.)
- Weights and loads
- Workout types (AMRAP, For Time, EMOM, etc.)
- Performance scores

RESPONSE GUIDELINES:
1. Be conversational and specific
2. Use human-readable dates (e.g., "November 8, 2024" not "2024-11-08")
3. Include relative time context (e.g., "3 days ago", "last week")
4. If you find the answer, state it clearly with the date
5. If you don't find a clear answer, explain what you searched and what you found instead
6. Quote relevant parts of the workout description when helpful

Now answer the user's question.`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Question: ${question}

Workout Data:
${JSON.stringify(context, null, 2)}

Analyze the data and provide a conversational answer.`
      }]
    })

    const answer = message.content[0].type === 'text' ? message.content[0].text : ''

    return NextResponse.json({
      success: true,
      answer
    })

  } catch (error) {
    console.error('Query error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
