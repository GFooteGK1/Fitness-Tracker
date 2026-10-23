export type Schema = { type?: string; properties?: Record<string, Schema>; required?: readonly string[]; additionalProperties?: false;
  items?: Schema; minItems?: number; maxItems?: number; minLength?: number; maxLength?: number; pattern?: string;
  minimum?: number; maximum?: number; multipleOf?: number; enum?: readonly unknown[]; anyOf?: readonly Schema[]; description?: string }
export const object = (properties: Record<string, Schema>, required: readonly string[] = Object.keys(properties)): Schema =>
  ({ type: 'object', properties, required, additionalProperties: false })
export const text = (maxLength = 500): Schema => ({ type: 'string', minLength: 1, maxLength })
export const number = (maximum: number, minimum = 0): Schema => ({ type: 'number', minimum, maximum })
export const integer = (maximum: number, minimum = 0): Schema => ({ type: 'integer', minimum, maximum })
export const nullable = (s: Schema): Schema => ({ anyOf: [s, { type: 'null' }] })
export const list = (items: Schema, maxItems = 100, minItems = 1): Schema => ({ type: 'array', items, minItems, maxItems })
export const enumeration = (...values: string[]): Schema => ({ type: 'string', enum: values })

export function valid(value: unknown, s: Schema): boolean {
  if (s.anyOf) return s.anyOf.some(option => valid(value, option))
  if (s.enum && !s.enum.includes(value)) return false
  switch (s.type) {
    case 'boolean': return typeof value === 'boolean'
    case 'null': return value === null
    case 'string': return typeof value === 'string' && value.length >= (s.minLength ?? 0) && value.length <= (s.maxLength ?? Infinity)
      && (!(s.minLength && s.minLength > 0) || value.trim().length >= s.minLength)
      && (!s.pattern || new RegExp(s.pattern).test(value))
    case 'integer': case 'number': return typeof value === 'number' && Number.isFinite(value) && (s.type !== 'integer' || Number.isSafeInteger(value))
      && value >= (s.minimum ?? -Infinity) && value <= (s.maximum ?? Infinity)
      && (!s.multipleOf || Math.abs(value / s.multipleOf - Math.round(value / s.multipleOf)) < 1e-7)
    case 'array': return Array.isArray(value) && value.length >= (s.minItems ?? 0) && value.length <= (s.maxItems ?? Infinity)
      && value.every(item => valid(item, s.items!))
    case 'object': return Boolean(value && typeof value === 'object' && !Array.isArray(value)
      && (s.required ?? []).every(key => Object.hasOwn(value, key))
      && Object.entries(value).every(([key, part]) => Object.hasOwn(s.properties!, key) && valid(part, s.properties![key])))
    default: return false
  }
}
