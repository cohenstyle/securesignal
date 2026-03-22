/**
 * Messaging protocol layer.
 * Handles message encoding/decoding, signing, verification,
 * and the add-request/acceptance flow.
 */

import type {
  MessageEnvelope,
  MessageHeader,
  MessageType,
  KeyBundle,
  PublicKeyBundle,
  Contact,
  ProfileBlob,
  UserProfile,
} from '../types';
import {
  ed25519Sign,
  ed25519Verify,
  exportEd25519PublicKey,
  aesEncrypt,
  aesDecrypt,
} from '../crypto/classical';
import { mlDsaSign, mlDsaVerify } from '../crypto/pqc';
import { ratchetEncrypt, ratchetDecrypt } from '../crypto/ratchet';
import type { RatchetState } from '../types';
import {
  toBase64Url,
  fromBase64Url,
  concatBytes,
  generateUUID,
  sha256,
  toHex,
} from '../crypto/utils';
import { initiateHandshake, completeHandshake, type HandshakeData } from '../crypto/handshake';
import { serializePublicKeys, deserializePublicKeys, publicKeyHash, getPublicKeys } from '../crypto/keys';

/**
 * Create a signed profile blob.
 */
export async function createProfileBlob(
  profile: UserProfile,
  keyBundle: KeyBundle
): Promise<ProfileBlob> {
  const blobData = {
    v: 1,
    display_name: profile.displayName,
    photo: profile.photo,
    status: profile.status,
    bio: profile.bio,
    ts: Date.now(),
  };

  const canonical = JSON.stringify(blobData);
  const data = new TextEncoder().encode(canonical);

  const sigEd25519 = await ed25519Sign(keyBundle.ed25519PrivateKey, data);
  const sigMldsa87 = await mlDsaSign(keyBundle.identitySigPrivateKey, data);

  return {
    ...blobData,
    sig_ed25519: toBase64Url(sigEd25519),
    sig_mldsa87: toBase64Url(sigMldsa87),
  };
}

/**
 * Verify a profile blob's signatures.
 */
export async function verifyProfileBlob(
  blob: ProfileBlob,
  publicKeys: PublicKeyBundle
): Promise<boolean> {
  const { sig_ed25519, sig_mldsa87, ...rest } = blob;
  const canonical = JSON.stringify(rest);
  const data = new TextEncoder().encode(canonical);

  const [ed25519Valid, mldsaValid] = await Promise.all([
    ed25519Verify(publicKeys.ed25519PublicKey, fromBase64Url(sig_ed25519), data),
    mlDsaVerify(publicKeys.identitySigPublicKey, fromBase64Url(sig_mldsa87), data),
  ]);

  return ed25519Valid && mldsaValid;
}

/**
 * Create an add request message.
 */
export async function createAddRequest(
  localKeys: KeyBundle,
  localProfile: UserProfile,
  remotePublicKeys: PublicKeyBundle,
  localMessagingPeerId: string
): Promise<{
  envelope: Record<string, unknown>;
  rootSecret: Uint8Array;
  ephemeralDhPublic: Uint8Array;
}> {
  // Perform handshake
  const { handshakeData, rootSecret, ephemeralDhPublic } =
    await initiateHandshake(localKeys, remotePublicKeys);

  // Create signed profile
  const profileBlob = await createProfileBlob(localProfile, localKeys);

  // Serialize our public keys
  const serializedPk = await serializePublicKeys(getPublicKeys(localKeys));
  const pkHash = await publicKeyHash(getPublicKeys(localKeys));

  // Encrypt messaging peer ID to recipient's public key
  // Use a simple AES encryption with a derived key for this
  const msgPeerIdBytes = new TextEncoder().encode(localMessagingPeerId);
  const encKeyMaterial = concatBytes(
    localKeys.x25519PublicKey,
    remotePublicKeys.x25519PublicKey
  );
  const encKey = (await sha256(encKeyMaterial));
  const { ciphertext: encMsgPeerId, iv: encMsgPeerIdIv } =
    await aesEncrypt(encKey, msgPeerIdBytes);

  const envelope = {
    id: generateUUID(),
    type: 'add_request' as MessageType,
    senderPublicKeys: serializedPk,
    senderPkHash: toHex(pkHash),
    profileBlob,
    handshakeData,
    encryptedMessagingPeerId: toBase64Url(encMsgPeerId),
    encryptedMessagingPeerIdIv: toBase64Url(encMsgPeerIdIv),
    timestamp: Date.now(),
  };

  // Sign the envelope
  const envelopeBytes = new TextEncoder().encode(JSON.stringify(envelope));
  const sigEd25519 = await ed25519Sign(localKeys.ed25519PrivateKey, envelopeBytes);
  const sigMldsa87 = await mlDsaSign(localKeys.identitySigPrivateKey, envelopeBytes);

  return {
    envelope: {
      ...envelope,
      sig_ed25519: toBase64Url(sigEd25519),
      sig_mldsa87: toBase64Url(sigMldsa87),
    },
    rootSecret,
    ephemeralDhPublic,
  };
}

/**
 * Process an incoming add request.
 */
export async function processAddRequest(
  data: Record<string, unknown>,
  localKeys: KeyBundle
): Promise<{
  senderPublicKeys: PublicKeyBundle;
  senderPkHash: string;
  profile: UserProfile;
  handshakeData: HandshakeData;
  senderMessagingPeerId: string;
} | null> {
  try {
    const serializedPk = data.senderPublicKeys as Record<string, string>;
    const senderPk = await deserializePublicKeys({
      kem: serializedPk.kem,
      sig: serializedPk.sig,
      x25519: serializedPk.x25519,
      ed25519: serializedPk.ed25519,
    });

    // Verify signatures on the envelope
    const { sig_ed25519, sig_mldsa87, ...rest } = data;
    const envelopeBytes = new TextEncoder().encode(JSON.stringify(rest));

    const [ed25519Valid, mldsaValid] = await Promise.all([
      ed25519Verify(senderPk.ed25519PublicKey, fromBase64Url(sig_ed25519 as string), envelopeBytes),
      mlDsaVerify(senderPk.identitySigPublicKey, fromBase64Url(sig_mldsa87 as string), envelopeBytes),
    ]);

    if (!ed25519Valid || !mldsaValid) {
      console.warn('[SecureMesh] Add request signature verification failed');
      return null;
    }

    // Verify profile blob
    const profileBlob = data.profileBlob as ProfileBlob;
    const profileValid = await verifyProfileBlob(profileBlob, senderPk);
    if (!profileValid) {
      console.warn('[SecureMesh] Profile blob signature verification failed');
      return null;
    }

    // Decrypt messaging peer ID
    const encMsgPeerId = fromBase64Url(data.encryptedMessagingPeerId as string);
    const encMsgPeerIdIv = fromBase64Url(data.encryptedMessagingPeerIdIv as string);
    const encKeyMaterial = concatBytes(
      senderPk.x25519PublicKey,
      localKeys.x25519PublicKey
    );
    const encKey = await sha256(encKeyMaterial);
    const msgPeerIdBytes = await aesDecrypt(encKey, encMsgPeerId, encMsgPeerIdIv);
    const senderMessagingPeerId = new TextDecoder().decode(msgPeerIdBytes);

    const profile: UserProfile = {
      displayName: profileBlob.display_name,
      photo: profileBlob.photo,
      status: profileBlob.status,
      bio: profileBlob.bio,
    };

    return {
      senderPublicKeys: senderPk,
      senderPkHash: data.senderPkHash as string,
      profile,
      handshakeData: data.handshakeData as HandshakeData,
      senderMessagingPeerId,
    };
  } catch (err) {
    console.error('[SecureMesh] Failed to process add request:', err);
    return null;
  }
}

/**
 * Create an add-accepted response.
 */
export async function createAddAccepted(
  localKeys: KeyBundle,
  localProfile: UserProfile,
  localMessagingPeerId: string,
  remotePublicKeys: PublicKeyBundle
): Promise<Record<string, unknown>> {
  const profileBlob = await createProfileBlob(localProfile, localKeys);
  const serializedPk = await serializePublicKeys(getPublicKeys(localKeys));
  const pkHash = await publicKeyHash(getPublicKeys(localKeys));

  const payload = {
    id: generateUUID(),
    type: 'add_accepted' as MessageType,
    respondentPublicKeys: serializedPk,
    respondentPkHash: toHex(pkHash),
    profileBlob,
    messagingPeerId: localMessagingPeerId,
    timestamp: Date.now(),
  };

  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const sigEd25519 = await ed25519Sign(localKeys.ed25519PrivateKey, payloadBytes);
  const sigMldsa87 = await mlDsaSign(localKeys.identitySigPrivateKey, payloadBytes);

  return {
    ...payload,
    sig_ed25519: toBase64Url(sigEd25519),
    sig_mldsa87: toBase64Url(sigMldsa87),
  };
}

/**
 * Create an add-declined response.
 */
export async function createAddDeclined(
  localKeys: KeyBundle
): Promise<Record<string, unknown>> {
  const pkHash = await publicKeyHash(getPublicKeys(localKeys));
  const payload = {
    id: generateUUID(),
    type: 'add_declined' as MessageType,
    respondentPkHash: toHex(pkHash),
    timestamp: Date.now(),
  };

  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const sigEd25519 = await ed25519Sign(localKeys.ed25519PrivateKey, payloadBytes);
  const sigMldsa87 = await mlDsaSign(localKeys.identitySigPrivateKey, payloadBytes);

  return {
    ...payload,
    sig_ed25519: toBase64Url(sigEd25519),
    sig_mldsa87: toBase64Url(sigMldsa87),
  };
}

/**
 * Encrypt a chat message using the Double Ratchet.
 */
export async function encryptChatMessage(
  content: string,
  ratchetState: RatchetState,
  senderPkHash: string,
  localKeys: KeyBundle,
  peerKemPublicKey?: Uint8Array
): Promise<{
  envelope: MessageEnvelope;
  newRatchetState: RatchetState;
}> {
  const plaintext = new TextEncoder().encode(content);

  const { state: newState, header, ciphertext, iv } = await ratchetEncrypt(
    ratchetState,
    plaintext,
    senderPkHash,
    peerKemPublicKey
  );

  // Combine ciphertext and IV for transport
  const combined = concatBytes(iv, ciphertext);

  // Sign header || ciphertext
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const toSign = concatBytes(headerBytes, combined);
  const sigEd25519 = await ed25519Sign(localKeys.ed25519PrivateKey, toSign);
  const sigMldsa87 = await mlDsaSign(localKeys.identitySigPrivateKey, toSign);

  const envelope: MessageEnvelope = {
    id: generateUUID(),
    type: 'chat',
    header,
    ciphertext: toBase64Url(combined),
    sigEd25519: toBase64Url(sigEd25519),
    sigMldsa87: toBase64Url(sigMldsa87),
    timestamp: Date.now(),
  };

  return { envelope, newRatchetState: newState };
}

/**
 * Decrypt a chat message using the Double Ratchet.
 */
export async function decryptChatMessage(
  envelope: MessageEnvelope,
  ratchetState: RatchetState,
  senderPublicKeys: PublicKeyBundle,
  localKemPrivateKey?: Uint8Array,
  localKemPublicKey?: Uint8Array
): Promise<{
  content: string;
  newRatchetState: RatchetState;
} | null> {
  // Verify signatures
  const combined = fromBase64Url(envelope.ciphertext);
  const headerBytes = new TextEncoder().encode(JSON.stringify(envelope.header));
  const toVerify = concatBytes(headerBytes, combined);

  const [ed25519Valid, mldsaValid] = await Promise.all([
    ed25519Verify(
      senderPublicKeys.ed25519PublicKey,
      fromBase64Url(envelope.sigEd25519),
      toVerify
    ),
    mlDsaVerify(
      senderPublicKeys.identitySigPublicKey,
      fromBase64Url(envelope.sigMldsa87),
      toVerify
    ),
  ]);

  if (!ed25519Valid || !mldsaValid) {
    console.warn('[SecureMesh] Message signature verification failed');
    return null;
  }

  // Extract IV and ciphertext
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const { state: newState, plaintext } = await ratchetDecrypt(
    ratchetState,
    envelope.header,
    ciphertext,
    iv,
    localKemPrivateKey,
    localKemPublicKey
  );

  const content = new TextDecoder().decode(plaintext);

  return { content, newRatchetState: newState };
}

/**
 * Create an ID update message.
 */
export async function createIdUpdateMessage(
  localKeys: KeyBundle,
  role: 'msg' | 'disc',
  newPid: string,
  nextPid: string,
  peerServer?: { host: string; port: number; path: string }
): Promise<Record<string, unknown>> {
  const payload: Record<string, unknown> = {
    type: 'id_update',
    role,
    new_pid: newPid,
    next_pid: nextPid,
    ts: Date.now(),
  };
  if (peerServer) payload.peer_server = peerServer;

  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const sigEd25519 = await ed25519Sign(localKeys.ed25519PrivateKey, payloadBytes);
  const sigMldsa87 = await mlDsaSign(localKeys.identitySigPrivateKey, payloadBytes);

  return {
    ...payload,
    sig_ed25519: toBase64Url(sigEd25519),
    sig_mldsa87: toBase64Url(sigMldsa87),
  };
}
