/**
 * Messaging Manager — orchestrates PeerJS connections, crypto, and storage.
 */

import type { DataConnection } from 'peerjs';
import type {
  KeyBundle,
  Contact,
  ChatMessage,
  MessageEnvelope,
  UserProfile,
  PublicKeyBundle,
  RatchetState,
} from '../types';
import { PeerConnectionManager } from '../peer/connection';
import {
  createAddRequest,
  processAddRequest,
  createAddAccepted,
  createAddDeclined,
  encryptChatMessage,
  decryptChatMessage,
  createIdUpdateMessage,
  createProfileBlob,
} from './protocol';
import { initiateHandshake, completeHandshake } from '../crypto/handshake';
import {
  initRatchetAsInitiator,
  initRatchetAsResponder,
  serializeRatchetState,
  deserializeRatchetState,
} from '../crypto/ratchet';
import { generateX25519KeyPair } from '../crypto/classical';
import {
  deserializePublicKeys,
  serializePublicKeys,
  publicKeyHash,
  getPublicKeys,
} from '../crypto/keys';
import { toHex, generateUUID } from '../crypto/utils';
import {
  saveContact,
  saveMessage,
  addToOutbox,
  getOutboxByContact,
  removeFromOutbox,
  saveIdentity,
} from '../storage/db';
import { useStore } from '../storage/store';

export class MessagingManager {
  private peerManager: PeerConnectionManager;
  private keyBundle: KeyBundle | null = null;
  private retryTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor(peerConfig?: { host?: string; port?: number; path?: string }) {
    this.peerManager = new PeerConnectionManager(peerConfig);
  }

  /**
   * Initialize the messaging manager with a key bundle.
   */
  async initialize(keyBundle: KeyBundle): Promise<void> {
    this.keyBundle = keyBundle;

    // Set up PeerJS event handlers
    this.peerManager.setOnData((data, conn, peerId, role) => {
      this.handleIncomingData(data as Record<string, unknown>, conn, peerId, role);
    });

    this.peerManager.setOnConnection((conn, peerId, role) => {
      this.handleNewConnection(conn, peerId, role);
    });

    this.peerManager.setOnPeerError((error, role) => {
      this.handlePeerError(error, role);
    });

    // Initialize peers
    const peerIds = await this.peerManager.initialize();
    useStore.getState().setPeerIds(peerIds);
    useStore.getState().setOnline(true);

    // Save peer IDs
    await saveIdentity('peerIds', peerIds);
  }

  /**
   * Send an add request to a contact.
   */
  async sendAddRequest(
    remotePublicKeys: PublicKeyBundle,
    remoteDiscoveryPeerId: string
  ): Promise<Contact | null> {
    if (!this.keyBundle) throw new Error('Not initialized');

    const store = useStore.getState();
    const pkHash = toHex(await publicKeyHash(remotePublicKeys));

    // Check if already a contact
    if (store.contacts.find((c) => c.id === pkHash)) {
      console.warn('[SecureMesh] Contact already exists');
      return null;
    }

    try {
      // Connect to their discovery ID
      const conn = await this.peerManager.connectToPeer(
        remoteDiscoveryPeerId,
        'discovery'
      );

      // Create add request
      const { envelope, rootSecret, ephemeralDhPublic } = await createAddRequest(
        this.keyBundle,
        store.profile,
        remotePublicKeys,
        this.peerManager.getMessagingId()
      );

      // Send the add request
      conn.send(envelope);

      // Initialize ratchet as initiator
      const ratchetState = await initRatchetAsInitiator(
        rootSecret,
        remotePublicKeys.x25519PublicKey
      );

      // Create local contact record
      const serializedPk = await serializePublicKeys(remotePublicKeys);

      const contact: Contact = {
        id: pkHash,
        publicKeys: serializedPk,
        profile: { displayName: 'Unknown' },
        discoveryPeerId: remoteDiscoveryPeerId,
        ratchetState,
        addedAt: Date.now(),
        status: 'pending_outgoing',
      };

      store.addContact(contact);
      await saveContact(contact as unknown as Record<string, unknown>);

      return contact;
    } catch (err) {
      console.error('[SecureMesh] Failed to send add request:', err);
      return null;
    }
  }

  /**
   * Accept an incoming add request.
   */
  async acceptAddRequest(contactId: string): Promise<boolean> {
    if (!this.keyBundle) throw new Error('Not initialized');

    const store = useStore.getState();
    const contact = store.contacts.find((c) => c.id === contactId);
    if (!contact || contact.status !== 'pending_incoming') return false;

    try {
      const remotePublicKeys = await deserializePublicKeys(contact.publicKeys);

      // Create acceptance message
      const accepted = await createAddAccepted(
        this.keyBundle,
        store.profile,
        this.peerManager.getMessagingId(),
        remotePublicKeys
      );

      // Send via their messaging peer ID
      if (contact.messagingPeerId) {
        const conn = await this.peerManager.connectToPeer(
          contact.messagingPeerId,
          'messaging'
        );
        conn.send(accepted);
      }

      // Update contact status
      store.updateContact(contactId, { status: 'accepted' });
      await saveContact({
        ...contact,
        status: 'accepted',
      } as unknown as Record<string, unknown>);

      return true;
    } catch (err) {
      console.error('[SecureMesh] Failed to accept add request:', err);
      return false;
    }
  }

  /**
   * Decline an incoming add request.
   */
  async declineAddRequest(contactId: string): Promise<boolean> {
    if (!this.keyBundle) throw new Error('Not initialized');

    const store = useStore.getState();
    const contact = store.contacts.find((c) => c.id === contactId);
    if (!contact || contact.status !== 'pending_incoming') return false;

    try {
      const declined = await createAddDeclined(this.keyBundle);

      if (contact.discoveryPeerId) {
        try {
          const conn = await this.peerManager.connectToPeer(
            contact.discoveryPeerId,
            'discovery'
          );
          conn.send(declined);
        } catch {
          // Best effort
        }
      }

      store.updateContact(contactId, { status: 'declined' });
      return true;
    } catch (err) {
      console.error('[SecureMesh] Failed to decline add request:', err);
      return false;
    }
  }

  /**
   * Send a chat message to a contact.
   */
  async sendMessage(contactId: string, content: string): Promise<ChatMessage | null> {
    if (!this.keyBundle) throw new Error('Not initialized');

    const store = useStore.getState();
    const contact = store.contacts.find((c) => c.id === contactId);
    if (!contact || contact.status !== 'accepted' || !contact.ratchetState) {
      return null;
    }

    const localPkHash = toHex(
      await publicKeyHash(getPublicKeys(this.keyBundle))
    );

    const remotePublicKeys = await deserializePublicKeys(contact.publicKeys);

    // Encrypt message
    const { envelope, newRatchetState } = await encryptChatMessage(
      content,
      contact.ratchetState,
      localPkHash,
      this.keyBundle,
      remotePublicKeys.identityKemPublicKey
    );

    // Create local message record
    const chatMessage: ChatMessage = {
      id: envelope.id,
      contactId,
      content,
      timestamp: envelope.timestamp,
      direction: 'sent',
      status: 'sending',
    };

    store.addMessage(contactId, chatMessage);
    store.updateContact(contactId, { ratchetState: newRatchetState });

    // Try to send directly
    let sent = false;
    if (contact.messagingPeerId) {
      sent = this.peerManager.sendToPeer(contact.messagingPeerId, envelope);

      if (!sent) {
        // Try connecting first
        try {
          await this.peerManager.connectToPeer(
            contact.messagingPeerId,
            'messaging'
          );
          sent = this.peerManager.sendToPeer(contact.messagingPeerId, envelope);
        } catch {
          // Peer offline
        }
      }
    }

    if (sent) {
      store.updateMessage(contactId, chatMessage.id, { status: 'sent' });
      await saveMessage(chatMessage as unknown as Record<string, unknown>);
    } else {
      // Queue for offline delivery
      store.updateMessage(contactId, chatMessage.id, { status: 'sending' });
      await addToOutbox({
        id: generateUUID(),
        contactId,
        envelope,
        chatMessageId: chatMessage.id,
        timestamp: Date.now(),
      });
      await saveMessage(chatMessage as unknown as Record<string, unknown>);

      // Try push relay if configured
      this.tryPushRelay(contactId, envelope);
    }

    return chatMessage;
  }

  /**
   * Handle incoming data from a peer connection.
   */
  private async handleIncomingData(
    data: Record<string, unknown>,
    conn: DataConnection,
    peerId: string,
    role: 'discovery' | 'messaging'
  ): Promise<void> {
    const type = data.type as string;

    switch (type) {
      case 'add_request':
        await this.handleAddRequest(data, conn, peerId);
        break;
      case 'add_accepted':
        await this.handleAddAccepted(data, peerId);
        break;
      case 'add_declined':
        await this.handleAddDeclined(data, peerId);
        break;
      case 'chat':
        await this.handleChatMessage(data as unknown as MessageEnvelope, peerId);
        break;
      case 'id_update':
        await this.handleIdUpdate(data, peerId);
        break;
      case 'profile_update':
        await this.handleProfileUpdate(data, peerId);
        break;
      case 'read_receipt':
        this.handleReadReceipt(data, peerId);
        break;
      case 'ack':
        this.handleAck(data, peerId);
        break;
      default:
        console.warn(`[SecureMesh] Unknown message type: ${type}`);
    }
  }

  private async handleAddRequest(
    data: Record<string, unknown>,
    conn: DataConnection,
    peerId: string
  ): Promise<void> {
    if (!this.keyBundle) return;

    const result = await processAddRequest(data, this.keyBundle);
    if (!result) return;

    const { senderPublicKeys, senderPkHash, profile, handshakeData, senderMessagingPeerId } = result;

    // Complete the handshake
    const { rootSecret } = await completeHandshake(
      this.keyBundle,
      senderPublicKeys,
      handshakeData
    );

    // Initialize ratchet as responder
    const dhPair = await generateX25519KeyPair();
    const ratchetState = await initRatchetAsResponder(rootSecret, dhPair);

    const serializedPk = await serializePublicKeys(senderPublicKeys);

    // Create contact
    const contact: Contact = {
      id: senderPkHash,
      publicKeys: serializedPk,
      profile,
      messagingPeerId: senderMessagingPeerId,
      discoveryPeerId: peerId,
      ratchetState,
      addedAt: Date.now(),
      status: 'pending_incoming',
    };

    const store = useStore.getState();
    store.addContact(contact);
    await saveContact(contact as unknown as Record<string, unknown>);
  }

  private async handleAddAccepted(
    data: Record<string, unknown>,
    peerId: string
  ): Promise<void> {
    const respondentPkHash = data.respondentPkHash as string;
    const store = useStore.getState();
    const contact = store.contacts.find((c) => c.id === respondentPkHash);
    if (!contact) return;

    const profileBlob = data.profileBlob as { display_name: string; photo?: string; status?: string; bio?: string };
    const messagingPeerId = data.messagingPeerId as string;

    store.updateContact(respondentPkHash, {
      status: 'accepted',
      messagingPeerId,
      profile: {
        displayName: profileBlob.display_name,
        photo: profileBlob.photo,
        status: profileBlob.status,
        bio: profileBlob.bio,
      },
    });
  }

  private async handleAddDeclined(
    data: Record<string, unknown>,
    peerId: string
  ): Promise<void> {
    const respondentPkHash = data.respondentPkHash as string;
    const store = useStore.getState();
    store.updateContact(respondentPkHash, { status: 'declined' });
  }

  private async handleChatMessage(
    envelope: MessageEnvelope,
    peerId: string
  ): Promise<void> {
    if (!this.keyBundle) return;

    const store = useStore.getState();
    const senderPkHash = envelope.header.senderPkHash;
    const contact = store.contacts.find((c) => c.id === senderPkHash);
    if (!contact || !contact.ratchetState) return;

    const senderPublicKeys = await deserializePublicKeys(contact.publicKeys);

    const result = await decryptChatMessage(
      envelope,
      contact.ratchetState,
      senderPublicKeys,
      this.keyBundle.identityKemPrivateKey,
      this.keyBundle.identityKemPublicKey
    );

    if (!result) return;

    const chatMessage: ChatMessage = {
      id: envelope.id,
      contactId: contact.id,
      content: result.content,
      timestamp: envelope.timestamp,
      direction: 'received',
      status: 'delivered',
    };

    store.addMessage(contact.id, chatMessage);
    store.updateContact(contact.id, {
      ratchetState: result.newRatchetState,
      lastSeen: Date.now(),
    });

    await saveMessage(chatMessage as unknown as Record<string, unknown>);

    // Send ACK
    this.peerManager.sendToPeer(peerId, {
      type: 'ack',
      messageId: envelope.id,
      timestamp: Date.now(),
    });
  }

  private async handleIdUpdate(
    data: Record<string, unknown>,
    peerId: string
  ): Promise<void> {
    const store = useStore.getState();
    // Find contact by their current peer ID
    const contact = store.contacts.find(
      (c) => c.messagingPeerId === peerId || c.discoveryPeerId === peerId
    );
    if (!contact) return;

    const role = data.role as string;
    const newPid = data.new_pid as string;

    if (role === 'msg') {
      store.updateContact(contact.id, { messagingPeerId: newPid });
    } else if (role === 'disc') {
      store.updateContact(contact.id, { discoveryPeerId: newPid });
    }
  }

  private async handleProfileUpdate(
    data: Record<string, unknown>,
    peerId: string
  ): Promise<void> {
    const store = useStore.getState();
    const contact = store.contacts.find(
      (c) => c.messagingPeerId === peerId
    );
    if (!contact) return;

    const profileBlob = data.profileBlob as {
      display_name: string;
      photo?: string;
      status?: string;
      bio?: string;
    };
    store.updateContact(contact.id, {
      profile: {
        displayName: profileBlob.display_name,
        photo: profileBlob.photo,
        status: profileBlob.status,
        bio: profileBlob.bio,
      },
    });
  }

  private handleReadReceipt(
    data: Record<string, unknown>,
    peerId: string
  ): void {
    const store = useStore.getState();
    const messageId = data.messageId as string;
    const contact = store.contacts.find(
      (c) => c.messagingPeerId === peerId
    );
    if (!contact) return;

    store.updateMessage(contact.id, messageId, { status: 'read' });
  }

  private handleAck(data: Record<string, unknown>, peerId: string): void {
    const store = useStore.getState();
    const messageId = data.messageId as string;
    const contact = store.contacts.find(
      (c) => c.messagingPeerId === peerId
    );
    if (!contact) return;

    store.updateMessage(contact.id, messageId, { status: 'delivered' });
  }

  private handleNewConnection(
    conn: DataConnection,
    peerId: string,
    role: 'discovery' | 'messaging'
  ): void {
    const store = useStore.getState();

    // Check if it's a misrouted friend connecting to discovery
    if (role === 'discovery') {
      const contact = store.contacts.find(
        (c) => c.messagingPeerId === peerId && c.status === 'accepted'
      );
      if (contact) {
        // Redirect them to messaging ID
        conn.send({
          type: 'id_update',
          role: 'msg',
          new_pid: this.peerManager.getMessagingId(),
          next_pid: this.peerManager.getNextMessagingId(),
          ts: Date.now(),
        });
      }
    }

    // Update connection status
    const contact = store.contacts.find(
      (c) => c.messagingPeerId === peerId || c.discoveryPeerId === peerId
    );
    if (contact) {
      store.setConnectionStatus(contact.id, 'online');

      // Flush any queued messages
      this.flushOutbox(contact.id);
    }
  }

  private handlePeerError(error: Error, role: string): void {
    const errorWithType = error as Error & { type?: string };
    if (errorWithType.type === 'unavailable-id') {
      const store = useStore.getState();
      store.addAlert({
        id: generateUUID(),
        type: 'hijack_detected',
        affectedContacts: [],
        timestamp: Date.now(),
        message: `PeerJS ID takeover detected on ${role} channel. Binary split protocol activated.`,
        acknowledged: false,
      });
    }
  }

  /**
   * Flush queued messages for a contact that has come online.
   */
  private async flushOutbox(contactId: string): Promise<void> {
    const outboxItems = await getOutboxByContact(contactId);
    const store = useStore.getState();
    const contact = store.contacts.find((c) => c.id === contactId);
    if (!contact?.messagingPeerId) return;

    for (const item of outboxItems) {
      const envelope = item.envelope as Record<string, unknown>;
      const sent = this.peerManager.sendToPeer(contact.messagingPeerId, envelope);
      if (sent) {
        await removeFromOutbox(item.id as string);
        store.updateMessage(contactId, item.chatMessageId as string, {
          status: 'sent',
        });
      }
    }
  }

  /**
   * Try to send via push relay for offline delivery.
   */
  private async tryPushRelay(
    contactId: string,
    envelope: MessageEnvelope
  ): Promise<void> {
    const store = useStore.getState();
    const contact = store.contacts.find((c) => c.id === contactId);
    const pushUrl = store.settings.pushRelayUrl;

    if (!contact || !pushUrl) return;

    try {
      const localPkHash = toHex(
        await publicKeyHash(getPublicKeys(this.keyBundle!))
      );
      await fetch(`${pushUrl}/deliver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: contact.id,
          from: localPkHash,
          payload: btoa(JSON.stringify(envelope)),
          buffer: true,
        }),
      });
    } catch (err) {
      console.warn('[SecureMesh] Push relay delivery failed:', err);
    }
  }

  /**
   * Rotate IDs and notify contacts.
   */
  async rotateMessagingId(): Promise<void> {
    if (!this.keyBundle) return;

    const store = useStore.getState();
    const oldId = this.peerManager.getMessagingId();
    const newId = await this.peerManager.rotateMessagingId();

    // Notify all accepted friends
    const idUpdate = await createIdUpdateMessage(
      this.keyBundle,
      'msg',
      newId,
      this.peerManager.getNextMessagingId()
    );

    for (const contact of store.contacts.filter((c) => c.status === 'accepted')) {
      if (contact.messagingPeerId) {
        this.peerManager.sendToPeer(contact.messagingPeerId, idUpdate);
      }
    }

    store.setPeerIds(this.peerManager.getPeerIds());
    await saveIdentity('peerIds', this.peerManager.getPeerIds());
  }

  async rotateDiscoveryId(): Promise<void> {
    if (!this.keyBundle) return;

    await this.peerManager.rotateDiscoveryId();
    useStore.getState().setPeerIds(this.peerManager.getPeerIds());
    await saveIdentity('peerIds', this.peerManager.getPeerIds());
  }

  /**
   * Send a read receipt.
   */
  sendReadReceipt(contactId: string, messageId: string): void {
    const store = useStore.getState();
    const contact = store.contacts.find((c) => c.id === contactId);
    if (!contact?.messagingPeerId) return;

    this.peerManager.sendToPeer(contact.messagingPeerId, {
      type: 'read_receipt',
      messageId,
      timestamp: Date.now(),
    });
  }

  /**
   * Send typing indicator.
   */
  sendTypingIndicator(contactId: string): void {
    const store = useStore.getState();
    const contact = store.contacts.find((c) => c.id === contactId);
    if (!contact?.messagingPeerId) return;

    this.peerManager.sendToPeer(contact.messagingPeerId, {
      type: 'typing',
      timestamp: Date.now(),
    });
  }

  getPeerManager(): PeerConnectionManager {
    return this.peerManager;
  }

  destroy(): void {
    for (const timer of this.retryTimers.values()) {
      clearTimeout(timer);
    }
    this.retryTimers.clear();
    this.peerManager.destroy();
  }
}
