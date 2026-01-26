/**
 * WHOOP API Client
 * 
 * Handles all communication with the WHOOP API including:
 * - OAuth token exchange and refresh
 * - Fetching recovery, sleep, cycle, and workout data
 * - Rate limiting and error handling
 */

import {
  WhoopTokens,
  WhoopTokenResponse,
  WhoopRecoveryResponse,
  WhoopSleepResponse,
  WhoopCycleResponse,
  WhoopWorkoutResponse
} from '../types/whoop';

const WHOOP_API_HOSTNAME = process.env.WHOOP_API_HOSTNAME || 'https://api.prod.whoop.com';
const WHOOP_CLIENT_ID = process.env.WHOOP_CLIENT_ID;
const WHOOP_CLIENT_SECRET = process.env.WHOOP_CLIENT_SECRET;

// Required OAuth scopes for WHOOP integration
export const WHOOP_SCOPES = [
  'read:recovery',
  'read:cycles',
  'read:workout',
  'read:sleep',
  'read:profile',
  'read:body_measurement',
  'offline' // Required for refresh token
].join(' ');

/**
 * Exchange authorization code for access and refresh tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<WhoopTokens> {
  if (!WHOOP_CLIENT_ID || !WHOOP_CLIENT_SECRET) {
    throw new Error('WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET must be set');
  }

  const response = await fetch(`${WHOOP_API_HOSTNAME}/oauth/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: WHOOP_CLIENT_ID,
      client_secret: WHOOP_CLIENT_SECRET,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${error}`);
  }

  const data: WhoopTokenResponse = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scope: data.scope,
  };
}

/**
 * Refresh an expired access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<WhoopTokens> {
  if (!WHOOP_CLIENT_ID || !WHOOP_CLIENT_SECRET) {
    throw new Error('WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET must be set');
  }

  const response = await fetch(`${WHOOP_API_HOSTNAME}/oauth/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: WHOOP_CLIENT_ID,
      client_secret: WHOOP_CLIENT_SECRET,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${response.status} ${error}`);
  }

  const data: WhoopTokenResponse = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scope: data.scope,
  };
}

/**
 * Fetch recovery data for a date range
 * Note: Uses v2 API endpoint
 */
export async function getRecovery(
  accessToken: string,
  startDate: Date,
  endDate: Date
): Promise<WhoopRecoveryResponse[]> {
  const start = startDate.toISOString();
  const end = endDate.toISOString();

  const response = await fetch(
    `${WHOOP_API_HOSTNAME}/developer/v2/recovery?start=${start}&end=${end}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch recovery data: ${response.status}`);
  }

  const data = await response.json();
  return data.records || [];
}

/**
 * Fetch sleep data for a date range
 * Note: Uses v2 API endpoint
 */
export async function getSleep(
  accessToken: string,
  startDate: Date,
  endDate: Date
): Promise<WhoopSleepResponse[]> {
  const start = startDate.toISOString();
  const end = endDate.toISOString();

  const response = await fetch(
    `${WHOOP_API_HOSTNAME}/developer/v2/activity/sleep?start=${start}&end=${end}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch sleep data: ${response.status}`);
  }

  const data = await response.json();
  return data.records || [];
}

/**
 * Fetch cycle (strain) data for a date range
 * Note: Uses v2 API endpoint
 */
export async function getCycles(
  accessToken: string,
  startDate: Date,
  endDate: Date
): Promise<WhoopCycleResponse[]> {
  const start = startDate.toISOString();
  const end = endDate.toISOString();

  const response = await fetch(
    `${WHOOP_API_HOSTNAME}/developer/v2/cycle?start=${start}&end=${end}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch cycle data: ${response.status}`);
  }

  const data = await response.json();
  return data.records || [];
}

/**
 * Fetch workout data for a date range
 * Note: Uses v2 API endpoint
 */
export async function getWorkouts(
  accessToken: string,
  startDate: Date,
  endDate: Date
): Promise<WhoopWorkoutResponse[]> {
  const start = startDate.toISOString();
  const end = endDate.toISOString();

  const response = await fetch(
    `${WHOOP_API_HOSTNAME}/developer/v2/activity/workout?start=${start}&end=${end}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch workout data: ${response.status}`);
  }

  const data = await response.json();
  return data.records || [];
}

/**
 * Check if an error is a rate limit error
 */
export function isRateLimitError(error: any): boolean {
  return error?.status === 429 || error?.message?.includes('429');
}

/**
 * Check if an error is a server error (5xx)
 */
export function isServerError(error: any): boolean {
  const status = error?.status;
  return status >= 500 && status < 600;
}

/**
 * Check if an error is an authentication error
 */
export function isAuthError(error: any): boolean {
  return error?.status === 401 || error?.message?.includes('401');
}
