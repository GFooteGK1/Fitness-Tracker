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
    const { text, date } = await request.json()

    if (!text || !text.trim()) {
      return NextResponse.json(
        { error: 'Workout text is required' },
        { status: 400 }
      )
    }

    // Parse workout with Claude
    const systemPrompt = buildParserSystemPrompt()
    const userPrompt = buildUserPrompt(text, date)

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: userPrompt
      }]
    })

    // Extract and parse JSON response
    let responseText = message.content[0].type === 'text' ? message.content[0].text : ''
    
    // Clean markdown code blocks if present
    responseText = responseText.trim()
    if (responseText.startsWith('```json')) {
      responseText = responseText.replace(/^```json\s*/, '').replace(/\s*```$/, '')
    } else if (responseText.startsWith('```')) {
      responseText = responseText.replace(/^```\s*/, '').replace(/\s*```$/, '')
    }

    const parsed = JSON.parse(responseText)

    // Calculate primary score for display
    const primaryScore = buildPrimaryScore(parsed)

    // Save to Supabase
    const { data: workout, error: workoutError } = await supabase
      .from('workouts')
      .insert({
        workout_date: date,
        input_text: text,
        blocks: parsed.blocks,
        primary_score: primaryScore,
        tags: parsed.tags || [],
        notes: parsed.notes || '',
        rpe: parsed.rpe || null,
        parse_confidence: 0.85,
        user_id: null  // Single-user mode, no auth required
      })
      .select()
      .single()

    if (workoutError) {
      console.error('Supabase error:', workoutError)
      return NextResponse.json(
        { error: 'Failed to save workout: ' + workoutError.message },
        { status: 500 }
      )
    }

    // Save block scores
    if (parsed.blocks && parsed.blocks.length > 0) {
      const blockScores = parsed.blocks.map((block: any) => ({
        workout_id: workout.id,
        block_type: block.block_type,
        block_title: block.title || null,
        rounds_completed: block.block_score?.rounds_completed || null,
        extra_reps: block.block_score?.extra_reps || null,
        time_s: block.block_score?.time_s || null,
        total_reps: block.block_score?.total_reps || null,
        tonnage_lb: block.block_score?.tonnage_lb || null,
        rx_status: block.block_score?.rx_status || null,
        is_pr: block.block_score?.is_pr || false
      }))

      await supabase.from('block_scores').insert(blockScores)
    }

    return NextResponse.json({
      success: true,
      workoutId: workout.id,
      primaryScore,
      parsed
    })

  } catch (error) {
    console.error('Parse error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

function buildParserSystemPrompt(): string {
  return `You are a fitness workout parser specialized in CrossFit, strength training, and conditioning workouts. Your job is to convert natural language workout descriptions into structured JSON data.

# CRITICAL SCORING RULES

## AMRAP (As Many Rounds/Reps As Possible)

**Step-by-Step Calculation:**
1. Calculate round_rep_bundle: Sum all reps in one complete round
2. Identify rounds_completed: Number of FULL rounds completed
3. Identify extra_reps: Reps from incomplete round
4. Calculate total_reps: (rounds_completed × round_rep_bundle) + extra_reps

Example: "7 rounds + 5 pullups" with round of "5 pullups, 10 pushups, 15 squats"
- round_rep_bundle: 30 (5+10+15)
- rounds_completed: 7
- extra_reps: 5
- total_reps: 215 (7×30 + 5)

## FOR TIME Workouts
- Record time in seconds
- Example: "9:47" → 587 seconds

## STRENGTH Work
- Calculate tonnage: sum of (weight × reps) for all sets

# REQUIRED JSON SCHEMA

{
  "blocks": [
    {
      "block_type": "AMRAP" | "FOR_TIME" | "STRENGTH" | "CARDIO" | "EMOM",
      "title": "Workout name if mentioned",
      "time_cap_s": 720,
      "score_model": {
        "scoring": "ROUNDS_PLUS_REPS" | "TIME" | "LOAD" | "REPS",
        "round_rep_bundle": 30
      },
      "segments": [
        {
          "rounds": 1,
          "events": [
            {
              "movement_name": "Pull-up",
              "prescribed": { "reps": 5 },
              "performed": { "reps": 5, "load": {"value": 0, "unit": "lb"} }
            }
          ]
        }
      ],
      "block_score": {
        "rounds_completed": 7,
        "extra_reps": 5,
        "total_reps": 215,
        "time_s": null,
        "tonnage_lb": null,
        "rx_status": "RX",
        "is_pr": false
      }
    }
  ],
  "tags": ["amrap"],
  "notes": "",
  "rpe": 8
}

Return ONLY valid JSON. No markdown, no explanations.`
}

function buildUserPrompt(text: string, date: string): string {
  return `# Workout to Parse

**Date:** ${date}

**Raw Input:**
${text}

Parse this workout and return structured JSON matching the schema.`
}

function buildPrimaryScore(parsed: any): string {
  if (!parsed.blocks || parsed.blocks.length === 0) {
    return 'Workout logged'
  }

  const scores = []
  
  for (const block of parsed.blocks) {
    if (block.block_score) {
      const score = block.block_score
      let scoreStr = block.title ? `${block.title}: ` : ''
      
      if (score.rounds_completed !== null && score.rounds_completed !== undefined) {
        scoreStr += `${score.rounds_completed}+${score.extra_reps || 0}`
        if (score.rx_status) scoreStr += ` ${score.rx_status}`
      } else if (score.time_s) {
        const mins = Math.floor(score.time_s / 60)
        const secs = score.time_s % 60
        scoreStr += `${mins}:${secs.toString().padStart(2, '0')}`
        if (score.rx_status) scoreStr += ` ${score.rx_status}`
      } else if (score.tonnage_lb) {
        scoreStr += `${score.tonnage_lb} lb`
      } else if (score.total_reps) {
        scoreStr += `${score.total_reps} reps`
      }
      
      if (scoreStr) scores.push(scoreStr)
    }
  }
  
  return scores.length > 0 ? scores.join(' | ') : 'Workout logged'
}
