import { NextRequest, NextResponse } from 'next/server'
import { cleanupExpiredPhotos } from '@/app/lib/storage'
import { createServerClient } from '@/app/lib/auth/supabase-server'

export async function POST(request: NextRequest) {
  try {
    // Optional: Add authentication/authorization for cleanup endpoint
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.CLEANUP_TOKEN

    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('Starting photo cleanup process...')
    const supabase = await createServerClient()
    const result = await cleanupExpiredPhotos(supabase)

    if (!result.success) {
      console.error('Cleanup failed:', result.error)
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }

    console.log(`Cleanup completed. Deleted ${result.deletedCount} expired photos.`)

    return NextResponse.json({
      success: true,
      deletedCount: result.deletedCount,
      message: `Successfully cleaned up ${result.deletedCount} expired photos`
    })

  } catch (error) {
    console.error('Cleanup endpoint error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Allow GET for health check
export async function GET() {
  return NextResponse.json({
    status: 'ready',
    message: 'Photo cleanup service is available'
  })
}
