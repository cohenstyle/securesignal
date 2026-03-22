/**
 * Settings screen.
 */

import { useState } from 'react';
import type { AppSettings } from '../types';

interface SettingsProps {
  settings: AppSettings;
  onSave: (settings: Partial<AppSettings>) => void;
  onBack: () => void;
  onOpenDevices: () => void;
}

export function Settings({ settings, onSave, onBack, onOpenDevices }: SettingsProps) {
  const [peerHost, setPeerHost] = useState(settings.peerServer?.host || '');
  const [peerPort, setPeerPort] = useState(String(settings.peerServer?.port || ''));
  const [peerPath, setPeerPath] = useState(settings.peerServer?.path || '');
  const [pushRelay, setPushRelay] = useState(settings.pushRelayUrl || '');
  const [discoveryDays, setDiscoveryDays] = useState(String(settings.discoveryRotationDays));
  const [messagingHours, setMessagingHours] = useState(String(settings.messagingRotationHours));
  const [pqInterval, setPqInterval] = useState(String(settings.pqInjectionInterval));
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    const updates: Partial<AppSettings> = {
      pushRelayUrl: pushRelay || undefined,
      discoveryRotationDays: parseInt(discoveryDays) || 7,
      messagingRotationHours: parseInt(messagingHours) || 24,
      pqInjectionInterval: parseInt(pqInterval) || 50,
    };

    if (peerHost) {
      updates.peerServer = {
        host: peerHost,
        port: parseInt(peerPort) || 9000,
        path: peerPath || '/',
      };
    }

    onSave(updates);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex flex-col h-screen">
      <div className="flex items-center gap-3 p-3 border-b border-gray-800">
        <button onClick={onBack} className="p-1 text-gray-400 hover:text-white">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold text-white">Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* PeerJS Server */}
        <section>
          <h3 className="text-sm font-medium text-gray-400 mb-3">
            PeerJS Server (leave empty for public cloud)
          </h3>
          <div className="space-y-2">
            <input
              value={peerHost}
              onChange={(e) => setPeerHost(e.target.value)}
              placeholder="Host (e.g., example.com)"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-mesh-500"
            />
            <div className="flex gap-2">
              <input
                value={peerPort}
                onChange={(e) => setPeerPort(e.target.value)}
                placeholder="Port (9000)"
                className="w-1/2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-mesh-500"
              />
              <input
                value={peerPath}
                onChange={(e) => setPeerPath(e.target.value)}
                placeholder="Path (/)"
                className="w-1/2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-mesh-500"
              />
            </div>
          </div>
        </section>

        {/* Push Relay */}
        <section>
          <h3 className="text-sm font-medium text-gray-400 mb-3">
            Push Notification Relay Server
          </h3>
          <input
            value={pushRelay}
            onChange={(e) => setPushRelay(e.target.value)}
            placeholder="https://relay.example.com"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-mesh-500"
          />
        </section>

        {/* ID Rotation */}
        <section>
          <h3 className="text-sm font-medium text-gray-400 mb-3">
            ID Rotation Schedule
          </h3>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500 w-40">Discovery ID</label>
              <input
                type="number"
                value={discoveryDays}
                onChange={(e) => setDiscoveryDays(e.target.value)}
                min={1}
                max={30}
                className="w-20 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm text-center focus:outline-none focus:ring-2 focus:ring-mesh-500"
              />
              <span className="text-sm text-gray-500">days</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500 w-40">Messaging ID</label>
              <input
                type="number"
                value={messagingHours}
                onChange={(e) => setMessagingHours(e.target.value)}
                min={1}
                max={168}
                className="w-20 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm text-center focus:outline-none focus:ring-2 focus:ring-mesh-500"
              />
              <span className="text-sm text-gray-500">hours</span>
            </div>
          </div>
        </section>

        {/* PQ Injection */}
        <section>
          <h3 className="text-sm font-medium text-gray-400 mb-3">
            Post-Quantum Ratchet Injection
          </h3>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500">Every</label>
            <input
              type="number"
              value={pqInterval}
              onChange={(e) => setPqInterval(e.target.value)}
              min={1}
              max={1000}
              className="w-20 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm text-center focus:outline-none focus:ring-2 focus:ring-mesh-500"
            />
            <span className="text-sm text-gray-500">messages</span>
          </div>
        </section>

        {/* Devices */}
        <section>
          <button
            onClick={onOpenDevices}
            className="w-full flex items-center justify-between bg-gray-800 hover:bg-gray-700 rounded-lg px-4 py-3"
          >
            <span className="text-sm text-white">Linked Devices</span>
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </section>

        <button
          onClick={handleSave}
          className="w-full bg-mesh-600 hover:bg-mesh-700 text-white py-2.5 rounded-lg text-sm font-medium"
        >
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
