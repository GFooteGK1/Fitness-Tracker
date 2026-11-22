/** The subject must come from the caller's authenticated account. */
export function isSociusTodayPilotOwner(subject?: string): boolean {
  return Boolean(subject) && subject === process.env.SOCIUS_MCP_TODAY_OWNER_ID
}
