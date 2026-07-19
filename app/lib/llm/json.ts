/**
 * Robust JSON extraction from an LLM text response.
 *
 * Consolidates the three ad-hoc strategies the routes used before the seam
 * (markdown-fence stripping, first-`{...}`-block regex, and bare JSON.parse)
 * into one helper. Returns null instead of throwing so callers decide how to
 * handle an unparseable response.
 */
export function extractJson<T = unknown>(text: string): T | null {
  if (!text) return null

  let s = text.trim()

  // Strip a leading ```json / ``` fence if present.
  if (s.startsWith('```json')) {
    s = s.replace(/^```json\s*/, '').replace(/\s*```$/, '')
  } else if (s.startsWith('```')) {
    s = s.replace(/^```\s*/, '').replace(/\s*```$/, '')
  }

  // Try a direct parse first, then fall back to the first {...} block.
  try {
    return JSON.parse(s) as T
  } catch {
    // fall through
  }

  const match = s.match(/\{[\s\S]*\}/)
  if (match) {
    try {
      return JSON.parse(match[0]) as T
    } catch {
      // fall through
    }
  }

  return null
}
