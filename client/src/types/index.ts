// === Cryptographic Types ===

export interface KeyBundle {
  identityKemPublicKey: Uint8Array;   // ML-KEM-1024
  identityKemPrivateKey: Uint8Array;  // ML-KEM-1024
  identitySigPublicKey: Uint8Array;   // ML-DSA-87
  identitySigPrivateKey: Uint8Array;  // ML-DSA-87
  x25519PublicKey: Uint8Array;
  x25519PrivateKey: Uint8Array;
  ed25519PublicKey: CryptoKey;
  ed25519PrivateKey: CryptoKey;
  createdAt: number;
}

export interface PublicKeyBundle {
  identityKemPublicKey: Uint8Array;
  identitySigPublicKey: Uint8Array;
  x25519PublicKey: Uint8Array;
  ed25519PublicKey: CryptoKey;
}

export interface SerializedPublicKeys {
  kem: string;    // base64url
  sig: string;    // base64url
  x25519: string; // base64url
  ed25519: string; // base64url (exported as raw)
}

// === Ratchet Types ===

export interface RatchetState {
  rootKey: Uint8Array;           // 64 bytes
  sendChainKey: Uint8Array;     // 32 bytes
  recvChainKey: Uint8Array;     // 32 bytes
  sendDhKeyPair: {
    publicKey: Uint8Array;
    privateKey: Uint8Array;
  };
  recvDhPublic: Uint8Array | null;
  sendIndex: number;
  recvIndex: number;
  prevSendCount: number;
  skippedKeys: Map<string, Uint8Array>; // "(dhPubHex,index)" -> messageKey
  messagesSinceLastPqInjection: number;
  pqInjectionInterval: number;  // default 50
}

// === Contact / Identity Types ===

export interface ContactCard {
  v: number;
  pk: string;           // base64url combined public key blob
  disc_pid?: string;    // Discovery PeerJS ID
  next_disc_pid?: string;
  ps?: string;          // push server URL
  peer_server?: {
    host: string;
    port: number;
    path: string;
  };
}

export interface UserProfile {
  displayName: string;
  photo?: string;       // base64 JPEG
  status?: string;
  bio?: string;
}

export interface ProfileBlob {
  v: number;
  display_name: string;
  photo?: string;
  status?: string;
  bio?: string;
  ts: number;
  sig_ed25519: string;
  sig_mldsa87: string;
}

export interface Contact {
  id: string;             // SHA-256 hash of combined public key
  publicKeys: SerializedPublicKeys;
  profile: UserProfile;
  messagingPeerId?: string;
  discoveryPeerId?: string;
  ratchetState?: RatchetState;
  addedAt: number;
  lastSeen?: number;
  status: 'pending_outgoing' | 'pending_incoming' | 'accepted' | 'declined';
  deviceKeys?: string[];  // additional device public key hashes
}

// === Message Types ===

export type MessageType =
  | 'add_request'
  | 'add_accepted'
  | 'add_declined'
  | 'chat'
  | 'id_update'
  | 'profile_update'
  | 'device_sync'
  | 'read_receipt'
  | 'typing'
  | 'key_update'
  | 'ack';

export interface MessageHeader {
  senderPkHash: string;
  ratchetDhPublic?: string;    // base64url
  prevChainLen: number;
  msgIndex: number;
  kemCiphertext?: string;       // base64url - for PQ ratchet injection
}

export interface MessageEnvelope {
  id: string;
  type: MessageType;
  header: MessageHeader;
  ciphertext: string;           // base64url AES-256-GCM ciphertext
  sigEd25519: string;
  sigMldsa87: string;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  contactId: string;
  content: string;
  timestamp: number;
  direction: 'sent' | 'received';
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
}

// === PeerJS Types ===

export interface PeerIdSet {
  discoveryId: string;     // smd-<uuid>
  messagingId: string;     // smm-<uuid>
  nextDiscoveryId?: string;
  nextMessagingId?: string;
}

export type ConnectionStatus = 'online' | 'registered' | 'offline' | 'hijack_detected';

// === ID Update Types ===

export interface IdUpdateMessage {
  type: 'id_update';
  role: 'msg' | 'disc';
  new_pid: string;
  next_pid: string;
  peer_server?: {
    host: string;
    port: number;
    path: string;
  };
  ts: number;
  sig_ed25519: string;
  sig_mldsa87: string;
}

// === Device Types ===

export interface DeviceInfo {
  id: string;              // device public key hash
  publicKeys: SerializedPublicKeys;
  name: string;
  addedAt: number;
  lastSeen: number;
  isCurrentDevice: boolean;
}

// === Settings Types ===

export interface AppSettings {
  peerServer?: {
    host: string;
    port: number;
    path: string;
  };
  pushRelayUrl?: string;
  passphrase?: string;
  discoveryRotationDays: number;   // default 7
  messagingRotationHours: number;  // default 24
  pqInjectionInterval: number;     // default 50 messages
  maxSkippedKeys: number;          // default 1000
  skippedKeyMaxAgeDays: number;    // default 7
}

// === Security Alert Types ===

export interface SecurityAlert {
  id: string;
  type: 'hijack_detected' | 'targeted_attack';
  affectedContacts: string[];
  timestamp: number;
  message: string;
  acknowledged: boolean;
}
