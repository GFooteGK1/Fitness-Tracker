export const COACHING_PROGRAMMING_GUIDE = {
  scope: 'Use these steps to set a training block, build an executable week, and review the result. For a daily draft, use the existing block and week when available. The athlete’s confirmed goals, constraints and accepted plan govern the proposal.',
  steps: [
    {
      id: 'assess_goals',
      title: 'Find the best opportunity to improve',
      instructions: [
        'Start with the athlete’s confirmed goal, priority, target and deadline. Describe the performance demands that matter for that goal.',
        'Compare recent results using a comparable test, protocol and conditions. Rank gaps by expected contribution to the goal, room to improve, time available and training cost.',
        'Explain which trainable gap has the most upside now and why. If the baseline is missing, stale or inconclusive, name the check that would resolve it and mark the choice provisional.',
      ],
    },
    {
      id: 'choose_block_focus',
      title: 'Choose what to build and what to maintain',
      instructions: [
        'For a well-trained athlete pursuing several domains, default to one primary build target for the block. Give other important qualities an explicit maintenance target or explain a deliberate deferral.',
        'Choose the block review date and the outcome or response that could change the focus. At review, confirm the next priority and move the previous build target to maintenance when appropriate.',
        'Adjust the allocation for compatible goals, current competition demands, athlete priorities and demonstrated recovery. Explain the tradeoff when sharing development work.',
      ],
    },
    {
      id: 'set_build_and_maintenance_dose',
      title: 'Set a dose that fits each target',
      instructions: [
        'For build work, start from recent comparable, tolerated dose and goal-specific evidence. For maintenance, use recent dose and repeated outcomes that show the quality holding. Preserve its specificity and familiar intensity where known. Label an estimate provisional and set a check date.',
        'State the weekly target, required and optional work, and how to measure it. For lifting give sets, reps, load or effort. For speed, power and endurance use the relevant quantity, intensity, recovery and quality measures.',
        'Use the typed acceptance contract to retain supported target, effort and Playbook version fields. Report any unsupported field as unsaved. Compare actual work with the prescription due at the time and keep later proposals distinct.',
      ],
    },
    {
      id: 'organize_high_low',
      title: 'Plan focused high days and intentional low days',
      instructions: [
        'Use High/Low as the starting schedule. Account for demanding sport work and outside training. Classify stress by its mechanical, speed, strength and conditioning demands and by the athlete’s response.',
        'Start with existing high days for compatible work. Put the priority effort first while fresh, with a purpose, intensity and quality limit. Separate competing work when combining it would degrade the priority. Explain any added high day.',
        'Give each low day an explicit purpose and ceiling. Use easy aerobic work, low-cost skill or preparation, or rest as appropriate to support the next high day.',
      ],
    },
    {
      id: 'progress_from_evidence',
      title: 'Challenge the athlete within clear limits',
      instructions: [
        'Use comparable actual work, execution quality, effort, symptoms, athlete feedback and recovery. When these support progression, choose a meaningful challenge and state which variable advances, the limit and the fallback.',
        'When capacity is uncertain and the athlete is ready, use a small bounded trial with a clear success criterion. Choose limits from comparable performance when available and label uncertain limits provisional. Follow the safety boundary and specify when to scale or stop.',
        'When evidence conflicts, keep or adjust the dose and name the next comparable check. Recheck the response before committing to a larger progression.',
      ],
    },
    {
      id: 'review_month',
      title: 'Review prescribed work, completed work and outcomes',
      instructions: [
        'Use get_monthly_training_review when available. Otherwise use available accepted plans and dated activity records. Compare each week in the local calendar month with the prescription that applied. Show approved changes, explicit skips, optional work and unknowns.',
        'Use corrected actuals and stable plan and activity links for adherence credit. Compare linked required sets or efforts, reps, load, intensity, effort and quality where known. Include standalone work in exposure and fatigue context. Report the verified session-level result or exposure when finer evidence is missing.',
        'Compare logged weekly dose with the planned build or maintenance target. Use applicable research ranges as context and show weekly distribution and partial coverage.',
        'Report measured goal response separately from adherence and dose. Use comparable outcomes to decide whether to hold, progress, change focus or collect evidence. Carry the reason and next check into the next plan.',
      ],
    },
  ],
  sources: [
    { title: 'Concurrent training and explosive strength', url: 'https://doi.org/10.1007/s40279-021-01587-7',
      scope: 'Supports protecting explosive work quality when pairing sessions. High/Low remains a coaching default with scheduling exceptions.' },
    { title: 'Block periodization in trained endurance athletes', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6802561/',
      scope: 'Supports trying focused blocks in relevant settings. The available studies give limited confidence in a universal rotation or duration.' },
    { title: 'Performance test reliability', url: 'https://pubmed.ncbi.nlm.nih.gov/11286357/',
      scope: 'Interpret small changes using a reliable and comparable test.' },
    { title: 'ACSM resistance training position stand', url: 'https://doi.org/10.1249/MSS.0000000000003897',
      scope: 'Population references for goal-specific resistance dose and effort.' },
    { title: 'Weekly resistance dose response', url: 'https://doi.org/10.1007/s40279-025-02344-w',
      scope: 'Population estimates for growth and strength with diminishing returns.' },
    { title: 'Retaining resistance training adaptations', url: 'https://pubmed.ncbi.nlm.nih.gov/21131862/',
      scope: 'A reduced-dose trial illustrating differences by outcome and age.' },
    { title: 'Resistance training autoregulation', url: 'https://pubmed.ncbi.nlm.nih.gov/35038063/',
      scope: 'Supports autoregulation as an option for strength training.' },
  ],
} as const
