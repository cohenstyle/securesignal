/**
 * Double Ratchet implementation with post-quantum injection.
 *
 * Each friendship maintains an independent ratchet state providing:
 * - Forward secrecy (past messages safe if current key compromised)
 * - Break-in recovery (future messages safe after compromise ends)
 * - Quantum resistance via periodic ML-KEM-1024 injection
 */

import type { RatchetState, MessageHeader } from '../types';
import {
  generateX25519KeyPair,
  x25519DH,
  kdfChainKey,
  kdfRootKey,
  aesEncrypt,
  aesDecrypt,
  hkdfSha512,
} from './classical';
import { mlKemEncapsulate, mlKemDecapsulate } from './pqc';
import { concatBytes, toBase64Url, fromBase64Url, toHex } from './utils';

const MAX_SKIPPED_KEYS = 1000;
const SKIPPED_KEY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DEFAULT_PQ_INJECTION_INTERVAL = 50;

/**
 * Initialize a ratchet state from a shared root secret (output of X3DH handshake).
 * The initiator (Alice) calls this; she sends first.
 */
export async function initRatchetAsInitiator(
  rootSecret: Uint8Array,
  remoteDhPublic: Uint8Array
): Promise<RatchetState> {
  const sendDhKeyPair = await generateX25519KeyPair();

  // Perform initial DH ratchet step
  const dhOut = await x25519DH(sendDhKeyPair.privateKey, remoteDhPublic);
  const { newRootKey, newChainKey: sendChainKey } = await kdfRootKey(rootSecret, dhOut);

  return {
    rootKey: newRootKey,
    sendChainKey,
    recvChainKey: new Uint8Array(32), // Will be set on first receive
    sendDhKeyPair,
    recvDhPublic: remoteDhPublic,
    sendIndex: 0,
    recvIndex: 0,
    prevSendCount: 0,
    skippedKeys: new Map(),
    messagesSinceLastPqInjection: 0,
    pqInjectionInterval: DEFAULT_PQ_INJECTION_INTERVAL,
  };
}

/**
 * Initialize a ratchet state as the responder (Bob).
 */
export async function initRatchetAsResponder(
  rootSecret: Uint8Array,
  localDhKeyPair: { publicKey: Uint8Array; privateKey: Uint8Array }
): Promise<RatchetState> {
  return {
    rootKey: rootSecret,
    sendChainKey: new Uint8Array(32),
    recvChainKey: new Uint8Array(32),
    sendDhKeyPair: localDhKeyPair,
    recvDhPublic: null,
    sendIndex: 0,
    recvIndex: 0,
    prevSendCount: 0,
    skippedKeys: new Map(),
    messagesSinceLastPqInjection: 0,
    pqInjectionInterval: DEFAULT_PQ_INJECTION_INTERVAL,
  };
}

/**
 * Encrypt a message using the Double Ratchet.
 * Returns the encrypted envelope components.
 */
export async function ratchetEncrypt(
  state: RatchetState,
  plaintext: Uint8Array,
  senderPkHash: string,
  peerKemPublicKey?: Uint8Array
): Promise<{
  state: RatchetState;
  header: MessageHeader;
  ciphertext: Uint8Array;
  iv: Uint8Array;
}> {
  let newState = { ...state, skippedKeys: new Map(state.skippedKeys) };
  let kemCiphertext: string | undefined;

  // Check if we need a PQ injection
  if (
    peerKemPublicKey &&
    newState.messagesSinceLastPqInjection >= newState.pqInjectionInterval
  ) {
    // Perform DH ratchet step with PQ injection
    const newDhPair = await generateX25519KeyPair();
    const dhOut = await x25519DH(newDhPair.privateKey, newState.recvDhPublic!);

    // ML-KEM encapsulation
    const { ciphertext: kemCt, sharedSecret: ssPq } =
      await mlKemEncapsulate(peerKemPublicKey);
    kemCiphertext = toBase64Url(kemCt);

    // Combine DH and PQ shared secrets
    const dhOutCombined = concatBytes(dhOut, ssPq);
    const { newRootKey, newChainKey } = await kdfRootKey(
      newState.rootKey,
      dhOutCombined
    );

    newState.rootKey = newRootKey;
    newState.sendChainKey = newChainKey;
    newState.prevSendCount = newState.sendIndex;
    newState.sendDhKeyPair = newDhPair;
    newState.sendIndex = 0;
    newState.messagesSinceLastPqInjection = 0;
  }

  // Derive message key from chain
  const { nextChainKey, messageKey } = await kdfChainKey(newState.sendChainKey);
  newState.sendChainKey = nextChainKey;

  // Build header
  const header: MessageHeader = {
    senderPkHash,
    ratchetDhPublic: toBase64Url(newState.sendDhKeyPair.publicKey),
    prevChainLen: newState.prevSendCount,
    msgIndex: newState.sendIndex,
    kemCiphertext,
  };

  // Encrypt with AES-256-GCM using message key
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const { ciphertext, iv } = await aesEncrypt(messageKey, plaintext, headerBytes);

  newState.sendIndex++;
  newState.messagesSinceLastPqInjection++;

  return { state: newState, header, ciphertext, iv };
}

/**
 * Decrypt a message using the Double Ratchet.
 */
export async function ratchetDecrypt(
  state: RatchetState,
  header: MessageHeader,
  ciphertext: Uint8Array,
  iv: Uint8Array,
  localKemPrivateKey?: Uint8Array,
  localKemPublicKey?: Uint8Array
): Promise<{
  state: RatchetState;
  plaintext: Uint8Array;
}> {
  let newState = { ...state, skippedKeys: new Map(state.skippedKeys) };

  // Check if we need to perform a DH ratchet step
  const peerDhPublic = header.ratchetDhPublic
    ? fromBase64Url(header.ratchetDhPublic)
    : null;

  if (
    peerDhPublic &&
    (!newState.recvDhPublic ||
      toBase64Url(newState.recvDhPublic) !== header.ratchetDhPublic)
  ) {
    // Skip any missed messages in current receiving chain
    await skipMessageKeys(newState, header.prevChainLen);

    // DH ratchet step
    newState.recvDhPublic = peerDhPublic;
    let dhOut = await x25519DH(newState.sendDhKeyPair.privateKey, peerDhPublic);

    // Check for PQ injection
    if (header.kemCiphertext && localKemPrivateKey && localKemPublicKey) {
      const kemCt = fromBase64Url(header.kemCiphertext);
      const ssPq = await mlKemDecapsulate(kemCt, localKemPrivateKey, localKemPublicKey);
      dhOut = concatBytes(dhOut, ssPq);
    }

    const { newRootKey, newChainKey: recvChainKey } = await kdfRootKey(
      newState.rootKey,
      dhOut
    );
    newState.rootKey = newRootKey;
    newState.recvChainKey = recvChainKey;
    newState.recvIndex = 0;

    // Generate new send DH pair
    const newSendDh = await generateX25519KeyPair();
    const dhOut2 = await x25519DH(newSendDh.privateKey, peerDhPublic);
    const { newRootKey: rk2, newChainKey: sendChainKey } = await kdfRootKey(
      newState.rootKey,
      dhOut2
    );
    newState.rootKey = rk2;
    newState.sendChainKey = sendChainKey;
    newState.prevSendCount = newState.sendIndex;
    newState.sendDhKeyPair = newSendDh;
    newState.sendIndex = 0;
  }

  // Check for out-of-order message in skipped keys
  const skippedKeyId = `${header.ratchetDhPublic},${header.msgIndex}`;
  if (newState.skippedKeys.has(skippedKeyId)) {
    const messageKey = newState.skippedKeys.get(skippedKeyId)!;
    newState.skippedKeys.delete(skippedKeyId);
    const headerBytes = new TextEncoder().encode(JSON.stringify(header));
    const plaintext = await aesDecrypt(messageKey, ciphertext, iv, headerBytes);
    return { state: newState, plaintext };
  }

  // Skip ahead to the correct index
  await skipMessageKeys(newState, header.msgIndex);

  // Derive message key
  const { nextChainKey, messageKey } = await kdfChainKey(newState.recvChainKey);
  newState.recvChainKey = nextChainKey;
  newState.recvIndex = header.msgIndex + 1;

  // Decrypt
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const plaintext = await aesDecrypt(messageKey, ciphertext, iv, headerBytes);

  return { state: newState, plaintext };
}

/**
 * Skip message keys for out-of-order delivery support.
 */
async function skipMessageKeys(
  state: RatchetState,
  untilIndex: number
): Promise<void> {
  while (state.recvIndex < untilIndex) {
    if (state.skippedKeys.size >= MAX_SKIPPED_KEYS) {
      // Drop oldest
      const firstKey = state.skippedKeys.keys().next().value;
      if (firstKey) state.skippedKeys.delete(firstKey);
    }
    const { nextChainKey, messageKey } = await kdfChainKey(state.recvChainKey);
    const keyId = `${state.recvDhPublic ? toBase64Url(state.recvDhPublic) : ''},${state.recvIndex}`;
    state.skippedKeys.set(keyId, messageKey);
    state.recvChainKey = nextChainKey;
    state.recvIndex++;
  }
}

/**
 * Purge expired skipped keys.
 */
export function purgeExpiredSkippedKeys(state: RatchetState): RatchetState {
  // Since we don't store timestamps per key in this implementation,
  // we limit by count only. A production impl would add timestamps.
  const newSkipped = new Map(state.skippedKeys);
  while (newSkipped.size > MAX_SKIPPED_KEYS) {
    const firstKey = newSkipped.keys().next().value;
    if (firstKey) newSkipped.delete(firstKey);
  }
  return { ...state, skippedKeys: newSkipped };
}

/**
 * Serialize ratchet state for storage.
 */
export function serializeRatchetState(state: RatchetState): object {
  const skipped: Record<string, string> = {};
  for (const [k, v] of state.skippedKeys) {
    skipped[k] = toBase64Url(v);
  }
  return {
    rootKey: toBase64Url(state.rootKey),
    sendChainKey: toBase64Url(state.sendChainKey),
    recvChainKey: toBase64Url(state.recvChainKey),
    sendDhPublic: toBase64Url(state.sendDhKeyPair.publicKey),
    sendDhPrivate: toBase64Url(state.sendDhKeyPair.privateKey),
    recvDhPublic: state.recvDhPublic ? toBase64Url(state.recvDhPublic) : null,
    sendIndex: state.sendIndex,
    recvIndex: state.recvIndex,
    prevSendCount: state.prevSendCount,
    skippedKeys: skipped,
    messagesSinceLastPqInjection: state.messagesSinceLastPqInjection,
    pqInjectionInterval: state.pqInjectionInterval,
  };
}

/**
 * Deserialize ratchet state from storage.
 */
export function deserializeRatchetState(data: Record<string, unknown>): RatchetState {
  const skippedRaw = (data.skippedKeys || {}) as Record<string, string>;
  const skipped = new Map<string, Uint8Array>();
  for (const [k, v] of Object.entries(skippedRaw)) {
    skipped.set(k, fromBase64Url(v));
  }
  return {
    rootKey: fromBase64Url(data.rootKey as string),
    sendChainKey: fromBase64Url(data.sendChainKey as string),
    recvChainKey: fromBase64Url(data.recvChainKey as string),
    sendDhKeyPair: {
      publicKey: fromBase64Url(data.sendDhPublic as string),
      privateKey: fromBase64Url(data.sendDhPrivate as string),
    },
    recvDhPublic: data.recvDhPublic
      ? fromBase64Url(data.recvDhPublic as string)
      : null,
    sendIndex: data.sendIndex as number,
    recvIndex: data.recvIndex as number,
    prevSendCount: data.prevSendCount as number,
    skippedKeys: skipped,
    messagesSinceLastPqInjection: data.messagesSinceLastPqInjection as number,
    pqInjectionInterval: data.pqInjectionInterval as number,
  };
}
