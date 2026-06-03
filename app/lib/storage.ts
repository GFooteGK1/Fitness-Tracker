import { SupabaseClient } from '@supabase/supabase-js'

export const STORAGE_BUCKET = 'meal-photos'
export const PHOTO_EXPIRY_DAYS = 30

/**
 * Initialize the meal photos storage bucket if it doesn't exist
 * Note: On free tier, bucket must be created manually in Supabase Dashboard
 * This function just checks if the bucket exists
 */
export async function initializeStorage(supabase: SupabaseClient) {
  try {
    console.log('[Storage] Checking if bucket exists:', STORAGE_BUCKET)

    // Check if bucket exists by attempting to list files
    // This is a lightweight check that doesn't require admin permissions
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list('', { limit: 1 })

    if (error) {
      console.error('[Storage] Bucket check failed:', {
        message: error.message,
        status: (error as any).status,
        statusCode: (error as any).statusCode
      })

      // If bucket doesn't exist, return a helpful error
      if (error.message.includes('not found') || error.message.includes('Bucket not found')) {
        console.warn('[Storage] Bucket not found. Please create "meal-photos" bucket in Supabase Dashboard.')
        return {
          success: false,
          error: 'Storage bucket not configured. Photos will be saved without images.'
        }
      }

      // Other errors (like RLS issues) should also be handled gracefully
      console.error('[Storage] Storage check error:', error)
      return { success: false, error: error.message }
    }

    console.log('[Storage] Bucket exists and is accessible')
    return { success: true }
  } catch (error) {
    console.error('[Storage] Storage initialization error:', error)
    return {
      success: false,
      error: 'Storage service unavailable. Photos will be saved without images.'
    }
  }
}

/**
 * Upload a meal photo to storage with expiration metadata
 */
export async function uploadMealPhoto(
  supabase: SupabaseClient,
  file: Buffer,
  fileName: string,
  contentType: string,
  userId: string
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  try {
    const filePath = `meals/${userId}/${fileName}`
    console.log('[Storage] Attempting upload:', { filePath, contentType, fileSize: file.length })
    console.log('[Storage] Supabase client check:', {
      hasStorage: !!supabase.storage,
      hasFrom: !!(supabase.storage?.from),
      clientType: supabase.constructor.name
    })

    if (!supabase.storage) {
      throw new Error('Supabase client does not have storage API')
    }

    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, file, {
        contentType,
        cacheControl: '3600',
        upsert: false,
        metadata: {
          userId,
          uploadedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + PHOTO_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()
        }
      })

    if (error) {
      console.error('[Storage] Upload error:', {
        message: error.message,
        status: (error as any).status,
        statusCode: (error as any).statusCode,
        filePath
      })
      return { success: false, error: error.message }
    }

    console.log('[Storage] Upload successful:', data.path)
    return { success: true, filePath: data.path }
  } catch (error) {
    console.error('[Storage] Upload exception:', error)
    return { success: false, error: 'Failed to upload photo' }
  }
}

/**
 * Generate a signed URL for a meal photo
 */
export async function generateSignedUrl(
  supabase: SupabaseClient,
  filePath: string,
  expiresIn: number = PHOTO_EXPIRY_DAYS * 24 * 60 * 60
): Promise<{ success: boolean; signedUrl?: string; error?: string }> {
  try {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(filePath, expiresIn)

    if (error) {
      console.error('Signed URL error:', error)
      return { success: false, error: error.message }
    }

    return { success: true, signedUrl: data.signedUrl }
  } catch (error) {
    console.error('Signed URL error:', error)
    return { success: false, error: 'Failed to generate signed URL' }
  }
}

/**
 * Delete expired meal photos from storage
 */
export async function cleanupExpiredPhotos(
  supabase: SupabaseClient
): Promise<{
  success: boolean;
  deletedCount?: number;
  error?: string
}> {
  try {
    // Get all meals with expired photos
    const { data: expiredMeals, error: queryError } = await supabase
      .from('meals')
      .select('id, photo_url, user_id')
      .not('photo_url', 'is', null)
      .not('photo_expires_at', 'is', null)
      .lt('photo_expires_at', new Date().toISOString())

    if (queryError) {
      console.error('Query error:', queryError)
      return { success: false, error: queryError.message }
    }

    if (!expiredMeals || expiredMeals.length === 0) {
      return { success: true, deletedCount: 0 }
    }

    const filesToDelete: string[] = []
    const mealIdsToUpdate: string[] = []

    // Extract file paths from URLs
    for (const meal of expiredMeals) {
      if (meal.photo_url) {
        // Extract file path from signed URL or direct path
        const urlParts = meal.photo_url.split('/')
        const fileName = urlParts[urlParts.length - 1].split('?')[0] // Remove query params
        const filePath = `meals/${meal.user_id}/${fileName}`
        filesToDelete.push(filePath)
        mealIdsToUpdate.push(meal.id)
      }
    }

    // Delete files from storage
    const { data: deleteData, error: deleteError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove(filesToDelete)

    if (deleteError) {
      console.error('Delete error:', deleteError)
      return { success: false, error: deleteError.message }
    }

    // Update meal records to remove photo URLs
    const { error: updateError } = await supabase
      .from('meals')
      .update({
        photo_url: null,
        photo_expires_at: null
      })
      .in('id', mealIdsToUpdate)

    if (updateError) {
      console.error('Update error:', updateError)
      return { success: false, error: updateError.message }
    }

    console.log(`Cleaned up ${filesToDelete.length} expired photos`)
    return { success: true, deletedCount: filesToDelete.length }

  } catch (error) {
    console.error('Cleanup error:', error)
    return { success: false, error: 'Failed to cleanup expired photos' }
  }
}

/**
 * Check if a photo URL is expired
 */
export function isPhotoExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt) < new Date()
}

/**
 * Handle storage failures gracefully
 */
export function handleStorageFailure(error: any): {
  userMessage: string;
  shouldRetry: boolean
} {
  const errorMessage = error?.message || 'Unknown storage error'

  // Network or temporary errors - suggest retry
  if (errorMessage.includes('network') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('503') ||
      errorMessage.includes('502')) {
    return {
      userMessage: 'Upload temporarily unavailable. Please try again.',
      shouldRetry: true
    }
  }

  // Storage quota or permission errors - don't retry
  if (errorMessage.includes('quota') ||
      errorMessage.includes('permission') ||
      errorMessage.includes('unauthorized')) {
    return {
      userMessage: 'Storage service unavailable. Your meal data will be saved without the photo.',
      shouldRetry: false
    }
  }

  // File size or format errors - don't retry
  if (errorMessage.includes('size') ||
      errorMessage.includes('format') ||
      errorMessage.includes('type')) {
    return {
      userMessage: 'Invalid file. Please use a JPEG or PNG image under 30MB.',
      shouldRetry: false
    }
  }

  // Default case
  return {
    userMessage: 'Photo upload failed. Your meal data will be saved without the photo.',
    shouldRetry: false
  }
}
