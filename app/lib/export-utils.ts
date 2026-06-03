/**
 * Export utilities for generating CSV and PDF files from workout and meal data.
 */

// --- Types ---

export interface WorkoutRow {
  date: string
  exercise: string
  sets: string
  reps: string
  weight: string
  notes: string
  duration: string
}

export interface MealRow {
  date: string
  meal_name: string
  calories: number
  protein: number
  carbs: number
  fat: number
  photo_url: string
}

export interface ExportSummary {
  totalWorkouts: number
  totalMeals: number
  avgDailyCalories: number
  totalProtein: number
  totalCarbs: number
  totalFat: number
  dateRange: { start: string; end: string }
  userName: string
}

// --- CSV Generation ---

function escapeCsvField(value: string | number | null | undefined): string {
  const str = String(value ?? '')
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function toCsvRow(fields: (string | number | null | undefined)[]): string {
  return fields.map(escapeCsvField).join(',')
}

export function generateWorkoutsCsv(rows: WorkoutRow[]): string {
  const header = toCsvRow(['Date', 'Exercise', 'Sets', 'Reps', 'Weight', 'Notes', 'Duration (min)'])
  const dataRows = rows.map(r =>
    toCsvRow([r.date, r.exercise, r.sets, r.reps, r.weight, r.notes, r.duration])
  )
  return [header, ...dataRows].join('\n')
}

export function generateMealsCsv(rows: MealRow[]): string {
  const header = toCsvRow(['Date', 'Meal Name', 'Calories', 'Protein (g)', 'Carbs (g)', 'Fat (g)', 'Photo URL'])
  const dataRows = rows.map(r =>
    toCsvRow([r.date, r.meal_name, r.calories, r.protein, r.carbs, r.fat, r.photo_url])
  )
  return [header, ...dataRows].join('\n')
}

export function generateCombinedCsv(workouts: WorkoutRow[], meals: MealRow[]): string {
  const parts: string[] = []

  parts.push('--- WORKOUTS ---')
  parts.push(generateWorkoutsCsv(workouts))
  parts.push('')
  parts.push('--- MEALS ---')
  parts.push(generateMealsCsv(meals))

  return parts.join('\n')
}

// --- Data Transformation ---

export function transformWorkoutRows(workouts: any[]): WorkoutRow[] {
  const rows: WorkoutRow[] = []

  for (const w of workouts) {
    const date = w.workout_date || ''
    const notes = w.notes || ''
    const duration = w.total_duration_min != null ? String(w.total_duration_min) : ''
    const blocks = Array.isArray(w.blocks) ? w.blocks : []

    if (blocks.length === 0) {
      rows.push({
        date,
        exercise: w.input_text || 'Workout',
        sets: '',
        reps: '',
        weight: '',
        notes,
        duration,
      })
      continue
    }

    for (const block of blocks) {
      const blockTitle = block.block_title || block.title || block.block_type || 'Exercise'
      const movements = Array.isArray(block.movements) ? block.movements : []

      if (movements.length === 0) {
        rows.push({
          date,
          exercise: blockTitle,
          sets: '',
          reps: block.rounds_completed != null ? String(block.rounds_completed) : '',
          weight: '',
          notes,
          duration,
        })
      } else {
        for (const mov of movements) {
          rows.push({
            date,
            exercise: mov.name || mov.movement || blockTitle,
            sets: mov.sets != null ? String(mov.sets) : '',
            reps: mov.reps != null ? String(mov.reps) : '',
            weight: mov.weight != null ? `${mov.weight}${mov.unit || 'lb'}` : '',
            notes,
            duration,
          })
        }
      }
    }
  }

  return rows
}

export function transformMealRows(meals: any[]): MealRow[] {
  const rows: MealRow[] = []

  for (const m of meals) {
    const date = m.meal_timestamp
      ? new Date(m.meal_timestamp).toISOString().split('T')[0]
      : ''
    const items = Array.isArray(m.items) ? m.items : []

    if (items.length === 0) {
      rows.push({
        date,
        meal_name: 'Meal',
        calories: m.total_calories || 0,
        protein: m.total_protein || 0,
        carbs: m.total_carbs || 0,
        fat: m.total_fat || 0,
        photo_url: m.photo_url || '',
      })
    } else {
      for (const item of items) {
        rows.push({
          date,
          meal_name: item.food || 'Unknown',
          calories: item.calories || 0,
          protein: item.protein || 0,
          carbs: item.carbs || 0,
          fat: item.fat || 0,
          photo_url: m.photo_url || '',
        })
      }
    }
  }

  return rows
}

export function computeSummary(
  workouts: any[],
  meals: any[],
  dateRange: { start: string; end: string },
  userName: string
): ExportSummary {
  const totalCalories = meals.reduce((sum, m) => sum + (m.total_calories || 0), 0)
  const uniqueDays = new Set(meals.map(m => {
    if (!m.meal_timestamp) return ''
    return new Date(m.meal_timestamp).toISOString().split('T')[0]
  }))
  uniqueDays.delete('')
  const dayCount = uniqueDays.size || 1

  return {
    totalWorkouts: workouts.length,
    totalMeals: meals.length,
    avgDailyCalories: Math.round(totalCalories / dayCount),
    totalProtein: meals.reduce((sum, m) => sum + (m.total_protein || 0), 0),
    totalCarbs: meals.reduce((sum, m) => sum + (m.total_carbs || 0), 0),
    totalFat: meals.reduce((sum, m) => sum + (m.total_fat || 0), 0),
    dateRange,
    userName,
  }
}

// --- PDF Generation ---

export async function generatePdf(
  workoutRows: WorkoutRow[],
  mealRows: MealRow[],
  summary: ExportSummary,
  dataType: 'workouts' | 'meals' | 'all'
): Promise<Uint8Array> {
  // Dynamic import to keep bundle size small for non-PDF paths
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()

  // --- Header ---
  doc.setFillColor(37, 99, 235) // blue-600
  doc.rect(0, 0, pageWidth, 28, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(20)
  doc.text('SociusFit', 14, 14)
  doc.setFontSize(10)
  doc.text('Data Export', 14, 22)

  // Date range and user
  doc.setFontSize(9)
  const rangeText = `${summary.dateRange.start} to ${summary.dateRange.end}`
  doc.text(rangeText, pageWidth - 14, 14, { align: 'right' })
  if (summary.userName) {
    doc.text(summary.userName, pageWidth - 14, 22, { align: 'right' })
  }

  // --- Summary Stats ---
  let yPos = 36
  doc.setTextColor(55, 65, 81) // gray-700
  doc.setFontSize(13)
  doc.text('Summary', 14, yPos)
  yPos += 8

  doc.setFontSize(9)
  const statsLines: string[] = []
  if (dataType === 'workouts' || dataType === 'all') {
    statsLines.push(`Total Workouts: ${summary.totalWorkouts}`)
  }
  if (dataType === 'meals' || dataType === 'all') {
    statsLines.push(`Total Meals Logged: ${summary.totalMeals}`)
    statsLines.push(`Avg Daily Calories: ${summary.avgDailyCalories} kcal`)
    statsLines.push(`Total Protein: ${summary.totalProtein}g  |  Carbs: ${summary.totalCarbs}g  |  Fat: ${summary.totalFat}g`)
  }

  for (const line of statsLines) {
    doc.text(line, 14, yPos)
    yPos += 5
  }

  yPos += 4

  // --- Workouts Table ---
  if ((dataType === 'workouts' || dataType === 'all') && workoutRows.length > 0) {
    doc.setFontSize(12)
    doc.setTextColor(55, 65, 81)
    doc.text('Workouts', 14, yPos)
    yPos += 2

    autoTable(doc, {
      startY: yPos,
      head: [['Date', 'Exercise', 'Sets', 'Reps', 'Weight', 'Notes', 'Duration (min)']],
      body: workoutRows.map(r => [r.date, r.exercise, r.sets, r.reps, r.weight, r.notes, r.duration]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [243, 244, 246] },
      margin: { left: 14, right: 14 },
    })

    yPos = (doc as any).lastAutoTable.finalY + 10
  }

  // --- Meals Table ---
  if ((dataType === 'meals' || dataType === 'all') && mealRows.length > 0) {
    // Check if we need a new page
    if (yPos > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage()
      yPos = 20
    }

    doc.setFontSize(12)
    doc.setTextColor(55, 65, 81)
    doc.text('Meals', 14, yPos)
    yPos += 2

    autoTable(doc, {
      startY: yPos,
      head: [['Date', 'Meal Name', 'Calories', 'Protein (g)', 'Carbs (g)', 'Fat (g)']],
      body: mealRows.map(r => [r.date, r.meal_name, r.calories, r.protein, r.carbs, r.fat]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [243, 244, 246] },
      margin: { left: 14, right: 14 },
    })
  }

  // --- Footer on every page ---
  const pageCount = (doc as any).getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(156, 163, 175) // gray-400
    const pageHeight = doc.internal.pageSize.getHeight()
    doc.text(`Generated by SociusFit on ${new Date().toISOString().split('T')[0]}`, 14, pageHeight - 6)
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, pageHeight - 6, { align: 'right' })
  }

  return doc.output('arraybuffer') as unknown as Uint8Array
}
