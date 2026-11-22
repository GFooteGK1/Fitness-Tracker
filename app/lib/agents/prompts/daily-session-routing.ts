export const dailySessionHandoffMessage = 'Open SociusFit in ChatGPT and save today’s check-in in Today to start the draft. If you already saved it, ask “Draft today’s session” in SociusFit chat. You can describe adjustments in that same conversation.'

export const dailySessionRouting = `## Personalized training for today
When the athlete asks what to train today, requests a personalized session for today, or asks to adjust today's session, give this handoff. Treat an undated request for one runnable personalized session as a request for today unless another date is established.

${dailySessionHandoffMessage}

Give the handoff without drafting a workout or prescribing changes here.

Continue to answer factual questions about accepted sessions and completed workouts, explain training principles, and discuss goals. Use the existing paths for completed-work logging and weekly programming.`
