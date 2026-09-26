// Local private recovery storage only. No network or production login capability.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const RECOVERY_DIRECTORY = 'C:/Users/foote/AppData/Local/SociusFit/Recovery';
export const RECOVERY_PROJECT = 'auolnfwetmfcwhtvakzy';
export const RECOVERY_IMAGE = '66089200353d90686fe9b252a47d17d078364bf47c50190852c33dc850a0191f';
// Source-version runtime verified separately: same ICU actual version as source.
export const RECOVERY_RESTORE_IMAGE = '74bcceb8123bdc6d9b129eac9446cc0c0fa6fd2e5ee1b5da185c02529b420080';
export const RECOVERY_RESTORE_USER = '101:102';
const pwsh = 'C:/Users/foote/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe';
export const privateEnvironment = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|HOMEDRIVE|HOMEPATH)$/i.test(key)));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function verifyAcl(directory, requireProtected = false) {
  const script = `$ErrorActionPreference='Stop'; $p=[Console]::In.ReadToEnd();
$a=Get-Acl -LiteralPath $p; $u=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;
$allowed=@($u,'S-1-5-18','S-1-5-32-544');
if (${requireProtected ? '-not $a.AreAccessRulesProtected -or ' : ''}$a.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $u) { throw 'Unsafe owner or inheritance' }
$rules=@($a.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]));
if ($rules.Count -ne 3 -or @($rules | ForEach-Object { $_.IdentityReference.Value } | Select-Object -Unique).Count -ne 3) { throw 'Unexpected ACL count' }
foreach ($r in $rules) { if ($r.IdentityReference.Value -notin $allowed -or $r.AccessControlType -ne 'Allow' -or $r.FileSystemRights -ne 'FullControl' -or [int]$r.PropagationFlags -ne 0) { throw 'Unexpected ACL rule' } }
if ((Get-Item -LiteralPath $p).PSIsContainer) { foreach ($r in $rules) { if ([int]$r.InheritanceFlags -ne 3) { throw 'Missing child inheritance' } } }
'verified'`;
  const result = spawnSync(pwsh, ['-NoProfile', '-NonInteractive', '-Command', script], { input: directory, env: privateEnvironment(), encoding: 'utf8', windowsHide: true, timeout: 30000 });
  if (result.status !== 0 || result.stdout.trim() !== 'verified') throw Error('Private recovery ACL validation failed');
}

export function verifyPrivateRecoveryDirectory() {
  for (let current = path.resolve(RECOVERY_DIRECTORY); ; current = path.dirname(current)) {
    const stat = fs.lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('Recovery path is redirected');
    if (path.dirname(current) === current) break;
  }
  verifyAcl(RECOVERY_DIRECTORY, true);
}

export function privateRunDirectory(runId) {
  if (!/^backup-\d{14}-[a-f0-9]{8}$/.test(runId)) throw Error('Expected a completed private backup run ID');
  const directory = path.join(RECOVERY_DIRECTORY, runId);
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('Backup directory is redirected');
  verifyAcl(directory);
  return directory;
}

export function privateLocaleRunDirectory(runId) {
  if (!/^locale-\d{14}-[a-f0-9]{8}$/.test(runId)) throw Error('Expected an approved locale metadata run ID');
  const directory = path.join(RECOVERY_DIRECTORY, runId);
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('Locale evidence directory is redirected');
  verifyAcl(directory);
  return directory;
}

function readPrivateFile(directory, name, maxBytes = 32 * 1024 * 1024) {
  if (!/^[a-zA-Z0-9.-]+$/.test(name)) throw Error('Invalid private artifact name');
  const file = path.join(directory, name), stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes) throw Error('Unsafe private recovery file');
  verifyAcl(file);
  return fs.readFileSync(file);
}

export function unwrapRecoveryKey(directory) {
  const protectedKey = readPrivateFile(directory, 'archive-key.dpapi', 8192);
  const script = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security.Cryptography.ProtectedData;
$data=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim());
$entropy=[Text.Encoding]::UTF8.GetBytes('SociusFit private recovery v1');
$result=[Security.Cryptography.ProtectedData]::Unprotect($data,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser);
[Console]::Out.Write([Convert]::ToBase64String($result));`;
  const result = spawnSync(pwsh, ['-NoProfile', '-NonInteractive', '-Command', script], { env: privateEnvironment(), input: protectedKey.toString('base64'), encoding: 'utf8', windowsHide: true, timeout: 30000 });
  if (result.status !== 0) throw Error('Windows recovery key unwrapping failed');
  const key = Buffer.from(result.stdout.trim(), 'base64');
  if (key.length !== 32) throw Error('Invalid recovered key size');
  return key;
}

export function readPrivateJson(directory, name) {
  try { return JSON.parse(readPrivateFile(directory, name).toString('utf8')); }
  catch { throw Error('Private JSON artifact could not be read'); }
}

export function unsealPrivateMetadata(directory, name, key) {
  try {
    const manifest = readPrivateJson(directory, `${name}.encryption.json`);
    if (manifest.algorithm !== 'aes-256-gcm' || !Buffer.isBuffer(key) || key.length !== 32 || !/^[A-Za-z0-9+/]{16}$/.test(manifest.iv ?? '') || !/^[A-Za-z0-9+/]{22}==$/.test(manifest.tag ?? '') || !/^[a-f0-9]{64}$/.test(manifest.ciphertextSha256 ?? '') || !/^[a-f0-9]{64}$/.test(manifest.plaintextSha256 ?? '') || !Number.isSafeInteger(manifest.bytes) || manifest.bytes < 0) throw Error('Invalid metadata encryption envelope');
    const data = readPrivateFile(directory, `${name}.aes`);
    if (digest(data) !== manifest.ciphertextSha256) throw Error('Ciphertext digest mismatch');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(manifest.iv, 'base64'), { authTagLength: 16 });
    decipher.setAuthTag(Buffer.from(manifest.tag, 'base64'));
    const plain = Buffer.concat([decipher.update(data), decipher.final()]);
    if (plain.length !== manifest.bytes || digest(plain) !== manifest.plaintextSha256) throw Error('Plaintext digest mismatch');
    return plain;
  } catch { throw Error('Private metadata authentication failed'); }
}

export function sealPrivateMetadata(directory, name, data, key) {
  if (!/^[a-zA-Z0-9.-]+$/.test(name)) throw Error('Invalid private artifact name');
  if (!Buffer.isBuffer(key) || key.length !== 32) throw Error('Invalid metadata key');
  verifyAcl(directory);
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
  fs.writeFileSync(path.join(directory, `${name}.aes`), ciphertext, { flag: 'wx' });
  fs.writeFileSync(path.join(directory, `${name}.encryption.json`), JSON.stringify({ algorithm: 'aes-256-gcm', key: '../archive-key.dpapi', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), plaintextSha256: digest(bytes), ciphertextSha256: digest(ciphertext), bytes: bytes.length }), { flag: 'wx' });
}
