/**
 * Contact detail screen — shows fingerprint, connection info, actions.
 */

import { useState, useEffect } from 'react';
import type { Contact, ConnectionStatus } from '../types';
import { Avatar } from '../components/Avatar';
import { StatusIndicator } from '../components/StatusIndicator';
import { generateSafetyNumber, fromBase64Url } from '../crypto/utils';

interface ContactDetailProps {
  contact: Contact;
  connectionStatus: ConnectionStatus;
  onBack: () => void;
  onRemoveContact: (id: string) => void;
  onAccept?: () => void;
  onDecline?: () => void;
}

export function ContactDetail({
  contact,
  connectionStatus,
  onBack,
  onRemoveContact,
  onAccept,
  onDecline,
}: ContactDetailProps) {
  const [safetyNumber, setSafetyNumber] = useState('');

  useEffect(() => {
    // Derive safety number from combined public key hash
    try {
      const combined = fromBase64Url(contact.publicKeys.kem).slice(0, 32);
      setSafetyNumber(generateSafetyNumber(combined));
    } catch {
      setSafetyNumber('Unable to compute');
    }
  }, [contact.publicKeys]);

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 p-3 border-b border-gray-800">
        <button onClick={onBack} className="p-1 text-gray-400 hover:text-white">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold text-white">Contact Info</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Profile */}
        <div className="flex flex-col items-center p-6 border-b border-gray-800">
          <Avatar
            displayName={contact.profile.displayName}
            photo={contact.profile.photo}
            pkHash={contact.id}
            size="lg"
          />
          <h2 className="text-xl font-bold text-white mt-3">
            {contact.profile.displayName}
          </h2>
          {contact.profile.status && (
            <p className="text-gray-400 mt-1">{contact.profile.status}</p>
          )}
          {contact.profile.bio && (
            <p className="text-gray-500 text-sm mt-1">{contact.profile.bio}</p>
          )}
          <div className="mt-2">
            <StatusIndicator status={connectionStatus} />
          </div>
        </div>

        {/* Pending actions */}
        {contact.status === 'pending_incoming' && (
          <div className="p-4 border-b border-gray-800 bg-gray-900">
            <p className="text-sm text-gray-400 mb-3 text-center">
              This person wants to connect with you
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={onAccept}
                className="bg-mesh-600 hover:bg-mesh-700 text-white px-6 py-2 rounded-lg text-sm font-medium"
              >
                Accept
              </button>
              <button
                onClick={onDecline}
                className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded-lg text-sm font-medium"
              >
                Decline
              </button>
            </div>
          </div>
        )}

        {/* Safety Number */}
        <div className="p-4 border-b border-gray-800">
          <h3 className="text-sm font-medium text-gray-400 mb-2">
            Safety Number
          </h3>
          <p className="text-sm text-gray-500 mb-2">
            Verify this matches on your contact's device to confirm no MITM
          </p>
          <div className="bg-gray-900 rounded-lg p-3 font-mono text-center text-mesh-400 tracking-wider">
            {safetyNumber}
          </div>
        </div>

        {/* Connection Info */}
        <div className="p-4 border-b border-gray-800 space-y-2">
          <h3 className="text-sm font-medium text-gray-400 mb-2">
            Connection Details
          </h3>
          <div className="text-sm">
            <span className="text-gray-500">Public Key Hash: </span>
            <span className="text-gray-300 font-mono text-xs break-all">
              {contact.id}
            </span>
          </div>
          {contact.messagingPeerId && (
            <div className="text-sm">
              <span className="text-gray-500">Messaging ID: </span>
              <span className="text-gray-300 font-mono text-xs">
                {contact.messagingPeerId}
              </span>
            </div>
          )}
          <div className="text-sm">
            <span className="text-gray-500">Added: </span>
            <span className="text-gray-300">
              {new Date(contact.addedAt).toLocaleDateString()}
            </span>
          </div>
          {contact.lastSeen && (
            <div className="text-sm">
              <span className="text-gray-500">Last seen: </span>
              <span className="text-gray-300">
                {new Date(contact.lastSeen).toLocaleString()}
              </span>
            </div>
          )}
        </div>

        {/* Encryption Info */}
        <div className="p-4 border-b border-gray-800">
          <h3 className="text-sm font-medium text-gray-400 mb-2">
            Encryption
          </h3>
          <div className="space-y-1 text-sm text-gray-300">
            <p>ML-KEM-1024 + X25519 Hybrid KEM</p>
            <p>ML-DSA-87 + Ed25519 Hybrid Signatures</p>
            <p>Double Ratchet with PQ Injection</p>
            <p>AES-256-GCM per-message encryption</p>
          </div>
        </div>

        {/* Danger Zone */}
        {contact.status === 'accepted' && (
          <div className="p-4">
            <button
              onClick={() => onRemoveContact(contact.id)}
              className="w-full bg-red-900/30 hover:bg-red-900/50 text-red-400 py-2.5 rounded-lg text-sm font-medium border border-red-900/50"
            >
              Remove Contact
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
