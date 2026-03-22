/**
 * PeerJS Connection Layer with dual-ID architecture.
 *
 * Every user maintains two PeerJS IDs:
 * - Discovery ID (smd-<uuid>): receives incoming add requests from strangers
 * - Messaging ID (smm-<uuid>): all conversation traffic with accepted friends
 */

import Peer, { DataConnection } from 'peerjs';
import type { PeerIdSet, ConnectionStatus } from '../types';
import { generateUUID, randomBytes, toBase64Url, toHex } from '../crypto/utils';
import { ed25519Sign, ed25519Verify } from '../crypto/classical';
import { mlDsaSign, mlDsaVerify } from '../crypto/pqc';

export interface PeerConfig {
  host?: string;
  port?: number;
  path?: string;
}

export type ConnectionEventHandler = (
  conn: DataConnection,
  peerId: string,
  role: 'discovery' | 'messaging'
) => void;

export type DataEventHandler = (
  data: unknown,
  conn: DataConnection,
  peerId: string,
  role: 'discovery' | 'messaging'
) => void;

/**
 * Manages the dual PeerJS ID architecture.
 */
export class PeerConnectionManager {
  private discoveryPeer: Peer | null = null;
  private messagingPeer: Peer | null = null;
  private discoveryId: string = '';
  private messagingId: string = '';
  private nextDiscoveryId: string = '';
  private nextMessagingId: string = '';
  private config: PeerConfig;
  private connections: Map<string, DataConnection> = new Map();
  private onConnection: ConnectionEventHandler | null = null;
  private onData: DataEventHandler | null = null;
  private onPeerError: ((error: Error, role: string) => void) | null = null;

  constructor(config?: PeerConfig) {
    this.config = config || {};
  }

  /**
   * Initialize both Discovery and Messaging peers.
   */
  async initialize(
    existingDiscoveryId?: string,
    existingMessagingId?: string
  ): Promise<PeerIdSet> {
    this.discoveryId = existingDiscoveryId || `smd-${generateUUID()}`;
    this.messagingId = existingMessagingId || `smm-${generateUUID()}`;
    this.nextDiscoveryId = `smd-${generateUUID()}`;
    this.nextMessagingId = `smm-${generateUUID()}`;

    await Promise.all([
      this.createPeer('discovery', this.discoveryId),
      this.createPeer('messaging', this.messagingId),
    ]);

    return {
      discoveryId: this.discoveryId,
      messagingId: this.messagingId,
      nextDiscoveryId: this.nextDiscoveryId,
      nextMessagingId: this.nextMessagingId,
    };
  }

  private getPeerOptions(id: string): object {
    const opts: Record<string, unknown> = {};
    if (this.config.host) {
      opts.host = this.config.host;
      opts.port = this.config.port || 9000;
      opts.path = this.config.path || '/';
      opts.secure = true;
    }
    return opts;
  }

  private createPeer(
    role: 'discovery' | 'messaging',
    id: string
  ): Promise<Peer> {
    return new Promise((resolve, reject) => {
      const peer = new Peer(id, this.getPeerOptions(id));

      peer.on('open', () => {
        if (role === 'discovery') {
          this.discoveryPeer = peer;
        } else {
          this.messagingPeer = peer;
        }
        resolve(peer);
      });

      peer.on('connection', (conn) => {
        this.handleIncomingConnection(conn, role);
      });

      peer.on('error', (err) => {
        const error = err as Error & { type?: string };
        // ID taken = potential hijack
        if (error.type === 'unavailable-id') {
          this.onPeerError?.(error, role);
          this.handleIdTakeover(role);
          reject(error);
          return;
        }
        this.onPeerError?.(error, role);
        reject(error);
      });

      peer.on('disconnected', () => {
        // Auto-reconnect
        if (!peer.destroyed) {
          peer.reconnect();
        }
      });
    });
  }

  private handleIncomingConnection(
    conn: DataConnection,
    role: 'discovery' | 'messaging'
  ): void {
    conn.on('open', () => {
      this.connections.set(conn.peer, conn);
      this.onConnection?.(conn, conn.peer, role);

      conn.on('data', (data) => {
        this.onData?.(data, conn, conn.peer, role);
      });

      conn.on('close', () => {
        this.connections.delete(conn.peer);
      });
    });
  }

  /**
   * Connect to a peer by their PeerJS ID.
   */
  connectToPeer(
    peerId: string,
    role: 'discovery' | 'messaging' = 'messaging'
  ): Promise<DataConnection> {
    return new Promise((resolve, reject) => {
      const peer = role === 'discovery' ? this.discoveryPeer : this.messagingPeer;
      if (!peer) {
        reject(new Error(`${role} peer not initialized`));
        return;
      }

      const conn = peer.connect(peerId, { reliable: true });

      conn.on('open', () => {
        this.connections.set(peerId, conn);

        conn.on('data', (data) => {
          this.onData?.(data, conn, peerId, role);
        });

        conn.on('close', () => {
          this.connections.delete(peerId);
        });

        resolve(conn);
      });

      conn.on('error', (err) => {
        reject(err);
      });

      // Timeout after 10 seconds
      setTimeout(() => reject(new Error('Connection timeout')), 10000);
    });
  }

  /**
   * Send data to a connected peer.
   */
  sendToPeer(peerId: string, data: unknown): boolean {
    const conn = this.connections.get(peerId);
    if (!conn || !conn.open) return false;
    conn.send(data);
    return true;
  }

  /**
   * Check if a peer is connected.
   */
  isConnected(peerId: string): boolean {
    const conn = this.connections.get(peerId);
    return !!conn && conn.open;
  }

  /**
   * Generate a challenge nonce for connection authentication.
   */
  generateChallenge(): Uint8Array {
    return randomBytes(32);
  }

  /**
   * Handle ID takeover detection — triggers binary split protocol.
   */
  private async handleIdTakeover(role: 'discovery' | 'messaging'): Promise<void> {
    // Generate two new IDs for the binary split
    const idA = role === 'discovery' ? `smd-${generateUUID()}` : `smm-${generateUUID()}`;
    const idB = role === 'discovery' ? `smd-${generateUUID()}` : `smm-${generateUUID()}`;

    console.warn(
      `[SecureMesh] ID takeover detected on ${role}. Splitting to ${idA} and ${idB}`
    );

    // Try to register the new IDs
    try {
      if (role === 'discovery') {
        this.discoveryId = idA;
        await this.createPeer('discovery', idA);
      } else {
        this.messagingId = idA;
        await this.createPeer('messaging', idA);
      }
    } catch {
      // If this also fails, try the second ID
      try {
        if (role === 'discovery') {
          this.discoveryId = idB;
          await this.createPeer('discovery', idB);
        } else {
          this.messagingId = idB;
          await this.createPeer('messaging', idB);
        }
      } catch {
        console.error(`[SecureMesh] Binary split failed for ${role}. Both IDs taken.`);
      }
    }
  }

  /**
   * Rotate the Discovery ID.
   */
  async rotateDiscoveryId(): Promise<string> {
    const newId = this.nextDiscoveryId;
    this.nextDiscoveryId = `smd-${generateUUID()}`;

    if (this.discoveryPeer) {
      this.discoveryPeer.destroy();
    }

    this.discoveryId = newId;
    await this.createPeer('discovery', newId);
    return newId;
  }

  /**
   * Rotate the Messaging ID.
   */
  async rotateMessagingId(): Promise<string> {
    const newId = this.nextMessagingId;
    this.nextMessagingId = `smm-${generateUUID()}`;

    if (this.messagingPeer) {
      this.messagingPeer.destroy();
    }

    this.messagingId = newId;
    await this.createPeer('messaging', newId);
    return newId;
  }

  getDiscoveryId(): string {
    return this.discoveryId;
  }

  getMessagingId(): string {
    return this.messagingId;
  }

  getNextDiscoveryId(): string {
    return this.nextDiscoveryId;
  }

  getNextMessagingId(): string {
    return this.nextMessagingId;
  }

  getPeerIds(): PeerIdSet {
    return {
      discoveryId: this.discoveryId,
      messagingId: this.messagingId,
      nextDiscoveryId: this.nextDiscoveryId,
      nextMessagingId: this.nextMessagingId,
    };
  }

  setOnConnection(handler: ConnectionEventHandler): void {
    this.onConnection = handler;
  }

  setOnData(handler: DataEventHandler): void {
    this.onData = handler;
  }

  setOnPeerError(handler: (error: Error, role: string) => void): void {
    this.onPeerError = handler;
  }

  /**
   * Get all active connections.
   */
  getConnections(): Map<string, DataConnection> {
    return new Map(this.connections);
  }

  /**
   * Close a specific connection.
   */
  closeConnection(peerId: string): void {
    const conn = this.connections.get(peerId);
    if (conn) {
      conn.close();
      this.connections.delete(peerId);
    }
  }

  /**
   * Destroy all peers and connections.
   */
  destroy(): void {
    for (const conn of this.connections.values()) {
      conn.close();
    }
    this.connections.clear();
    this.discoveryPeer?.destroy();
    this.messagingPeer?.destroy();
    this.discoveryPeer = null;
    this.messagingPeer = null;
  }
}
