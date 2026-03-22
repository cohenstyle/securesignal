/**
 * Main application hook — handles initialization, key generation,
 * contact card detection from URL, and messaging manager lifecycle.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../storage/store';
import { MessagingManager } from '../messaging/manager';
import {
  generateKeyBundle,
  serializeKeyBundle,
  deserializeKeyBundle,
  getPublicKeys,
  publicKeyHash,
  createContactCard,
  encodeContactCard,
  decodeContactCard,
  parseCombinedPublicKeyBlob,
  serializePublicKeys,
} from '../crypto/keys';
import { toHex, fromBase64Url } from '../crypto/utils';
import { getIdentity, saveIdentity, getAllContacts, getMessagesByContact } from '../storage/db';
import type { Contact, ChatMessage } from '../types';

let managerInstance: MessagingManager | null = null;

export function getManager(): MessagingManager | null {
  return managerInstance;
}

export function useApp() {
  const store = useStore();
  const managerRef = useRef<MessagingManager | null>(null);

  const initializeApp = useCallback(async () => {
    if (store.initializing || store.initialized) return;
    store.setInitializing(true);

    try {
      // Check for existing identity
      let keyBundle = null;
      const storedBundle = await getIdentity('keyBundle');
      if (storedBundle) {
        keyBundle = await deserializeKeyBundle(storedBundle as Record<string, unknown>);
      }

      if (keyBundle) {
        store.setKeyBundle(keyBundle);

        // Load profile
        const profile = await getIdentity('profile');
        if (profile) {
          store.setProfile(profile as { displayName: string; photo?: string; status?: string; bio?: string });
        }

        // Load contacts
        const contacts = await getAllContacts();
        for (const c of contacts) {
          store.addContact(c as unknown as Contact);
        }

        // Load messages for each contact
        for (const c of contacts) {
          const msgs = await getMessagesByContact(c.id as string);
          if (msgs.length > 0) {
            store.setMessages(c.id as string, msgs as unknown as ChatMessage[]);
          }
        }

        // Initialize messaging manager
        const settings = store.settings;
        const manager = new MessagingManager(
          settings.peerServer
        );
        await manager.initialize(keyBundle);
        managerRef.current = manager;
        managerInstance = manager;

        store.setInitialized(true);
        store.setScreen('conversations');
      } else {
        // First run — show setup screen
        store.setScreen('first-run');
        store.setInitialized(false);
      }
    } catch (err) {
      console.error('[SecureMesh] Initialization error:', err);
    } finally {
      store.setInitializing(false);
    }
  }, []);

  const generateIdentity = useCallback(async (displayName: string, passphrase?: string) => {
    store.setInitializing(true);
    try {
      const keyBundle = await generateKeyBundle();
      store.setKeyBundle(keyBundle);

      // Save key bundle
      const serialized = await serializeKeyBundle(keyBundle);
      await saveIdentity('keyBundle', serialized);

      // Save profile
      const profile = { displayName };
      store.setProfile(profile);
      await saveIdentity('profile', profile);

      // Initialize messaging
      const manager = new MessagingManager(store.settings.peerServer);
      await manager.initialize(keyBundle);
      managerRef.current = manager;
      managerInstance = manager;

      store.setInitialized(true);
      store.setScreen('conversations');
    } catch (err) {
      console.error('[SecureMesh] Key generation error:', err);
    } finally {
      store.setInitializing(false);
    }
  }, []);

  const handleContactCardFromUrl = useCallback(async () => {
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(window.location.search);
    const cardParam = params.get('c');
    const encoded = hash || cardParam;

    if (!encoded || !store.initialized || !store.keyBundle) return null;

    try {
      const card = decodeContactCard(encoded);
      if (card.v !== 1 || !card.pk) return null;

      const blob = fromBase64Url(card.pk);
      const publicKeys = await parseCombinedPublicKeyBlob(blob);

      // Clear the URL fragment
      window.history.replaceState(null, '', window.location.pathname);

      return { card, publicKeys };
    } catch {
      return null;
    }
  }, [store.initialized, store.keyBundle]);

  const getOwnContactUrl = useCallback(async (): Promise<string> => {
    if (!store.keyBundle || !store.peerIds) return '';
    const pubKeys = getPublicKeys(store.keyBundle);
    const card = await createContactCard(
      pubKeys,
      store.peerIds.discoveryId,
      store.peerIds.nextDiscoveryId,
      store.settings.pushRelayUrl,
      store.settings.peerServer
    );
    const encoded = encodeContactCard(card);
    return `${window.location.origin}${window.location.pathname}#${encoded}`;
  }, [store.keyBundle, store.peerIds, store.settings]);

  const getOwnPkHash = useCallback(async (): Promise<string> => {
    if (!store.keyBundle) return '';
    const pubKeys = getPublicKeys(store.keyBundle);
    const hash = await publicKeyHash(pubKeys);
    return toHex(hash);
  }, [store.keyBundle]);

  useEffect(() => {
    initializeApp();
    return () => {
      managerRef.current?.destroy();
    };
  }, []);

  return {
    ...store,
    generateIdentity,
    handleContactCardFromUrl,
    getOwnContactUrl,
    getOwnPkHash,
    manager: managerRef.current,
  };
}
