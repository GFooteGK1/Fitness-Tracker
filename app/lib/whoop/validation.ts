/**
 * WHOOP Data Validation Utilities
 * 
 * Validates WHOOP identifiers to ensure they match expected formats:
 * - Sleep IDs: UUID v4 strings
 * - Workout IDs: UUID v4 strings
 * - Cycle IDs: Positive integers
 * - Recovery IDs: Positive integers (via cycle_id)
 */

/**
 * Validates that a string is a valid UUID format
 * 
 * Accepts any UUID format (v1, v4, etc.) as WHOOP API may return various versions
 * UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 * where x is any hexadecimal digit
 * 
 * @param value - The string to validate
 * @returns true if the string is a valid UUID, false otherwise
 */
export function isValidUUID(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(value)
}

/**
 * Result of identifier validation
 */
export interface ValidationResult {
  isValid: boolean
  errors: string[]
}

/**
 * WHOOP data types that have identifiers
 */
export type WhoopDataType = 'sleep' | 'workout' | 'cycle' | 'recovery'

/**
 * Validates WHOOP identifier based on data type
 * 
 * - Sleep and Workout: Must be UUID v4 strings
 * - Cycle and Recovery: Must be positive integers
 * 
 * @param value - The identifier value to validate
 * @param type - The type of WHOOP data
 * @returns Validation result with array of error messages if invalid
 */
export function validateWhoopIdentifier(
  value: string | number,
  type: WhoopDataType
): ValidationResult {
  const errors: string[] = []
  
  // Sleep and workout IDs must be UUID strings
  if (type === 'sleep' || type === 'workout') {
    if (typeof value !== 'string') {
      const typeName = type.charAt(0).toUpperCase() + type.slice(1)
      errors.push(`${typeName} ID must be a string (UUID), received ${typeof value}`)
      return { isValid: false, errors }
    }
    
    if (!isValidUUID(value)) {
      const typeName = type.charAt(0).toUpperCase() + type.slice(1)
      errors.push(`${typeName} ID must be a valid UUID string`)
      return { isValid: false, errors }
    }
    
    return { isValid: true, errors: [] }
  }
  
  // Cycle and recovery IDs must be positive integers
  if (type === 'cycle' || type === 'recovery') {
    if (typeof value !== 'number') {
      const typeName = type.charAt(0).toUpperCase() + type.slice(1)
      errors.push(`${typeName} ID must be a number, received ${typeof value}`)
      return { isValid: false, errors }
    }
    
    if (!Number.isInteger(value)) {
      const typeName = type.charAt(0).toUpperCase() + type.slice(1)
      errors.push(`${typeName} ID must be an integer, received: ${value}`)
      return { isValid: false, errors }
    }
    
    if (value <= 0) {
      const typeName = type.charAt(0).toUpperCase() + type.slice(1)
      errors.push(`${typeName} ID must be a positive integer`)
      return { isValid: false, errors }
    }
    
    return { isValid: true, errors: [] }
  }
  
  errors.push(`Unknown identifier type: ${type}`)
  return { isValid: false, errors }
}

/**
 * Validates a batch of WHOOP identifiers
 * 
 * @param identifiers - Array of identifier-type pairs to validate
 * @returns Array of validation results
 */
export function validateWhoopIdentifiers(
  identifiers: Array<{ value: string | number; type: WhoopDataType }>
): ValidationResult[] {
  return identifiers.map(({ value, type }) => 
    validateWhoopIdentifier(value, type)
  )
}

/**
 * Throws an error if validation fails
 * 
 * @param value - The identifier value to validate
 * @param type - The type of WHOOP data
 * @throws Error if validation fails
 */
export function assertValidWhoopIdentifier(
  value: string | number,
  type: WhoopDataType
): void {
  const result = validateWhoopIdentifier(value, type)
  if (!result.isValid) {
    throw new Error(`Invalid WHOOP ${type} identifier: ${result.errors.join(', ')}`)
  }
}
