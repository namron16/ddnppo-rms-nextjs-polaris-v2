// lib/gdrive-pool/crypto.ts
// AES-256-GCM encryption/decryption for OAuth2 tokens before Supabase storage.
// Uses Node.js built-in `crypto` — no additional dependencies required.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

const ALGORITHM  = 'aes-256-gcm'
const IV_LENGTH  = 16   // bytes
const TAG_LENGTH = 16   // bytes (GCM auth tag)
const SALT_LEN   = 32   // bytes

/**
 * Derives a 32-byte key from the env secret using scrypt.
 * The salt is stored alongside the ciphertext so rotation is possible.
 */
function deriveKey(secret: string, salt: Buffer): Buffer {
  return scryptSync(secret, salt, 32) as Buffer
}

function getSecret(): string {
  const s = process.env.TOKEN_ENCRYPTION_SECRET
  if (!s || s.length < 32) {
    throw new Error(
      'TOKEN_ENCRYPTION_SECRET env var is missing or shorter than 32 characters.'
    )
  }
  return s
}

/**
 * Encrypts a plaintext string and returns a base64-encoded payload:
 *   salt(32) || iv(16) || authTag(16) || ciphertext
 */
export function encryptToken(plaintext: string): string {
  const secret     = getSecret()
  const salt       = randomBytes(SALT_LEN)
  const iv         = randomBytes(IV_LENGTH)
  const key        = deriveKey(secret, salt)
  const cipher     = createCipheriv(ALGORITHM, key, iv)
  const encrypted  = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag    = cipher.getAuthTag()

  const payload = Buffer.concat([salt, iv, authTag, encrypted])
  return payload.toString('base64')
}

/**
 * Decrypts a base64-encoded payload produced by encryptToken().
 * Throws if the authentication tag is invalid (tamper detection).
 */
export function decryptToken(encoded: string): string {
  const secret  = getSecret()
  const payload = Buffer.from(encoded, 'base64')

  if (payload.length < SALT_LEN + IV_LENGTH + TAG_LENGTH + 1) {
    throw new Error('Encrypted token payload is too short — likely corrupted.')
  }

  const salt      = payload.subarray(0, SALT_LEN)
  const iv        = payload.subarray(SALT_LEN, SALT_LEN + IV_LENGTH)
  const authTag   = payload.subarray(SALT_LEN + IV_LENGTH, SALT_LEN + IV_LENGTH + TAG_LENGTH)
  const encrypted = payload.subarray(SALT_LEN + IV_LENGTH + TAG_LENGTH)

  const key      = deriveKey(secret, salt)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf8')
}

/**
 * Returns true if a token expiry timestamp (ISO string) is still valid
 * with a configurable safety buffer (default: 5 minutes).
 */
export function isTokenValid(
  tokenExpiry: string | null | undefined,
  bufferMs = 5 * 60 * 1000
): boolean {
  if (!tokenExpiry) return false
  const expiryMs = new Date(tokenExpiry).getTime()
  return Number.isFinite(expiryMs) && Date.now() < expiryMs - bufferMs
}

/**
 * Converts Google's `expires_in` (seconds from now) to an ISO timestamp.
 */
export function expiryFromSecondsNow(expiresIn: number): string {
  return new Date(Date.now() + expiresIn * 1000).toISOString()
}