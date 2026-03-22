/**
 * My Identity screen — view/copy contact card, QR code, rotate IDs.
 */

import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { PeerIdSet, UserProfile } from '../types';
import { Avatar } from '../components/Avatar';

interface MyIdentityProps {
  profile: UserProfile;
  peerIds: PeerIdSet | null;
  contactUrl: string;
  pkHash: string;
  safetyNumber: string;
  onBack: () => void;
  onRotateDiscovery: () => Promise<void>;
  onRotateMessaging: () => Promise<void>;
  onEditProfile: () => void;
}

export function MyIdentity({
  profile,
  peerIds,
  contactUrl,
  pkHash,
  safetyNumber,
  onBack,
  onRotateDiscovery,
  onRotateMessaging,
  onEditProfile,
}: MyIdentityProps) {
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState('');

  const handleCopy = async () => {
    await navigator.clipboard.writeText(contactUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({
        title: 'SecureMesh Contact',
        text: `Add me on SecureMesh: ${profile.displayName}`,
        url: contactUrl,
      });
    } else {
      handleCopy();
    }
  };

  const handleRotateDiscovery = async () => {
    setRotating('discovery');
    await onRotateDiscovery();
    setRotating('');
  };

  const handleRotateMessaging = async () => {
    setRotating('messaging');
    await onRotateMessaging();
    setRotating('');
  };

  return (
    <div className="flex flex-col h-screen">
      <div className="flex items-center gap-3 p-3 border-b border-gray-800">
        <button onClick={onBack} className="p-1 text-gray-400 hover:text-white">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold text-white">My Identity</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Profile */}
        <div className="flex flex-col items-center p-6 border-b border-gray-800">
          <Avatar
            displayName={profile.displayName}
            photo={profile.photo}
            pkHash={pkHash}
            size="lg"
          />
          <h2 className="text-xl font-bold text-white mt-3">
            {profile.displayName}
          </h2>
          {profile.status && (
            <p className="text-gray-400 mt-1">{profile.status}</p>
          )}
          <button
            onClick={onEditProfile}
            className="mt-2 text-sm text-mesh-400 hover:text-mesh-300"
          >
            Edit Profile
          </button>
        </div>

        {/* QR Code */}
        <div className="flex flex-col items-center p-6 border-b border-gray-800">
          <h3 className="text-sm font-medium text-gray-400 mb-3">
            Your Contact QR Code
          </h3>
          {contactUrl && (
            <div className="bg-white p-4 rounded-2xl">
              <QRCodeSVG value={contactUrl} size={200} level="M" />
            </div>
          )}
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleCopy}
              className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm"
            >
              {copied ? 'Copied!' : 'Copy URL'}
            </button>
            <button
              onClick={handleShare}
              className="bg-mesh-600 hover:bg-mesh-700 text-white px-4 py-2 rounded-lg text-sm"
            >
              Share
            </button>
          </div>
        </div>

        {/* Safety Number */}
        <div className="p-4 border-b border-gray-800">
          <h3 className="text-sm font-medium text-gray-400 mb-2">
            Your Safety Number
          </h3>
          <div className="bg-gray-900 rounded-lg p-3 font-mono text-center text-mesh-400 tracking-wider">
            {safetyNumber}
          </div>
        </div>

        {/* Peer IDs */}
        <div className="p-4 border-b border-gray-800 space-y-3">
          <h3 className="text-sm font-medium text-gray-400">PeerJS IDs</h3>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Discovery ID</span>
              <button
                onClick={handleRotateDiscovery}
                disabled={rotating === 'discovery'}
                className="text-xs text-mesh-400 hover:text-mesh-300"
              >
                {rotating === 'discovery' ? 'Rotating...' : 'Rotate'}
              </button>
            </div>
            <p className="text-xs text-gray-300 font-mono mt-1">
              {peerIds?.discoveryId}
            </p>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Messaging ID</span>
              <button
                onClick={handleRotateMessaging}
                disabled={rotating === 'messaging'}
                className="text-xs text-mesh-400 hover:text-mesh-300"
              >
                {rotating === 'messaging' ? 'Rotating...' : 'Rotate'}
              </button>
            </div>
            <p className="text-xs text-gray-300 font-mono mt-1">
              {peerIds?.messagingId}
            </p>
          </div>
        </div>

        {/* Key Info */}
        <div className="p-4 border-b border-gray-800">
          <h3 className="text-sm font-medium text-gray-400 mb-2">
            Public Key Hash
          </h3>
          <p className="text-xs text-gray-300 font-mono break-all">{pkHash}</p>
        </div>

        <div className="p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-2">
            Cryptographic Algorithms
          </h3>
          <div className="space-y-1 text-xs text-gray-500">
            <p>KEM: ML-KEM-1024 + X25519 (Hybrid)</p>
            <p>Signatures: ML-DSA-87 + Ed25519 (Hybrid)</p>
            <p>Symmetric: AES-256-GCM</p>
            <p>KDF: HKDF-SHA-512</p>
            <p>Ratchet: Double Ratchet with PQ injection</p>
          </div>
        </div>
      </div>
    </div>
  );
}
