/**
 * WHOOP OAuth Initiation Route
 * 
 * GET /api/whoop/auth
 * 
 * Initiates the WHOOP OAuth flow by:
 * 1. Generating a cryptographic state token
 * 2. Building the authorization URL with required scopes
 * 3. Storing state in session for validation
 * 4. Redirecting user to WHOOP authorization page
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@/app/lib/auth/supabase-server';
import { WHOOP_SCOPES } from '@/app/lib/whoop/api-client';
import crypto from 'crypto';

const WHOOP_API_HOSTNAME = process.env.WHOOP_API_HOSTNAME || 'https://api.prod.whoop.com';
const WHOOP_CLIENT_ID = process.env.WHOOP_CLIENT_ID;

export async function GET(request: Request) {
  try {
    // 1. Authenticate user
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Validate environment variables
    if (!WHOOP_CLIENT_ID) {
      console.error('WHOOP_CLIENT_ID not configured');
      return NextResponse.json(
        { error: 'WHOOP integration not configured' },
        { status: 500 }
      );
    }

    // 3. Generate cryptographic state token (for CSRF protection)
    const state = crypto.randomBytes(32).toString('hex');

    // 4. Store state in cookie for validation in callback
    const cookieStore = await cookies();
    cookieStore.set('whoop_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/',
    });

    // 5. Build redirect URI
    const { origin } = new URL(request.url);
    const redirectUri = `${origin}/api/whoop/callback`;

    // 6. Build authorization URL
    const authUrl = new URL(`${WHOOP_API_HOSTNAME}/oauth/oauth2/auth`);
    authUrl.searchParams.set('client_id', WHOOP_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', WHOOP_SCOPES);
    authUrl.searchParams.set('state', state);

    // 7. Redirect to WHOOP authorization page
    return NextResponse.redirect(authUrl.toString());

  } catch (error) {
    console.error('Error initiating WHOOP OAuth:', error);
    return NextResponse.json(
      { error: 'Failed to initiate WHOOP connection' },
      { status: 500 }
    );
  }
}
