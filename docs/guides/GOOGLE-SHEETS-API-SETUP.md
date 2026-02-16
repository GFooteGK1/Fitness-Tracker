# Google Sheets API Setup Guide

This guide explains how to set up the Google Sheets API for the dynamic tab detection feature.

## Overview

The dynamic tab detection system uses the Google Sheets API v4 to automatically identify the correct monthly programming tab in your coach's Google Sheets document. This eliminates the need to manually update the `SHEET_GID` value each month.

## Prerequisites

- A Google Cloud Platform account (free tier is sufficient)
- Access to the Google Sheets document containing your programming

## Setup Steps

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Enter a project name (e.g., "SociusFit Sheets Integration")
4. Click "Create"

### 2. Enable Google Sheets API

1. In the Google Cloud Console, navigate to "APIs & Services" → "Library"
2. Search for "Google Sheets API"
3. Click on "Google Sheets API"
4. Click "Enable"

### 3. Create an API Key

1. Navigate to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "API Key"
3. Your API key will be created and displayed
4. **Important:** Click "Restrict Key" to secure it

### 4. Restrict the API Key (Recommended)

For security, restrict your API key to only the Google Sheets API:

1. In the API key details page, under "API restrictions":
   - Select "Restrict key"
   - Check "Google Sheets API"
2. Under "Application restrictions" (optional but recommended):
   - Select "HTTP referrers" for web apps
   - Add your domain (e.g., `https://your-app.vercel.app/*`)
3. Click "Save"

### 5. Add API Key to Environment Variables

Add the API key to your `.env.local` file:

```bash
GOOGLE_SHEETS_API_KEY=your-api-key-here
```

### 6. Configure Cache TTL (Optional)

By default, tab detection results are cached for 4 hours. You can customize this:

```bash
GOOGLE_SHEETS_CACHE_TTL_HOURS=2  # Cache for 2 hours instead
```

### 7. Ensure Spreadsheet is Accessible

The Google Sheets document must be publicly readable:

1. Open your programming spreadsheet
2. Click "Share" → "Change to anyone with the link"
3. Set permissions to "Viewer"

**Note:** If you prefer to keep the spreadsheet private, you'll need to use service account authentication (not covered in this guide).

## Verification

To verify your setup is working:

1. Start your development server: `npm run dev`
2. Navigate to the workouts page
3. Check the browser console for any API errors
4. The system should automatically detect the current month's tab

## Troubleshooting

### Error: "Missing GOOGLE_SHEETS_API_KEY"

**Solution:** Ensure the API key is added to your `.env.local` file and restart your development server.

### Error: "API key not valid"

**Solution:** 
- Verify the API key is correct (no extra spaces)
- Check that the Google Sheets API is enabled in your Google Cloud project
- Ensure API restrictions allow the Google Sheets API

### Error: "Spreadsheet not found" or "Permission denied"

**Solution:**
- Verify the spreadsheet is set to "Anyone with the link can view"
- Check that the `SHEET_ID` in your code matches your spreadsheet

### Error: "Rate limit exceeded"

**Solution:**
- The free tier allows 300 requests per minute per project
- Increase the cache TTL to reduce API calls: `GOOGLE_SHEETS_CACHE_TTL_HOURS=8`
- Wait a few minutes and try again

## API Usage and Costs

### Free Tier Limits

- **Quota:** 300 requests per minute per project
- **Daily limit:** No daily limit on free tier
- **Cost:** Free for read-only access

### Expected Usage

With default settings (4-hour cache):
- ~6 API calls per day per user
- ~180 API calls per month per user
- Well within free tier limits

### Reducing API Calls

To minimize API usage:
1. Increase cache TTL: `GOOGLE_SHEETS_CACHE_TTL_HOURS=8`
2. Ensure users aren't repeatedly refreshing the page
3. Monitor usage in Google Cloud Console

## Security Best Practices

1. **Never commit API keys to version control**
   - Keep `.env.local` in `.gitignore`
   - Use environment variables in production

2. **Restrict API key usage**
   - Limit to Google Sheets API only
   - Add HTTP referrer restrictions for production

3. **Rotate keys periodically**
   - Create new API keys every 6-12 months
   - Delete old keys after migration

4. **Monitor usage**
   - Check Google Cloud Console for unusual activity
   - Set up billing alerts (even on free tier)

## Production Deployment

When deploying to Vercel or other platforms:

1. Add the API key to your platform's environment variables:
   - Vercel: Project Settings → Environment Variables
   - Add `GOOGLE_SHEETS_API_KEY` with your API key value

2. Ensure the API key restrictions allow your production domain

3. Test the deployment to verify tab detection works

## Alternative: Service Account Authentication

For private spreadsheets, consider using service account authentication:

1. Create a service account in Google Cloud Console
2. Download the JSON key file
3. Share the spreadsheet with the service account email
4. Use the service account credentials instead of an API key

**Note:** Service account setup is more complex and not covered in this guide.

## Support

If you encounter issues not covered in this guide:

1. Check the [Google Sheets API documentation](https://developers.google.com/sheets/api)
2. Review the error logs in your application
3. Verify your Google Cloud project settings
4. Ensure all environment variables are set correctly

## Related Documentation

- [Dynamic Tab Detection Design Document](../../.kiro/specs/dynamic-sheet-tab-detection/design.md)
- [Dynamic Tab Detection Requirements](../../.kiro/specs/dynamic-sheet-tab-detection/requirements.md)
- [Deployment Guide](./DEPLOYMENT-GUIDE.md)
