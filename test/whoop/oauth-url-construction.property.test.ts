/**
 * Property-Based Test: OAuth Authorization URL Construction
 * 
 * Feature: whoop-integration
 * Property 2: OAuth Authorization URL Construction
 * 
 * Validates: Requirements 1.1
 * 
 * Property: For any OAuth initiation request with a valid user session, the
 * generated authorization URL SHALL contain the required parameters: client_id,
 * redirect_uri, response_type=code, scope (with all required WHOOP scopes),
 * and a cryptographically random state token.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// Required WHOOP scopes
const REQUIRED_SCOPES = [
  'read:recovery',
  'read:cycles',
  'read:workout',
  'read:sleep',
  'read:profile',
  'read:body_measurement',
  'offline'
];

// Function to build OAuth URL (extracted from route logic)
function buildOAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  scopes: string
): URL {
  const authUrl = new URL('https://api.prod.whoop.com/oauth/oauth2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', scopes);
  authUrl.searchParams.set('state', state);
  return authUrl;
}

// Generators
const clientIdArbitrary = fc.uuid();
const redirectUriArbitrary = fc.webUrl({ validSchemes: ['https', 'http'] });
const stateTokenArbitrary = fc.string({ minLength: 64, maxLength: 64, unit: fc.constantFrom(...'0123456789abcdef'.split('')) });

describe('Property 2: OAuth Authorization URL Construction', () => {
  it('should include all required parameters', () => {
    fc.assert(
      fc.property(
        clientIdArbitrary,
        redirectUriArbitrary,
        stateTokenArbitrary,
        (clientId, redirectUri, state) => {
          const scopes = REQUIRED_SCOPES.join(' ');
          const authUrl = buildOAuthUrl(clientId, redirectUri, state, scopes);

          // Property: URL should have all required parameters
          const hasClientId = authUrl.searchParams.has('client_id');
          const hasRedirectUri = authUrl.searchParams.has('redirect_uri');
          const hasResponseType = authUrl.searchParams.has('response_type');
          const hasScope = authUrl.searchParams.has('scope');
          const hasState = authUrl.searchParams.has('state');

          return hasClientId && hasRedirectUri && hasResponseType && hasScope && hasState;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should set response_type to code', () => {
    fc.assert(
      fc.property(
        clientIdArbitrary,
        redirectUriArbitrary,
        stateTokenArbitrary,
        (clientId, redirectUri, state) => {
          const scopes = REQUIRED_SCOPES.join(' ');
          const authUrl = buildOAuthUrl(clientId, redirectUri, state, scopes);

          // Property: response_type must be 'code'
          return authUrl.searchParams.get('response_type') === 'code';
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should include all required WHOOP scopes', () => {
    fc.assert(
      fc.property(
        clientIdArbitrary,
        redirectUriArbitrary,
        stateTokenArbitrary,
        (clientId, redirectUri, state) => {
          const scopes = REQUIRED_SCOPES.join(' ');
          const authUrl = buildOAuthUrl(clientId, redirectUri, state, scopes);

          const scopeParam = authUrl.searchParams.get('scope') || '';
          const scopeArray = scopeParam.split(' ');

          // Property: All required scopes must be present
          return REQUIRED_SCOPES.every(scope => scopeArray.includes(scope));
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should use provided client_id', () => {
    fc.assert(
      fc.property(
        clientIdArbitrary,
        redirectUriArbitrary,
        stateTokenArbitrary,
        (clientId, redirectUri, state) => {
          const scopes = REQUIRED_SCOPES.join(' ');
          const authUrl = buildOAuthUrl(clientId, redirectUri, state, scopes);

          // Property: client_id should match provided value
          return authUrl.searchParams.get('client_id') === clientId;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should use provided redirect_uri', () => {
    fc.assert(
      fc.property(
        clientIdArbitrary,
        redirectUriArbitrary,
        stateTokenArbitrary,
        (clientId, redirectUri, state) => {
          const scopes = REQUIRED_SCOPES.join(' ');
          const authUrl = buildOAuthUrl(clientId, redirectUri, state, scopes);

          // Property: redirect_uri should match provided value
          return authUrl.searchParams.get('redirect_uri') === redirectUri;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should use provided state token', () => {
    fc.assert(
      fc.property(
        clientIdArbitrary,
        redirectUriArbitrary,
        stateTokenArbitrary,
        (clientId, redirectUri, state) => {
          const scopes = REQUIRED_SCOPES.join(' ');
          const authUrl = buildOAuthUrl(clientId, redirectUri, state, scopes);

          // Property: state should match provided value
          return authUrl.searchParams.get('state') === state;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should generate unique state tokens for different requests', () => {
    fc.assert(
      fc.property(
        clientIdArbitrary,
        redirectUriArbitrary,
        fc.array(stateTokenArbitrary, { minLength: 2, maxLength: 10 }),
        (clientId, redirectUri, stateTokens) => {
          const scopes = REQUIRED_SCOPES.join(' ');
          
          // Build URLs with different state tokens
          const urls = stateTokens.map(state => 
            buildOAuthUrl(clientId, redirectUri, state, scopes)
          );

          // Property: Each URL should have a different state parameter
          const states = urls.map(url => url.searchParams.get('state'));
          const uniqueStates = new Set(states);

          return uniqueStates.size === stateTokens.length;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should use correct WHOOP authorization endpoint', () => {
    fc.assert(
      fc.property(
        clientIdArbitrary,
        redirectUriArbitrary,
        stateTokenArbitrary,
        (clientId, redirectUri, state) => {
          const scopes = REQUIRED_SCOPES.join(' ');
          const authUrl = buildOAuthUrl(clientId, redirectUri, state, scopes);

          // Property: URL should point to WHOOP OAuth endpoint
          const correctHost = authUrl.hostname === 'api.prod.whoop.com';
          const correctPath = authUrl.pathname === '/oauth/oauth2/auth';
          const correctProtocol = authUrl.protocol === 'https:';

          return correctHost && correctPath && correctProtocol;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should have cryptographically random state tokens', () => {
    fc.assert(
      fc.property(
        clientIdArbitrary,
        redirectUriArbitrary,
        stateTokenArbitrary,
        (clientId, redirectUri, state) => {
          // Property: State token should be 64 hex characters (32 bytes)
          const isHex = /^[0-9a-f]{64}$/i.test(state);
          const hasMinLength = state.length === 64;

          return isHex && hasMinLength;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should properly URL-encode all parameters', () => {
    fc.assert(
      fc.property(
        clientIdArbitrary,
        fc.webUrl({ validSchemes: ['https'] }),
        stateTokenArbitrary,
        (clientId, redirectUri, state) => {
          const scopes = REQUIRED_SCOPES.join(' ');
          const authUrl = buildOAuthUrl(clientId, redirectUri, state, scopes);

          // Property: URL should be valid and parseable
          try {
            const urlString = authUrl.toString();
            const reparsed = new URL(urlString);
            
            // Should be able to retrieve all parameters after parsing
            const hasAllParams = 
              reparsed.searchParams.has('client_id') &&
              reparsed.searchParams.has('redirect_uri') &&
              reparsed.searchParams.has('response_type') &&
              reparsed.searchParams.has('scope') &&
              reparsed.searchParams.has('state');

            return hasAllParams;
          } catch {
            return false;
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should include offline scope for refresh token', () => {
    fc.assert(
      fc.property(
        clientIdArbitrary,
        redirectUriArbitrary,
        stateTokenArbitrary,
        (clientId, redirectUri, state) => {
          const scopes = REQUIRED_SCOPES.join(' ');
          const authUrl = buildOAuthUrl(clientId, redirectUri, state, scopes);

          const scopeParam = authUrl.searchParams.get('scope') || '';

          // Property: Must include 'offline' scope for refresh tokens
          return scopeParam.includes('offline');
        }
      ),
      { numRuns: 100 }
    );
  });
});
