/**
 * SecureMesh — Main Application Component
 */

import { useState, useEffect, useCallback } from 'react';
import { useApp, getManager } from './hooks/useApp';
import { FirstRun } from './screens/FirstRun';
import { ConversationsList } from './screens/ConversationsList';
import { ChatView } from './screens/ChatView';
import { AddContact } from './screens/AddContact';
import { ContactDetail } from './screens/ContactDetail';
import { MyIdentity } from './screens/MyIdentity';
import { Settings } from './screens/Settings';
import { Devices } from './screens/Devices';
import { SecurityAlerts } from './screens/SecurityAlerts';
import { decodeContactCard, parseCombinedPublicKeyBlob } from './crypto/keys';
import { fromBase64Url, generateSafetyNumber } from './crypto/utils';
import { saveSetting, saveIdentity } from './storage/db';
import type { ConnectionStatus } from './types';

export default function App() {
  const app = useApp();
  const [ownContactUrl, setOwnContactUrl] = useState('');
  const [ownPkHash, setOwnPkHash] = useState('');
  const [ownSafetyNumber, setOwnSafetyNumber] = useState('');

  // Derive own contact URL and identity info
  useEffect(() => {
    if (app.initialized && app.keyBundle) {
      app.getOwnContactUrl().then(setOwnContactUrl);
      app.getOwnPkHash().then((hash) => {
        setOwnPkHash(hash);
        try {
          const bytes = new Uint8Array(
            hash.match(/.{2}/g)!.map((b) => parseInt(b, 16))
          );
          setOwnSafetyNumber(generateSafetyNumber(bytes));
        } catch {}
      });
    }
  }, [app.initialized, app.keyBundle, app.peerIds]);

  // Check for contact card in URL on load
  useEffect(() => {
    if (app.initialized) {
      app.handleContactCardFromUrl().then((result) => {
        if (result) {
          app.setScreen('add-contact');
        }
      });
    }
  }, [app.initialized]);

  const handleAddFromUrl = useCallback(
    async (url: string): Promise<boolean> => {
      try {
        // Extract the fragment or query param
        let encoded = '';
        if (url.includes('#')) {
          encoded = url.split('#')[1];
        } else if (url.includes('?c=')) {
          const params = new URLSearchParams(url.split('?')[1]);
          encoded = params.get('c') || '';
        } else {
          // Assume the entire string is the encoded card
          encoded = url;
        }

        if (!encoded) return false;

        const card = decodeContactCard(encoded);
        if (card.v !== 1 || !card.pk || !card.disc_pid) return false;

        const blob = fromBase64Url(card.pk);
        const publicKeys = await parseCombinedPublicKeyBlob(blob);

        const manager = getManager();
        if (!manager) return false;

        const contact = await manager.sendAddRequest(publicKeys, card.disc_pid);
        return !!contact;
      } catch (err) {
        console.error('Failed to add contact from URL:', err);
        return false;
      }
    },
    [app.initialized]
  );

  const selectedContact = app.contacts.find(
    (c) => c.id === app.selectedContactId
  );

  const handleSelectContact = (id: string) => {
    app.setSelectedContact(id);
    app.setScreen('chat');
    app.markRead(id);
  };

  const handleSendMessage = async (content: string) => {
    if (!app.selectedContactId) return;
    const manager = getManager();
    if (!manager) return;
    await manager.sendMessage(app.selectedContactId, content);
  };

  const handleAcceptRequest = async () => {
    if (!app.selectedContactId) return;
    const manager = getManager();
    if (!manager) return;
    await manager.acceptAddRequest(app.selectedContactId);
  };

  const handleDeclineRequest = async () => {
    if (!app.selectedContactId) return;
    const manager = getManager();
    if (!manager) return;
    await manager.declineAddRequest(app.selectedContactId);
  };

  const handleSaveSettings = (updates: Record<string, unknown>) => {
    app.setSettings(updates);
    saveSetting('appSettings', { ...app.settings, ...updates });
  };

  const unacknowledgedAlerts = app.alerts.filter((a) => !a.acknowledged).length;

  // Render current screen
  switch (app.currentScreen) {
    case 'first-run':
      return (
        <FirstRun
          onSetup={app.generateIdentity}
          initializing={app.initializing}
        />
      );

    case 'conversations':
      return (
        <ConversationsList
          contacts={app.contacts}
          messages={app.messages}
          unreadCounts={app.unreadCounts}
          connectionStatuses={app.connectionStatuses}
          onSelectContact={handleSelectContact}
          onAddContact={() => app.setScreen('add-contact')}
          onOpenIdentity={() => app.setScreen('my-identity')}
          onOpenSettings={() => app.setScreen('settings')}
          onOpenAlerts={() => app.setScreen('alerts')}
          alertCount={unacknowledgedAlerts}
        />
      );

    case 'chat':
      if (!selectedContact) {
        app.setScreen('conversations');
        return null;
      }
      return (
        <ChatView
          contact={selectedContact}
          messages={app.messages[selectedContact.id] || []}
          connectionStatus={
            (app.connectionStatuses[selectedContact.id] as ConnectionStatus) || 'offline'
          }
          onSendMessage={handleSendMessage}
          onSendTyping={() => {
            const manager = getManager();
            if (manager && app.selectedContactId) {
              manager.sendTypingIndicator(app.selectedContactId);
            }
          }}
          onSendReadReceipt={(messageId) => {
            const manager = getManager();
            if (manager && app.selectedContactId) {
              manager.sendReadReceipt(app.selectedContactId, messageId);
            }
          }}
          onBack={() => {
            app.setSelectedContact(null);
            app.setScreen('conversations');
          }}
          onContactDetail={() => app.setScreen('contact-detail')}
        />
      );

    case 'add-contact':
      return (
        <AddContact
          ownContactUrl={ownContactUrl}
          onAddFromUrl={handleAddFromUrl}
          onBack={() => app.setScreen('conversations')}
        />
      );

    case 'contact-detail':
      if (!selectedContact) {
        app.setScreen('conversations');
        return null;
      }
      return (
        <ContactDetail
          contact={selectedContact}
          connectionStatus={
            (app.connectionStatuses[selectedContact.id] as ConnectionStatus) || 'offline'
          }
          onBack={() => app.setScreen('chat')}
          onRemoveContact={(id) => {
            app.removeContact(id);
            app.setSelectedContact(null);
            app.setScreen('conversations');
          }}
          onAccept={handleAcceptRequest}
          onDecline={handleDeclineRequest}
        />
      );

    case 'my-identity':
      return (
        <MyIdentity
          profile={app.profile}
          peerIds={app.peerIds}
          contactUrl={ownContactUrl}
          pkHash={ownPkHash}
          safetyNumber={ownSafetyNumber}
          onBack={() => app.setScreen('conversations')}
          onRotateDiscovery={async () => {
            const manager = getManager();
            if (manager) await manager.rotateDiscoveryId();
          }}
          onRotateMessaging={async () => {
            const manager = getManager();
            if (manager) await manager.rotateMessagingId();
          }}
          onEditProfile={() => {
            // TODO: Edit profile modal
          }}
        />
      );

    case 'settings':
      return (
        <Settings
          settings={app.settings}
          onSave={handleSaveSettings}
          onBack={() => app.setScreen('conversations')}
          onOpenDevices={() => app.setScreen('devices')}
        />
      );

    case 'devices':
      return (
        <Devices
          devices={app.devices}
          onAddDevice={async () => {
            // Generate pairing code (simplified)
            return `securemesh-pair:${crypto.randomUUID()}`;
          }}
          onRevokeDevice={(id) => app.removeDevice(id)}
          onBack={() => app.setScreen('settings')}
        />
      );

    case 'alerts':
      return (
        <SecurityAlerts
          alerts={app.alerts}
          onAcknowledge={(id) => app.acknowledgeAlert(id)}
          onBack={() => app.setScreen('conversations')}
        />
      );

    default:
      return null;
  }
}
