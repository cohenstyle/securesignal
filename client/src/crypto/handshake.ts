/**
 * X3DH-style hybrid key agreement for bootstrapping Double Ratchet sessions.
 *
 * Combines X25519 ECDH with ML-KEM-1024 encapsulation for quantum resistance.
 * The resulting root secret seeds the per-friend Double Ratchet.
 */

import type { KeyBundle, PublicKeyBundle } from '../types';
import {
  generateX25519KeyPair,
  x25519DH,
  hkdfSha512,
} from './classical';
import { mlKemEncapsulate, mlKemDecapsulate } from './pqc';
import { concatBytes, toBase64Url, fromBase64Url } from './utils';
import { combinedPublicKeyBlob } from './keys';

export interface HandshakeData {
  ek_c_public: string;     // base64url ephemeral X25519 public key
  ciphertext_pq: string;   // base64url ML-KEM ciphertext
}

/**
 * Initiator (Alice) side of the X3DH-style handshake.
 * Generates ephemeral keys, computes shared secrets, derives root secret.
 */
export async function initiateHandshake(
  localKeys: KeyBundle,
  remotePublicKeys: PublicKeyBundle
): Promise<{
  handshakeData: HandshakeData;
  rootSecret: Uint8Array;
  ephemeralDhPublic: Uint8Array;
}> {
  // 1. Generate ephemeral X25519 keypair
  const ephemeralX25519 = await generateX25519KeyPair();

  // 2. Compute classical shared secret
  const ssClassical = await x25519DH(
    ephemeralX25519.privateKey,
    remotePublicKeys.x25519PublicKey
  );

  // 3. Compute PQ shared secret
  const { ciphertext: kemCiphertext, sharedSecret: ssPq } =
    await mlKemEncapsulate(remotePublicKeys.identityKemPublicKey);

  // 4. Derive root secret via HKDF
  const combinedSecret = concatBytes(ssClassical, ssPq);
  const localBlob = await combinedPublicKeyBlob({
    identityKemPublicKey: localKeys.identityKemPublicKey,
    identitySigPublicKey: localKeys.identitySigPublicKey,
    x25519PublicKey: localKeys.x25519PublicKey,
    ed25519PublicKey: localKeys.ed25519PublicKey,
  });
  const remoteBlob = await combinedPublicKeyBlob(remotePublicKeys);
  const info = concatBytes(localBlob, remoteBlob);

  const rootSecret = await hkdfSha512(
    combinedSecret,
    'securemesh-x3dh-v1',
    info,
    64
  );

  return {
    handshakeData: {
      ek_c_public: toBase64Url(ephemeralX25519.publicKey),
      ciphertext_pq: toBase64Url(kemCiphertext),
    },
    rootSecret,
    ephemeralDhPublic: ephemeralX25519.publicKey,
  };
}

/**
 * Responder (Bob) side of the X3DH-style handshake.
 * Decapsulates and derives the same root secret.
 */
export async function completeHandshake(
  localKeys: KeyBundle,
  remotePublicKeys: PublicKeyBundle,
  handshakeData: HandshakeData
): Promise<{ rootSecret: Uint8Array }> {
  const ephemeralX25519Public = fromBase64Url(handshakeData.ek_c_public);
  const kemCiphertext = fromBase64Url(handshakeData.ciphertext_pq);

  // 1. Classical shared secret
  const ssClassical = await x25519DH(
    localKeys.x25519PrivateKey,
    ephemeralX25519Public
  );

  // 2. Decapsulate PQ shared secret
  const ssPq = await mlKemDecapsulate(
    kemCiphertext,
    localKeys.identityKemPrivateKey,
    localKeys.identityKemPublicKey
  );

  // 3. Derive root secret — info must be (alice_pk, bob_pk) same order as initiator
  const combinedSecret = concatBytes(ssClassical, ssPq);
  const remoteBlob = await combinedPublicKeyBlob(remotePublicKeys);
  const localBlob = await combinedPublicKeyBlob({
    identityKemPublicKey: localKeys.identityKemPublicKey,
    identitySigPublicKey: localKeys.identitySigPublicKey,
    x25519PublicKey: localKeys.x25519PublicKey,
    ed25519PublicKey: localKeys.ed25519PublicKey,
  });
  const info = concatBytes(remoteBlob, localBlob);

  const rootSecret = await hkdfSha512(
    combinedSecret,
    'securemesh-x3dh-v1',
    info,
    64
  );

  return { rootSecret };
}
