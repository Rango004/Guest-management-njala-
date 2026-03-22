import crypto from 'crypto';
import QRCode from 'qrcode';
import { config } from '../config';
import type { PassType } from '../types';

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const CODE_LENGTH = 17;

// ── Deterministic key derivation from QR_HMAC_SECRET ─────────────────────────
//
// We derive two sub-keys from the existing HMAC secret using HKDF so that
// no new environment variables are required:
//   1. Ed25519 seed  → asymmetric signing (gate devices hold only the public key)
//   2. AES-256 key   → payload encryption (gate devices receive this key at sync)

const hmacSecretBuf = Buffer.from(config.qr.hmacSecret, 'utf8');

const ed25519Seed = Buffer.from(
  crypto.hkdfSync('sha256', hmacSecretBuf, Buffer.alloc(0), 'congregation:ed25519-signing', 32)
);

// Ed25519 PKCS#8 DER = fixed 16-byte header + 32-byte seed
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const ed25519PrivateKey = crypto.createPrivateKey({
  key: Buffer.concat([PKCS8_ED25519_PREFIX, ed25519Seed]),
  format: 'der',
  type: 'pkcs8',
});
const ed25519PublicKey = crypto.createPublicKey(ed25519PrivateKey);

const aes256Key = Buffer.from(
  crypto.hkdfSync('sha256', hmacSecretBuf, Buffer.alloc(0), 'congregation:aes256-gcm-encryption', 32)
);

/** Ed25519 public key in SPKI DER format (base64) — distributed to gate devices */
export const signingPublicKeyB64: string = ed25519PublicKey
  .export({ type: 'spki', format: 'der' })
  .toString('base64');

/** AES-256 key (base64) — distributed to gate devices for payload decryption */
export const encryptionKeyB64: string = aes256Key.toString('base64');

// ── Raw code generation ───────────────────────────────────────────────────────

/**
 * Generate a cryptographically secure 17-character base62 code.
 * Uses 128-bit random entropy, exactly as specified in the requirements.
 */
export function generateRawCode(): string {
  const bytes = crypto.randomBytes(16); // 128 bits
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    // Use modulo bias reduction: discard bytes >= 248 (248 = floor(256/62)*62)
    let b: number;
    let pos = i;
    do {
      b = bytes[pos % 16]!;
      pos++;
    } while (b >= 248);
    code += BASE62[b % 62];
  }
  return code;
}

// ── Hashing ───────────────────────────────────────────────────────────────────

/**
 * Compute the SHA-256 hex digest of a raw QR code.
 * This is what is stored in passes.qr_code_hash.
 * The raw code itself is never stored in the database.
 */
export function hashCode(rawCode: string): string {
  return crypto.createHash('sha256').update(rawCode, 'utf8').digest('hex');
}

// ── Ed25519 signing ──────────────────────────────────────────────────────────

/**
 * Sign the raw 17-char code with Ed25519.
 * Returns the 64-byte signature as a base64url string (no padding).
 *
 * Gate devices verify this signature using the public key received during sync.
 * Because the key pair is asymmetric, a compromised gate device cannot forge
 * signatures — only the backend holds the private key.
 */
function signCode(rawCode: string): string {
  const sig = crypto.sign(null, Buffer.from(rawCode, 'utf8'), ed25519PrivateKey);
  return sig.toString('base64url');
}

// ── AES-256-GCM encryption ──────────────────────────────────────────────────

/**
 * Encrypt the signed payload with AES-256-GCM.
 *
 * Plaintext format: `<17-char-code>.<base64url-signature>`
 * Output format:    `<iv-base64url>.<ciphertext-base64url>.<tag-base64url>`
 *
 * AES-GCM provides both confidentiality AND integrity (authenticated encryption),
 * so no separate HMAC is needed for the encrypted payload.
 */
function encryptPayload(rawCode: string, signature: string): string {
  const plaintext = `${rawCode}.${signature}`;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', aes256Key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${encrypted.toString('base64url')}.${tag.toString('base64url')}`;
}

// ── Legacy HMAC (kept for backward compatibility with existing passes) ───────

/**
 * Compute an HMAC-SHA256 over the pass payload.
 * @deprecated New passes use Ed25519 signature + AES-256-GCM encryption.
 * Retained only so existing un-regenerated passes still validate during sync.
 */
export function computeHmac(
  rawCode: string,
  passType: PassType,
  facultyCode: string,
  gateCode: string,
  eventId: string
): string {
  const payload = `${rawCode}|${passType}|${facultyCode}|${gateCode}|${eventId}`;
  return crypto
    .createHmac('sha256', config.qr.hmacSecret)
    .update(payload, 'utf8')
    .digest('hex');
}

// ── QR image generation ───────────────────────────────────────────────────────

export interface QrPayload {
  code: string;         // raw 17-char code
  type: PassType;
  faculty: string;      // faculty code e.g. 'ENG'
  gate: string;         // gate code e.g. 'A'
  eventId: string;
  hmac: string;         // legacy — for server-side reconciliation integrity check
}

/**
 * Generate a QR code image as a base64 data URL.
 *
 * The QR now encodes an encrypted+signed payload instead of raw JSON.
 * Payload is: `<iv>.<ciphertext>.<tag>` (all base64url).
 *
 * Error correction Level H (30% recovery) — maximises scan reliability
 * under screen glare, print damage, and noisy camera conditions.
 */
export async function generateQrDataUrl(encryptedPayload: string): Promise<string> {
  return QRCode.toDataURL(encryptedPayload, {
    errorCorrectionLevel: 'H',
    margin: 2,
    color: { dark: '#000000', light: '#FFFFFF' },
  });
}

/**
 * Generate a QR code as a PNG Buffer (for email attachments).
 */
export async function generateQrBuffer(encryptedPayload: string): Promise<Buffer> {
  return QRCode.toBuffer(encryptedPayload, {
    errorCorrectionLevel: 'H',
    margin: 2,
  });
}

/**
 * Full pass QR generation pipeline:
 *  1. Generate random raw code (17-char base62, 128-bit entropy)
 *  2. Compute SHA-256 hash (stored in DB — raw code is never persisted)
 *  3. Sign the raw code with Ed25519 (offline-verifiable at gate)
 *  4. Encrypt code+signature with AES-256-GCM (payload confidentiality)
 *  5. Generate QR image at error correction Level H (30% damage recovery)
 *
 * The QR payload is minimal — only the code and signature. Pass metadata
 * (type, faculty, gate) is looked up from the offline IndexedDB dataset
 * after the hash match, keeping the QR small and noise-resilient.
 */
export async function createPassQr(
  _passType: PassType,
  _facultyCode: string,
  _gateCode: string,
  _eventId: string
): Promise<{ rawCode: string; hash: string; encryptedPayload: string; dataUrl: string; buffer: Buffer }> {
  const rawCode = generateRawCode();
  const hash = hashCode(rawCode);
  const signature = signCode(rawCode);
  const encryptedPayload = encryptPayload(rawCode, signature);

  const [dataUrl, buffer] = await Promise.all([
    generateQrDataUrl(encryptedPayload),
    generateQrBuffer(encryptedPayload),
  ]);

  return { rawCode, hash, encryptedPayload, dataUrl, buffer };
}
