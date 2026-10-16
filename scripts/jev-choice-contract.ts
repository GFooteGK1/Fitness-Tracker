/** Pure Choice contract port from coaching-layer/app/lib/typesafe/client.ts.
 * No credentials, environment lookup or transport. Keep compatible with that client.
 */
export interface ChoiceQuestion { type: 'choice'; instructions: string; criteria: Record<string, string> }
export interface JevChoiceRequest { state: unknown; questions: Record<string, ChoiceQuestion> }
export interface JevChoiceResult {
  model: string
  answers: Record<string, { type: 'choice'; choice: string; probabilities: Record<string, number>; confidence: number }>
  usage: { input_tokens: number; output_tokens: number }
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const probability = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1
const own = (v: object, key: string) => Object.prototype.hasOwnProperty.call(v, key)
export const isPinnedJevModel = (model: string) => /^jev-\d+\.\d+\.\d+$/.test(model)

export function validateJevChoiceResponse(value: unknown, catalogs: Record<string, string[]>, model: string): JevChoiceResult {
  const invalid = () => new Error('Invalid JEV Choice response')
  if (!isPinnedJevModel(model) || !record(value) || value.model !== model
    || !record(value.answers) || !record(value.usage)
    || Object.keys(value.answers).length !== Object.keys(catalogs).length) throw invalid()
  const answers: JevChoiceResult['answers'] = Object.create(null)
  for (const [id, choices] of Object.entries(catalogs)) {
    const answer = value.answers[id]
    if (!own(value.answers, id) || !record(answer) || answer.type !== 'choice'
      || typeof answer.choice !== 'string' || !record(answer.probabilities)
      || !probability(answer.confidence) || Object.keys(answer.probabilities).length !== choices.length
      || !choices.includes(answer.choice)) throw invalid()
    const probabilities: Record<string, number> = Object.create(null)
    for (const choice of choices) {
      const p = answer.probabilities[choice]
      if (!own(answer.probabilities, choice) || !probability(p)) throw invalid()
      probabilities[choice] = p
    }
    const values = Object.values(probabilities)
    if (Math.abs(values.reduce((sum, p) => sum + p, 0) - 1) >= 1e-5
      || probabilities[answer.choice] !== Math.max(...values)) throw invalid()
    answers[id] = { type: 'choice', choice: answer.choice, probabilities, confidence: answer.confidence }
  }
  const { input_tokens, output_tokens } = value.usage
  if (!Number.isSafeInteger(input_tokens) || !Number.isSafeInteger(output_tokens)
    || (input_tokens as number) < 0 || (output_tokens as number) < 0) throw invalid()
  return { model, answers, usage: { input_tokens: input_tokens as number, output_tokens: output_tokens as number } }
}
