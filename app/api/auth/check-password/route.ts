import { NextResponse } from 'next/server'

/**
 * API endpoint to check if a password has been compromised
 * Uses HaveIBeenPwned API with k-Anonymity model
 * Only sends first 5 characters of SHA-1 hash
 */

// SHA-1 hash function using Web Crypto API (works in Edge Runtime)
async function sha1Hash(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-1', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex.toUpperCase()
}

export async function POST(request: Request) {
  try {
    const { password } = await request.json()

    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Password is required' },
        { status: 400 }
      )
    }

    // Hash the password with SHA-1 using Web Crypto API
    const sha1HashValue = await sha1Hash(password)

    // Use k-Anonymity: only send first 5 characters
    const prefix = sha1HashValue.substring(0, 5)
    const suffix = sha1HashValue.substring(5)

    // Query HaveIBeenPwned API
    const response = await fetch(
      `https://api.pwnedpasswords.com/range/${prefix}`,
      {
        headers: {
          'User-Agent': 'SociusFit-Password-Check',
        },
      }
    )

    if (!response.ok) {
      // If API fails, return safe (fail open for better UX)
      console.error('HaveIBeenPwned API error:', response.status)
      return NextResponse.json({
        isCompromised: false,
        message: 'Unable to check password, proceeding with caution',
      })
    }

    const text = await response.text()
    const hashes = text.split('\n')

    // Check if our password hash suffix is in the results
    for (const line of hashes) {
      const [hashSuffix, count] = line.split(':')
      if (hashSuffix === suffix) {
        return NextResponse.json({
          isCompromised: true,
          breachCount: parseInt(count.trim(), 10),
          message: 'This password has been found in data breaches',
        })
      }
    }

    // Password is safe
    return NextResponse.json({
      isCompromised: false,
      message: 'Password is secure',
    })
  } catch (error) {
    console.error('Error checking password:', error)
    // Fail open - return safe if check fails
    return NextResponse.json({
      isCompromised: false,
      message: 'Unable to verify password security',
    })
  }
}
