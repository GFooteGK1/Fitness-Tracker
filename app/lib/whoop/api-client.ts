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

const WHOOP_PAGE_LIMIT = 25;
const MAX_COLLECTION_PAGES = 100;
const COLLECTION_TIMEOUT_MS = 15_000;

class WhoopCollectionError extends Error {
  constructor(domain: string, readonly status: number) {
    super(`Failed to fetch ${domain} data: ${status}`);
  }
}

/** A run succeeds only after every page for its fixed occurrence-time range is fetched. */
async function getCollection<T>(
  endpoint: string,
  domain: string,
  accessToken: string,
  startDate: Date,
  endDate: Date,
): Promise<T[]> {
  const params = new URLSearchParams({
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    limit: String(WHOOP_PAGE_LIMIT),
  });
  const records: T[] = [];
  const tokens = new Set<string>();
  const signal = AbortSignal.timeout(COLLECTION_TIMEOUT_MS);

  for (let page = 0; page < MAX_COLLECTION_PAGES; page++) {
    const response = await fetch(`${WHOOP_API_HOSTNAME}/developer/v2/${endpoint}?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      signal,
      redirect: 'error',
    });
    if (!response.ok) throw new WhoopCollectionError(domain, response.status);

    const data = await response.json();
    if (!Array.isArray(data?.records)) {
      throw new Error(`Invalid WHOOP ${domain} collection response`);
    }
    records.push(...data.records);

    const nextToken = data.next_token;
    if (nextToken == null || nextToken === '') return records;
    if (typeof nextToken !== 'string' || tokens.has(nextToken)) {
      throw new Error(`Invalid or repeated WHOOP ${domain} page token`);
    }
    tokens.add(nextToken);
    params.set('nextToken', nextToken);
  }
  throw new Error(`WHOOP ${domain} collection exceeded the page limit`);
}

export function getRecovery(accessToken: string, startDate: Date, endDate: Date) {
  return getCollection<WhoopRecoveryResponse>('recovery', 'recovery', accessToken, startDate, endDate);
}

export function getSleep(accessToken: string, startDate: Date, endDate: Date) {
  return getCollection<WhoopSleepResponse>('activity/sleep', 'sleep', accessToken, startDate, endDate);
}

export function getCycles(accessToken: string, startDate: Date, endDate: Date) {
  return getCollection<WhoopCycleResponse>('cycle', 'cycle', accessToken, startDate, endDate);
}

export function getWorkouts(accessToken: string, startDate: Date, endDate: Date) {
  return getCollection<WhoopWorkoutResponse>('activity/workout', 'workout', accessToken, startDate, endDate);
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
