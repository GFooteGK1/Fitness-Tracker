/**
 * Token Encryption Utilities
 * 
 * Provides secure encryption/decryption for WHOOP OAuth tokens using AES-256-GCM.
 * Tokens are encrypted before storage in the database and decrypted when retrieved.
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits

/**
 * Get encryption key from environment variable
 * Key should be a 64-character hex string (32 bytes)
 */
function getEncryptionKey(): Buffer {
  const keyHex = process.env.WHOOP_ENCRYPTION_KEY;
  
  if (!keyHex) {
    throw new Error('WHOOP_ENCRYPTION_KEY environment variable is not set');
  }
  
  if (keyHex.length !== KEY_LENGTH * 2) {
    throw new Error(`WHOOP_ENCRYPTION_KEY must be ${KEY_LENGTH * 2} hex characters (${KEY_LENGTH} bytes)`);
  }
  
  return Buffer.from(keyHex, 'hex');
}

/**
 * Generate a random encryption key (for setup)
 * Returns a 64-character hex string
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
}

/**
 * Encrypt a token using AES-256-GCM
 * 
 * @param plaintext - The token to encrypt
 * @returns Encrypted token in format: iv:authTag:ciphertext (all hex-encoded)
 */
export function encryptToken(plaintext: string): string {
  if (!plaintext) {
    throw new Error('Cannot encrypt empty token');
  }
  
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  // Format: iv:authTag:ciphertext
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a token using AES-256-GCM
 * 
 * @param encryptedToken - The encrypted token in format: iv:authTag:ciphertext
 * @returns Decrypted plaintext token
 */
export function decryptToken(encryptedToken: string): string {
  if (!encryptedToken) {
    throw new Error('Cannot decrypt empty token');
  }
  
  const parts = encryptedToken.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format');
  }
  
  const [ivHex, authTagHex, ciphertext] = parts;
  
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Encrypt WHOOP tokens for storage
 * 
 * @param accessToken - Access token to encrypt
 * @param refreshToken - Refresh token to encrypt
 * @returns Object with encrypted tokens
 */
export function encryptTokens(accessToken: string, refreshToken: string): {
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string;
} {
  return {
    accessTokenEncrypted: encryptToken(accessToken),
    refreshTokenEncrypted: encryptToken(refreshToken)
  };
}

/**
 * Decrypt WHOOP tokens from storage
 * 
 * @param accessTokenEncrypted - Encrypted access token
 * @param refreshTokenEncrypted - Encrypted refresh token
 * @returns Object with decrypted tokens
 */
export function decryptTokens(
  accessTokenEncrypted: string,
  refreshTokenEncrypted: string
): {
  accessToken: string;
  refreshToken: string;
} {
  return {
    accessToken: decryptToken(accessTokenEncrypted),
    refreshToken: decryptToken(refreshTokenEncrypted)
  };
}
