/**
 * Cryptographic utility functions.
 */

const BASE64URL_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function toBase64Url(data: Uint8Array): string {
  let result = '';
  const len = data.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = data[i];
    const b1 = i + 1 < len ? data[i + 1] : 0;
    const b2 = i + 2 < len ? data[i + 2] : 0;
    result += BASE64URL_CHARS[(b0 >> 2) & 0x3f];
    result += BASE64URL_CHARS[((b0 << 4) | (b1 >> 4)) & 0x3f];
    if (i + 1 < len) result += BASE64URL_CHARS[((b1 << 2) | (b2 >> 6)) & 0x3f];
    if (i + 2 < len) result += BASE64URL_CHARS[b2 & 0x3f];
  }
  return result;
}

export function fromBase64Url(str: string): Uint8Array {
  const lookup: Record<string, number> = {};
  for (let i = 0; i < BASE64URL_CHARS.length; i++) {
    lookup[BASE64URL_CHARS[i]] = i;
  }
  const len = str.length;
  const bytes: number[] = [];
  for (let i = 0; i < len; i += 4) {
    const b0 = lookup[str[i]] || 0;
    const b1 = lookup[str[i + 1]] || 0;
    const b2 = i + 2 < len ? (lookup[str[i + 2]] ?? 0) : 0;
    const b3 = i + 3 < len ? (lookup[str[i + 3]] ?? 0) : 0;
    bytes.push((b0 << 2) | (b1 >> 4));
    if (i + 2 < len) bytes.push(((b1 << 4) | (b2 >> 2)) & 0xff);
    if (i + 3 < len) bytes.push(((b2 << 6) | b3) & 0xff);
  }
  return new Uint8Array(bytes);
}

export function toHex(data: Uint8Array): string {
  return Array.from(data).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLen = arrays.reduce((acc, a) => acc + a.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

export function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hash);
}

export async function sha512(data: Uint8Array): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest('SHA-512', data);
  return new Uint8Array(hash);
}

/**
 * Generate a safety number from a public key hash.
 * Returns a series of 6 five-digit number blocks (like Signal).
 */
export function generateSafetyNumber(pkHash: Uint8Array): string {
  const blocks: string[] = [];
  for (let i = 0; i < 6; i++) {
    const offset = i * 4;
    const val = ((pkHash[offset] << 24) | (pkHash[offset + 1] << 16) |
                 (pkHash[offset + 2] << 8) | pkHash[offset + 3]) >>> 0;
    blocks.push(String(val % 100000).padStart(5, '0'));
  }
  return blocks.join(' ');
}

export function generateUUID(): string {
  return crypto.randomUUID();
}
