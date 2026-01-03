# Photo Storage Setup Guide

## Overview

The food tracking feature uses Supabase Storage for temporary meal photo storage with automatic 30-day expiration and cleanup.

## Storage Configuration

### Supabase Storage Bucket

The system automatically creates a `meal-photos` bucket with the following configuration:
- **Privacy**: Private (uses signed URLs for access)
- **File Types**: JPEG, PNG only
- **Size Limit**: 30MB per file
- **Retention**: 30 days with automatic cleanup

### File Organization

Photos are stored with the following structure:
```
meal-photos/
├── meals/
│   ├── {user-id}/
│   │   ├── meal_{user-id}_{timestamp}.jpg
│   │   └── meal_{user-id}_{timestamp}.png
```

## Automatic Cleanup

### How It Works

1. **Upload**: Photos are uploaded with 30-day expiration metadata
2. **Database Tracking**: `photo_expires_at` field tracks expiration dates
3. **Cleanup Process**: Expired photos are automatically deleted from storage
4. **Database Update**: Photo URLs are removed from meal records after deletion

### Cleanup Endpoint

**URL**: `POST /api/meals/cleanup`

**Authentication**: Optional Bearer token (set `CLEANUP_TOKEN` environment variable)

**Response**:
```json
{
  "success": true,
  "deletedCount": 5,
  "message": "Successfully cleaned up 5 expired photos"
}
```

### Automated Cleanup Options

#### Option 1: Vercel Cron Jobs (Recommended)

Add to `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/meals/cleanup",
      "schedule": "0 2 * * *"
    }
  ]
}
```

#### Option 2: External Cron Service

Use services like:
- GitHub Actions (scheduled workflows)
- Cron-job.org
- EasyCron

Example curl command:
```bash
curl -X POST https://your-app.vercel.app/api/meals/cleanup \
  -H "Authorization: Bearer your-cleanup-token"
```

## Error Handling

### Storage Failures

The system gracefully handles storage failures:

1. **Network Issues**: Suggests retry to user
2. **Quota/Permission**: Saves meal data without photo
3. **File Format/Size**: Shows validation error
4. **Unknown Errors**: Saves meal data, logs error

### Failure Recovery

- Meal data is always saved, even if photo upload fails
- Users can manually retry photo upload later
- Storage failures don't block the meal logging workflow

## Environment Variables

Add to your `.env.local`:

```bash
# Required for Supabase Storage
NEXT_PUBLIC_SUPABASE_URL=your-project-url.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Optional for automated cleanup
CLEANUP_TOKEN=your-secure-cleanup-token
```

## Monitoring

### Storage Usage

Monitor storage usage in Supabase Dashboard:
- Go to Storage → meal-photos
- Check file count and total size
- Review cleanup logs

### Cleanup Logs

Check application logs for cleanup activity:
```
Starting photo cleanup process...
Cleaned up 3 expired photos
Cleanup completed. Deleted 3 expired photos.
```

## Security

### Access Control

- Photos are stored in private bucket
- Access via signed URLs only
- URLs expire with photo retention period
- Row Level Security (RLS) protects meal data

### Privacy

- Photos automatically deleted after 30 days
- No permanent storage of meal photos
- User data isolated by user ID in storage paths

## Troubleshooting

### Common Issues

1. **Bucket Creation Fails**
   - Check Supabase permissions
   - Verify environment variables
   - Check storage quota

2. **Upload Fails**
   - Verify file size < 30MB
   - Check file format (JPEG/PNG only)
   - Check network connectivity

3. **Cleanup Not Working**
   - Verify cron job configuration
   - Check cleanup token authentication
   - Review application logs

### Manual Cleanup

If needed, manually trigger cleanup:

```bash
curl -X POST https://your-app.vercel.app/api/meals/cleanup \
  -H "Authorization: Bearer your-cleanup-token"
```

## Performance Considerations

- Signed URLs are cached for 1 hour
- Cleanup runs during low-traffic hours (2 AM)
- Storage operations are non-blocking for meal logging
- Failed uploads don't prevent meal data entry