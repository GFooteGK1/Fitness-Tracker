/** Server policy only. Never expose environment reads as client authority. */
export function personalizedCoachingCapabilities() {
  return {
    captureReceiptsV2: process.env.CAPTURE_RECEIPTS_V2_ENABLED === 'true',
    trainingIntent: process.env.COACH_TRAINING_INTENT_ENABLED === 'true',
    historyContext: process.env.COACH_HISTORY_CONTEXT_ENABLED === 'true',
    // Qualified initial-dose policy review and W10 remain unresolved.
    initialDosePolicy: false,
    targetedReview: process.env.COACH_TARGETED_REVIEW_ENABLED === 'true',
    recommendations: process.env.RECOMMENDATIONS_ENABLED === 'true'
  }
}
