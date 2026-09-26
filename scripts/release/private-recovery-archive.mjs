// Cryptographic byte handling only. Caller owns private paths, process lifecycle,
// production authorization, encrypted diagnostics, and RAM-only plaintext staging.
import fs from 'node:fs';
import { open, lstat } from 'node:fs/promises';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const AAD = Buffer.from('SociusFit private recovery archive v1', 'utf8');
const DEFAULT_LIMIT = 64 * 1024 ** 3;
function validateKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('Archive key must be 32 bytes');
}
function validateLimit(maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('Invalid archive byte limit');
}
function meter(maxBytes) {
  const digest = createHash('sha256');
  let bytes = 0;
  const stream = new Transform({ transform(chunk, encoding, callback) {
    bytes += chunk.length;
    if (bytes > maxBytes) return callback(new Error('Archive byte limit exceeded'));
    digest.update(chunk);
    callback(null, chunk);
  } });
  return { stream, result: () => ({ bytes, sha256: digest.digest('hex') }) };
}
function discard() { return new Writable({ write(chunk, encoding, callback) { callback(); } }); }
function validateManifest(manifest) {
  if (!manifest || manifest.version !== 1 || manifest.algorithm !== 'aes-256-gcm'
    || manifest.aad !== AAD.toString('utf8')
    || !/^[0-9a-f]{24}$/.test(manifest.iv ?? '') || !/^[0-9a-f]{32}$/.test(manifest.tag ?? '')
    || !/^[0-9a-f]{64}$/.test(manifest.plaintextSha256 ?? '') || !/^[0-9a-f]{64}$/.test(manifest.ciphertextSha256 ?? '')
    || !Number.isSafeInteger(manifest.bytes) || manifest.bytes < 0
    || manifest.ciphertextBytes !== manifest.bytes) throw new Error('Invalid archive manifest');
}

/** Returns completion metadata only after encryption, file flush and producer success.
 * A failed capture may retain an encrypted partial file; it has no valid manifest.
 * waitForSuccess must reject unless the producing process exits successfully.
 */
export async function captureEncryptedArchive({ source, destination, key, waitForSuccess, maxBytes = DEFAULT_LIMIT }) {
  validateKey(key); validateLimit(maxBytes);
  if (typeof waitForSuccess !== 'function') throw new Error('Archive producer completion check required');
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(AAD);
  const plaintext = meter(maxBytes), ciphertext = meter(maxBytes);
  const completion = Promise.resolve().then(waitForSuccess).catch(() => {
    source.destroy(new Error('Archive producer failed'));
    throw new Error('Archive producer failed');
  });
  try {
    await Promise.all([
      pipeline(source, plaintext.stream, cipher, ciphertext.stream,
        fs.createWriteStream(destination, { flags: 'wx', mode: 0o600, flush: true })),
      completion,
    ]);
    const plain = plaintext.result(), encrypted = ciphertext.result();
    return { version: 1, algorithm: 'aes-256-gcm', aad: AAD.toString('utf8'),
      iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), bytes: plain.bytes,
      ciphertextBytes: encrypted.bytes, plaintextSha256: plain.sha256, ciphertextSha256: encrypted.sha256 };
  } catch {
    // Never propagate potentially sensitive producer/file/stream diagnostics.
    throw new Error('Archive capture failed; no completed archive metadata returned');
  }
}

const identity = stat => [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':');
async function openArchive(file, maxBytes) {
  const named = await lstat(file, { bigint: true });
  if (!named.isFile() || named.isSymbolicLink() || named.size > BigInt(maxBytes)) throw new Error('Unsafe archive file');
  const handle = await open(file, 'r');
  const initial = await handle.stat({ bigint: true });
  if (!initial.isFile() || identity(initial) !== identity(named)) {
    await handle.close(); throw new Error('Archive changed while opening');
  }
  return { handle, initial: identity(initial) };
}
async function unchanged(handle, initial) {
  if (identity(await handle.stat({ bigint: true })) !== initial) throw new Error('Archive changed during verification');
}
async function closeArchive(archive) {
  try { await archive?.handle.close(); }
  catch (error) {
    // pipeline destruction can already close the descriptor on sink failure.
    if (error.code !== 'EBADF') throw new Error('Archive cleanup failed; do not use destination bytes');
  }
}
async function decryptPass(handle, key, manifest, destination, maxBytes) {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(manifest.iv, 'hex'));
  decipher.setAAD(AAD); decipher.setAuthTag(Buffer.from(manifest.tag, 'hex'));
  const ciphertext = meter(maxBytes), plaintext = meter(maxBytes);
  await pipeline(fs.createReadStream('', { fd: handle.fd, start: 0, autoClose: false }),
    ciphertext.stream, decipher, plaintext.stream, destination);
  const encrypted = ciphertext.result(), plain = plaintext.result();
  if (plain.bytes !== manifest.bytes || encrypted.bytes !== manifest.ciphertextBytes
    || plain.sha256 !== manifest.plaintextSha256 || encrypted.sha256 !== manifest.ciphertextSha256) {
    throw new Error('Archive manifest comparison failed');
  }
}

/** Full decrypt/authentication pass to a discard sink; no plaintext output file. */
export async function authenticateEncryptedArchive({ path, key, manifest, maxBytes = DEFAULT_LIMIT }) {
  validateKey(key); validateLimit(maxBytes); validateManifest(manifest);
  let archive;
  try {
    archive = await openArchive(path, maxBytes);
    await decryptPass(archive.handle, key, manifest, discard(), maxBytes);
    await unchanged(archive.handle, archive.initial);
    return { authenticated: true, bytes: manifest.bytes, plaintextSha256: manifest.plaintextSha256 };
  } catch {
    throw new Error('Archive authentication failed; no plaintext released');
  } finally { await closeArchive(archive); }
}

/** Authenticates completely BEFORE creating a plaintext destination, then decrypts
 * again using the same open file handle. Destination must be private RAM staging,
 * never an executing psql/pg_restore stdin: a concurrent file/destination failure
 * may leave partial staging bytes, and only successful return authorizes their use.
 * Caller must prevent archive mutation and gate execution on successful return.
 */
export async function restoreAuthenticatedArchive({ path, key, manifest, createDestination, maxBytes = DEFAULT_LIMIT }) {
  validateKey(key); validateLimit(maxBytes); validateManifest(manifest);
  if (typeof createDestination !== 'function') throw new Error('Private staging destination factory required');
  let archive;
  try {
    archive = await openArchive(path, maxBytes);
    await decryptPass(archive.handle, key, manifest, discard(), maxBytes);
    await unchanged(archive.handle, archive.initial);
    const destination = await createDestination();
    await decryptPass(archive.handle, key, manifest, destination, maxBytes);
    await unchanged(archive.handle, archive.initial);
    return { authenticated: true, staged: true, bytes: manifest.bytes, plaintextSha256: manifest.plaintextSha256 };
  } catch {
    throw new Error('Archive private staging failed; do not use destination bytes');
  } finally { await closeArchive(archive); }
}
