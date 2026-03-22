/**
 * Classical cryptographic operations using Web Crypto API.
 * - X25519 (ECDH) for key exchange
 * - Ed25519 for signatures
 * - AES-256-GCM for symmetric encryption
 * - HKDF-SHA-512 for key derivation
 */

import { concatBytes, randomBytes } from './utils';

// === X25519 Key Exchange ===

export async function generateX25519KeyPair(): Promise<{
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'X25519' },
    true,
    ['deriveBits']
  ) as CryptoKeyPair;
  const publicKey = new Uint8Array(
    await crypto.subtle.exportKey('raw', keyPair.publicKey)
  );
  const privateKey = new Uint8Array(
    await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)
  );
  return { publicKey, privateKey };
}

export async function x25519DH(
  privateKeyBytes: Uint8Array,
  publicKeyBytes: Uint8Array
): Promise<Uint8Array> {
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBytes,
    { name: 'X25519' },
    false,
    ['deriveBits']
  );
  const publicKey = await crypto.subtle.importKey(
    'raw',
    publicKeyBytes,
    { name: 'X25519' },
    false,
    []
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'X25519', public: publicKey },
    privateKey,
    256
  );
  return new Uint8Array(bits);
}

// === Ed25519 Signatures ===

export async function generateEd25519KeyPair(): Promise<{
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'Ed25519' },
    true,
    ['sign', 'verify']
  ) as CryptoKeyPair;
  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  };
}

export async function ed25519Sign(
  privateKey: CryptoKey,
  data: Uint8Array
): Promise<Uint8Array> {
  const sig = await crypto.subtle.sign(
    { name: 'Ed25519' },
    privateKey,
    data
  );
  return new Uint8Array(sig);
}

export async function ed25519Verify(
  publicKey: CryptoKey,
  signature: Uint8Array,
  data: Uint8Array
): Promise<boolean> {
  return crypto.subtle.verify(
    { name: 'Ed25519' },
    publicKey,
    signature,
    data
  );
}

export async function exportEd25519PublicKey(key: CryptoKey): Promise<Uint8Array> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return new Uint8Array(raw);
}

export async function importEd25519PublicKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'Ed25519' },
    true,
    ['verify']
  );
}

export async function exportEd25519PrivateKey(key: CryptoKey): Promise<Uint8Array> {
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', key);
  return new Uint8Array(pkcs8);
}

export async function importEd25519PrivateKey(pkcs8: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    pkcs8,
    { name: 'Ed25519' },
    true,
    ['sign']
  );
}

// === AES-256-GCM ===

export async function aesEncrypt(
  key: Uint8Array,
  plaintext: Uint8Array,
  aad?: Uint8Array
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
  const iv = randomBytes(12);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key.slice(0, 32),
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  const params: AesGcmParams = { name: 'AES-GCM', iv };
  if (aad) params.additionalData = aad;
  const encrypted = await crypto.subtle.encrypt(params, cryptoKey, plaintext);
  return { ciphertext: new Uint8Array(encrypted), iv };
}

export async function aesDecrypt(
  key: Uint8Array,
  ciphertext: Uint8Array,
  iv: Uint8Array,
  aad?: Uint8Array
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key.slice(0, 32),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  const params: AesGcmParams = { name: 'AES-GCM', iv };
  if (aad) params.additionalData = aad;
  const decrypted = await crypto.subtle.decrypt(params, cryptoKey, ciphertext);
  return new Uint8Array(decrypted);
}

// === HKDF-SHA-512 ===

export async function hkdfSha512(
  ikm: Uint8Array,
  salt: Uint8Array | string,
  info: Uint8Array | string,
  length: number = 64
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const saltBytes = typeof salt === 'string' ? encoder.encode(salt) : salt;
  const infoBytes = typeof info === 'string' ? encoder.encode(info) : info;

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    ikm,
    'HKDF',
    false,
    ['deriveBits']
  );

  const derived = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-512',
      salt: saltBytes,
      info: infoBytes,
    },
    keyMaterial,
    length * 8
  );

  return new Uint8Array(derived);
}

// === Convenience: Derive two keys from HKDF ===

export async function kdfChainKey(
  chainKey: Uint8Array
): Promise<{ nextChainKey: Uint8Array; messageKey: Uint8Array }> {
  const derived = await hkdfSha512(chainKey, chainKey, 'msg', 64);
  return {
    nextChainKey: derived.slice(0, 32),
    messageKey: derived.slice(32, 64),
  };
}

export async function kdfRootKey(
  rootKey: Uint8Array,
  dhOut: Uint8Array
): Promise<{ newRootKey: Uint8Array; newChainKey: Uint8Array }> {
  const derived = await hkdfSha512(
    concatBytes(rootKey, dhOut),
    rootKey,
    'ratchet',
    64
  );
  return {
    newRootKey: derived.slice(0, 32),
    newChainKey: derived.slice(32, 64),
  };
}
