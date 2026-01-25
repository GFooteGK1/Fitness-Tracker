/**
 * Property-Based Test: Token Encryption Round-Trip
 * 
 * Feature: whoop-integration
 * Property 1: Token Encryption Round-Trip
 * 
 * Validates: Requirements 1.3, 2.1
 * 
 * Property: For any valid access token and refresh token pair, encrypting then
 * decrypting SHALL produce the original token values, AND the encrypted value
 * SHALL differ from the plaintext value.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import { encryptToken, decryptToken, encryptTokens, decryptTokens, generateEncryptionKey } from '../../app/lib/whoop/encryption';

// Set up encryption key for tests
beforeAll(() => {
  if (!process.env.WHOOP_ENCRYPTION_KEY) {
    process.env.WHOOP_ENCRYPTION_KEY = generateEncryptionKey();
  }
});

// Generator for realistic OAuth tokens (alphanumeric strings of varying length)
const tokenArbitrary = fc.string({
  minLength: 20,
  maxLength: 200,
  unit: fc.constantFrom(
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'.split('')
  )
});

describe('Property 1: Token Encryption Round-Trip', () => {
  it('should decrypt to original value after encryption', () => {
    fc.assert(
      fc.property(tokenArbitrary, (token) => {
        // Encrypt the token
        const encrypted = encryptToken(token);
        
        // Decrypt the token
        const decrypted = decryptToken(encrypted);
        
        // Property: Decrypted value must equal original
        return decrypted === token;
      }),
      { numRuns: 100 }
    );
  });

  it('should produce different encrypted values for same token (due to random IV)', () => {
    fc.assert(
      fc.property(tokenArbitrary, (token) => {
        // Encrypt the same token twice
        const encrypted1 = encryptToken(token);
        const encrypted2 = encryptToken(token);
        
        // Property: Encrypted values should differ (random IV)
        const differentEncrypted = encrypted1 !== encrypted2;
        
        // Property: Both should decrypt to original
        const decrypt1 = decryptToken(encrypted1) === token;
        const decrypt2 = decryptToken(encrypted2) === token;
        
        return differentEncrypted && decrypt1 && decrypt2;
      }),
      { numRuns: 100 }
    );
  });

  it('should produce encrypted value different from plaintext', () => {
    fc.assert(
      fc.property(tokenArbitrary, (token) => {
        // Encrypt the token
        const encrypted = encryptToken(token);
        
        // Property: Encrypted value must differ from plaintext
        return encrypted !== token;
      }),
      { numRuns: 100 }
    );
  });

  it('should handle token pairs correctly with encryptTokens/decryptTokens', () => {
    fc.assert(
      fc.property(
        tokenArbitrary,
        tokenArbitrary,
        (accessToken, refreshToken) => {
          // Encrypt both tokens
          const { accessTokenEncrypted, refreshTokenEncrypted } = encryptTokens(
            accessToken,
            refreshToken
          );
          
          // Decrypt both tokens
          const { accessToken: decryptedAccess, refreshToken: decryptedRefresh } = decryptTokens(
            accessTokenEncrypted,
            refreshTokenEncrypted
          );
          
          // Property: Both tokens should decrypt to originals
          return (
            decryptedAccess === accessToken &&
            decryptedRefresh === refreshToken
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should maintain token integrity across multiple encrypt/decrypt cycles', () => {
    fc.assert(
      fc.property(tokenArbitrary, (token) => {
        let current = token;
        
        // Perform 5 encrypt/decrypt cycles
        for (let i = 0; i < 5; i++) {
          const encrypted = encryptToken(current);
          current = decryptToken(encrypted);
        }
        
        // Property: Token should remain unchanged after multiple cycles
        return current === token;
      }),
      { numRuns: 100 }
    );
  });

  it('should handle edge case tokens (empty-like, special chars)', () => {
    const edgeCaseTokens = fc.constantFrom(
      'a', // Single character
      'ab', // Two characters
      'a'.repeat(20), // Minimum length
      'x'.repeat(200), // Maximum length
      'token-with-dashes',
      'token_with_underscores',
      'MixedCaseToken123',
      'token.with.dots',
      'token/with/slashes'
    );

    fc.assert(
      fc.property(edgeCaseTokens, (token) => {
        const encrypted = encryptToken(token);
        const decrypted = decryptToken(encrypted);
        
        return decrypted === token && encrypted !== token;
      }),
      { numRuns: 50 }
    );
  });

  it('should produce encrypted tokens in correct format (iv:authTag:ciphertext)', () => {
    fc.assert(
      fc.property(tokenArbitrary, (token) => {
        const encrypted = encryptToken(token);
        
        // Property: Encrypted format should have exactly 3 parts separated by colons
        const parts = encrypted.split(':');
        const hasThreeParts = parts.length === 3;
        
        // Property: Each part should be valid hex
        const allHex = parts.every(part => /^[0-9a-f]+$/i.test(part));
        
        // Property: IV should be 32 hex chars (16 bytes)
        const ivCorrectLength = parts[0].length === 32;
        
        // Property: Auth tag should be 32 hex chars (16 bytes)
        const authTagCorrectLength = parts[1].length === 32;
        
        // Property: Ciphertext should be non-empty
        const ciphertextNonEmpty = parts[2].length > 0;
        
        return hasThreeParts && allHex && ivCorrectLength && authTagCorrectLength && ciphertextNonEmpty;
      }),
      { numRuns: 100 }
    );
  });

  it('should fail to decrypt tampered encrypted tokens', () => {
    fc.assert(
      fc.property(tokenArbitrary, (token) => {
        const encrypted = encryptToken(token);
        
        // Tamper with the encrypted token by changing one character
        const tampered = encrypted.slice(0, -1) + (encrypted.slice(-1) === 'a' ? 'b' : 'a');
        
        // Property: Decrypting tampered token should throw an error
        try {
          decryptToken(tampered);
          return false; // Should not reach here
        } catch (error) {
          return true; // Expected to throw
        }
      }),
      { numRuns: 50 }
    );
  });
});
