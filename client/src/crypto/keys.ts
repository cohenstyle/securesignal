/**
 * Key bundle generation and management.
 * Handles hybrid PQC + classical key generation and serialization.
 */

import type { KeyBundle, PublicKeyBundle, SerializedPublicKeys, ContactCard } from '../types';
import {
  generateX25519KeyPair,
  generateEd25519KeyPair,
  exportEd25519PublicKey,
  importEd25519PublicKey,
  exportEd25519PrivateKey,
  importEd25519PrivateKey,
} from './classical';
import { mlKemGenerateKeyPair, mlDsaGenerateKeyPair } from './pqc';
import { toBase64Url, fromBase64Url, sha256, concatBytes } from './utils';

/**
 * Generate a complete key bundle for a new identity.
 */
export async function generateKeyBundle(): Promise<KeyBundle> {
  const [kemPair, sigPair, x25519Pair, ed25519Pair] = await Promise.all([
    mlKemGenerateKeyPair(),
    mlDsaGenerateKeyPair(),
    generateX25519KeyPair(),
    generateEd25519KeyPair(),
  ]);

  return {
    identityKemPublicKey: kemPair.publicKey,
    identityKemPrivateKey: kemPair.privateKey,
    identitySigPublicKey: sigPair.publicKey,
    identitySigPrivateKey: sigPair.privateKey,
    x25519PublicKey: x25519Pair.publicKey,
    x25519PrivateKey: x25519Pair.privateKey,
    ed25519PublicKey: ed25519Pair.publicKey,
    ed25519PrivateKey: ed25519Pair.privateKey,
    createdAt: Date.now(),
  };
}

/**
 * Extract public keys from a key bundle.
 */
export function getPublicKeys(bundle: KeyBundle): PublicKeyBundle {
  return {
    identityKemPublicKey: bundle.identityKemPublicKey,
    identitySigPublicKey: bundle.identitySigPublicKey,
    x25519PublicKey: bundle.x25519PublicKey,
    ed25519PublicKey: bundle.ed25519PublicKey,
  };
}

/**
 * Serialize public keys to base64url strings.
 */
export async function serializePublicKeys(
  keys: PublicKeyBundle
): Promise<SerializedPublicKeys> {
  const ed25519Raw = await exportEd25519PublicKey(keys.ed25519PublicKey);
  return {
    kem: toBase64Url(keys.identityKemPublicKey),
    sig: toBase64Url(keys.identitySigPublicKey),
    x25519: toBase64Url(keys.x25519PublicKey),
    ed25519: toBase64Url(ed25519Raw),
  };
}

/**
 * Deserialize public keys from base64url strings.
 */
export async function deserializePublicKeys(
  serialized: SerializedPublicKeys
): Promise<PublicKeyBundle> {
  const ed25519Raw = fromBase64Url(serialized.ed25519);
  const ed25519PublicKey = await importEd25519PublicKey(ed25519Raw);
  return {
    identityKemPublicKey: fromBase64Url(serialized.kem),
    identitySigPublicKey: fromBase64Url(serialized.sig),
    x25519PublicKey: fromBase64Url(serialized.x25519),
    ed25519PublicKey,
  };
}

/**
 * Compute a combined public key blob (for contact card).
 */
export async function combinedPublicKeyBlob(
  keys: PublicKeyBundle
): Promise<Uint8Array> {
  const ed25519Raw = await exportEd25519PublicKey(keys.ed25519PublicKey);
  return concatBytes(
    keys.identityKemPublicKey,
    keys.identitySigPublicKey,
    keys.x25519PublicKey,
    ed25519Raw
  );
}

/**
 * Compute the SHA-256 hash of the combined public key blob.
 * This is the identity anchor for a user.
 */
export async function publicKeyHash(keys: PublicKeyBundle): Promise<Uint8Array> {
  const blob = await combinedPublicKeyBlob(keys);
  return sha256(blob);
}

/**
 * Create a contact card from public keys and PeerJS IDs.
 */
export async function createContactCard(
  keys: PublicKeyBundle,
  discoveryPeerId: string,
  nextDiscoveryPeerId?: string,
  pushServerUrl?: string,
  peerServer?: { host: string; port: number; path: string }
): Promise<ContactCard> {
  const blob = await combinedPublicKeyBlob(keys);
  const card: ContactCard = {
    v: 1,
    pk: toBase64Url(blob),
    disc_pid: discoveryPeerId,
  };
  if (nextDiscoveryPeerId) card.next_disc_pid = nextDiscoveryPeerId;
  if (pushServerUrl) card.ps = pushServerUrl;
  if (peerServer) card.peer_server = peerServer;
  return card;
}

/**
 * Parse a combined public key blob back into components.
 */
export async function parseCombinedPublicKeyBlob(
  blob: Uint8Array
): Promise<PublicKeyBundle> {
  // ML-KEM-1024 public key: 1568 bytes
  // ML-DSA-87 public key: 2592 bytes
  // X25519 public key: 32 bytes
  // Ed25519 public key: 32 bytes
  const kemPub = blob.slice(0, 1568);
  const sigPub = blob.slice(1568, 1568 + 2592);
  const x25519Pub = blob.slice(1568 + 2592, 1568 + 2592 + 32);
  const ed25519Raw = blob.slice(1568 + 2592 + 32, 1568 + 2592 + 32 + 32);
  const ed25519PublicKey = await importEd25519PublicKey(ed25519Raw);
  return {
    identityKemPublicKey: kemPub,
    identitySigPublicKey: sigPub,
    x25519PublicKey: x25519Pub,
    ed25519PublicKey,
  };
}

/**
 * Encode a contact card as a base64url string for URL fragments.
 */
export function encodeContactCard(card: ContactCard): string {
  const json = JSON.stringify(card);
  const bytes = new TextEncoder().encode(json);
  return toBase64Url(bytes);
}

/**
 * Decode a base64url contact card string.
 */
export function decodeContactCard(encoded: string): ContactCard {
  const bytes = fromBase64Url(encoded);
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json);
}

/**
 * Serialize a key bundle for IndexedDB storage.
 */
export async function serializeKeyBundle(bundle: KeyBundle): Promise<object> {
  const ed25519PubRaw = await exportEd25519PublicKey(bundle.ed25519PublicKey);
  const ed25519PrivRaw = await exportEd25519PrivateKey(bundle.ed25519PrivateKey);
  return {
    identityKemPublicKey: toBase64Url(bundle.identityKemPublicKey),
    identityKemPrivateKey: toBase64Url(bundle.identityKemPrivateKey),
    identitySigPublicKey: toBase64Url(bundle.identitySigPublicKey),
    identitySigPrivateKey: toBase64Url(bundle.identitySigPrivateKey),
    x25519PublicKey: toBase64Url(bundle.x25519PublicKey),
    x25519PrivateKey: toBase64Url(bundle.x25519PrivateKey),
    ed25519PublicKey: toBase64Url(ed25519PubRaw),
    ed25519PrivateKey: toBase64Url(ed25519PrivRaw),
    createdAt: bundle.createdAt,
  };
}

/**
 * Deserialize a key bundle from IndexedDB storage.
 */
export async function deserializeKeyBundle(data: Record<string, unknown>): Promise<KeyBundle> {
  const ed25519PublicKey = await importEd25519PublicKey(fromBase64Url(data.ed25519PublicKey as string));
  const ed25519PrivateKey = await importEd25519PrivateKey(fromBase64Url(data.ed25519PrivateKey as string));
  return {
    identityKemPublicKey: fromBase64Url(data.identityKemPublicKey as string),
    identityKemPrivateKey: fromBase64Url(data.identityKemPrivateKey as string),
    identitySigPublicKey: fromBase64Url(data.identitySigPublicKey as string),
    identitySigPrivateKey: fromBase64Url(data.identitySigPrivateKey as string),
    x25519PublicKey: fromBase64Url(data.x25519PublicKey as string),
    x25519PrivateKey: fromBase64Url(data.x25519PrivateKey as string),
    ed25519PublicKey,
    ed25519PrivateKey,
    createdAt: data.createdAt as number,
  };
}
