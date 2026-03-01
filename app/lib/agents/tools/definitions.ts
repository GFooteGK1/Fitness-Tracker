/**
 * Claude Tool definitions for SociusFit agents.
 * These schemas are passed to anthropic.messages.create({ tools: [...] })
 * so agents can execute DB operations via tool_use.
 */
import type { Tool } from '@anthropic-ai/sdk/resources/messages'

// ─── Trainer Tools ─────────────────────────────────────────────────────

export const TRAINER_TOOLS: Tool[] = [
  {
    name: 'log_workout',
    description:
      'Log a workout with structured blocks, score, and RPE. Use this when the user describes a completed workout. Resolve all relative dates (yesterday, last Monday, etc.) to YYYY-MM-DD before calling.',
    input_schema: {
      type: 'object' as const,
      properties: {
        workout_date: {
          type: 'string',
          description: 'Date of the workout in YYYY-MM-DD format.'
        },
        blocks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              block_type: {
                type: 'string',
                enum: ['AMRAP', 'FOR_TIME', 'EMOM', 'STRENGTH', 'CARDIO']
              },
              duration_min: { type: 'number', description: 'Duration in minutes (for AMRAP/EMOM)' },
              movements: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: 'Full movement name (resolve aliases first)' },
                    reps: { type: 'number' },
                    weight: { type: 'string', description: 'e.g. "225 lb", "100 kg", "BW"' },
                    distance: { type: 'string', description: 'e.g. "400m", "1 mile"' }
                  },
                  required: ['name']
                }
              },
              score: {
                type: 'object',
                properties: {
                  rounds: { type: 'number' },
                  extra_reps: { type: 'number' },
                  time_s: { type: 'number', description: 'Time in seconds for FOR_TIME' }
                }
              },
              rx_status: { type: 'string', enum: ['RX', 'SCALED'] }
            },
            required: ['block_type', 'movements']
          },
          description: 'Workout blocks — each contains a type, movements, and optional score.'
        },
        primary_score: {
          type: 'string',
          description: 'Human-readable score string e.g. "7+5" or "14:07"'
        },
        rpe: { type: 'number', description: 'Rate of perceived exertion 1-10' },
        tags: { type: 'array', items: { type: 'string' }, description: 'e.g. ["metcon", "hero"]' },
        input_text: { type: 'string', description: 'Original user text describing the workout' }
      },
      required: ['workout_date', 'blocks']
    }
  },
  {
    name: 'log_pr',
    description:
      'Log a personal record (PR) for a benchmark workout. Use when the user reports a PR or when a new benchmark score beats their existing record.',
    input_schema: {
      type: 'object' as const,
      properties: {
        benchmark_name: {
          type: 'string',
          description: 'Name of the benchmark (e.g. "Fran", "Grace", "Murph")'
        },
        score_value: {
          type: 'number',
          description:
            'Numeric score for comparison. FOR_TIME: seconds (e.g. 272 for 4:32). AMRAP: rounds*1000+extra_reps (e.g. 7005 for 7+5). STRENGTH: weight in lbs.'
        },
        score_display: {
          type: 'string',
          description: 'Human-readable score (e.g. "4:32", "7+5", "225 lb")'
        },
        date: { type: 'string', description: 'Date of the PR in YYYY-MM-DD format' },
        rx_status: { type: 'string', enum: ['RX', 'SCALED'], description: 'Defaults to RX if not specified' }
      },
      required: ['benchmark_name', 'score_value', 'score_display', 'date']
    }
  },
  {
    name: 'query_workouts',
    description:
      'Query past workouts by date range. Use when the user asks about their workout history, specific movements, or past performance.',
    input_schema: {
      type: 'object' as const,
      properties: {
        start_date: { type: 'string', description: 'Start date YYYY-MM-DD (inclusive)' },
        end_date: { type: 'string', description: 'End date YYYY-MM-DD (inclusive)' },
        movement: {
          type: 'string',
          description: 'Filter by movement name (case-insensitive partial match)'
        },
        block_type: {
          type: 'string',
          enum: ['AMRAP', 'FOR_TIME', 'EMOM', 'STRENGTH', 'CARDIO'],
          description: 'Filter by block type'
        },
        limit: { type: 'number', description: 'Max results to return (default 10, max 50)' }
      },
      required: ['start_date', 'end_date']
    }
  },
  {
    name: 'update_workout',
    description:
      'Update an existing workout by ID. Use when the user wants to correct a score, RPE, or tags on a previously logged workout.',
    input_schema: {
      type: 'object' as const,
      properties: {
        workout_id: { type: 'string', description: 'UUID of the workout to update' },
        primary_score: { type: 'string' },
        rpe: { type: 'number', description: '1-10' },
        tags: { type: 'array', items: { type: 'string' } },
        notes: { type: 'string' }
      },
      required: ['workout_id']
    }
  }
]

// ─── Nutritionist Tools ────────────────────────────────────────────────

export const NUTRITIONIST_TOOLS: Tool[] = [
  {
    name: 'log_meal',
    description:
      'Log a meal with food items, macros, and timing. Use when the user describes food they ate. Resolve all relative dates to YYYY-MM-DD before calling.',
    input_schema: {
      type: 'object' as const,
      properties: {
        meal_date: { type: 'string', description: 'Date of the meal in YYYY-MM-DD format' },
        meal_time: {
          type: 'string',
          description: 'Time of the meal in HH:MM 24h format. If unknown, omit.'
        },
        timing: {
          type: 'string',
          enum: ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'PRE_WORKOUT', 'POST_WORKOUT'],
          description: 'Meal timing category. Infer from time of day if not stated.'
        },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              food: { type: 'string', description: 'Food name' },
              portion: { type: 'string', description: 'e.g. "6 oz", "1 cup", "2 slices"' },
              protein: { type: 'number', description: 'Grams of protein' },
              carbs: { type: 'number', description: 'Grams of carbohydrates' },
              fat: { type: 'number', description: 'Grams of fat' },
              calories: { type: 'number', description: 'Total calories' }
            },
            required: ['food', 'portion', 'protein', 'carbs', 'fat', 'calories']
          },
          description: 'Food items with estimated macros.'
        },
        input_text: { type: 'string', description: 'Original user text describing the meal' }
      },
      required: ['meal_date', 'items']
    }
  },
  {
    name: 'query_meals',
    description:
      'Query past meals by date range. Use when the user asks about their nutrition history or what they ate on a specific day.',
    input_schema: {
      type: 'object' as const,
      properties: {
        start_date: { type: 'string', description: 'Start date YYYY-MM-DD (inclusive)' },
        end_date: { type: 'string', description: 'End date YYYY-MM-DD (inclusive)' },
        limit: { type: 'number', description: 'Max results to return (default 20, max 50)' }
      },
      required: ['start_date', 'end_date']
    }
  },
  {
    name: 'update_meal',
    description:
      'Update an existing meal by ID. Use when the user wants to correct portions, items, or timing on a previously logged meal.',
    input_schema: {
      type: 'object' as const,
      properties: {
        meal_id: { type: 'string', description: 'UUID of the meal to update' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              food: { type: 'string' },
              portion: { type: 'string' },
              protein: { type: 'number' },
              carbs: { type: 'number' },
              fat: { type: 'number' },
              calories: { type: 'number' }
            },
            required: ['food', 'portion', 'protein', 'carbs', 'fat', 'calories']
          },
          description: 'Updated food items with macros. Replaces existing items entirely.'
        },
        timing: {
          type: 'string',
          enum: ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'PRE_WORKOUT', 'POST_WORKOUT'],
          description: 'Updated meal timing category'
        }
      },
      required: ['meal_id']
    }
  }
]
