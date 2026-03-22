/**
 * Devices screen — list linked devices, add/revoke.
 */

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { DeviceInfo } from '../types';

interface DevicesProps {
  devices: DeviceInfo[];
  onAddDevice: () => Promise<string>; // returns pairing code
  onRevokeDevice: (id: string) => void;
  onBack: () => void;
}

export function Devices({ devices, onAddDevice, onRevokeDevice, onBack }: DevicesProps) {
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const handleAddDevice = async () => {
    setAdding(true);
    const code = await onAddDevice();
    setPairingCode(code);
    setAdding(false);
    // TTL: 5 minutes
    setTimeout(() => setPairingCode(null), 5 * 60 * 1000);
  };

  return (
    <div className="flex flex-col h-screen">
      <div className="flex items-center gap-3 p-3 border-b border-gray-800">
        <button onClick={onBack} className="p-1 text-gray-400 hover:text-white">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold text-white">Linked Devices</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Device list */}
        <div className="space-y-2 mb-6">
          {devices.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">
              Only this device is linked to your identity
            </p>
          )}
          {devices.map((device) => (
            <div
              key={device.id}
              className="flex items-center justify-between bg-gray-900 rounded-lg p-3"
            >
              <div>
                <p className="text-sm text-white font-medium">
                  {device.name}
                  {device.isCurrentDevice && (
                    <span className="ml-2 text-xs text-mesh-400">(this device)</span>
                  )}
                </p>
                <p className="text-xs text-gray-500">
                  Last seen: {new Date(device.lastSeen).toLocaleString()}
                </p>
              </div>
              {!device.isCurrentDevice && (
                <button
                  onClick={() => onRevokeDevice(device.id)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Add device */}
        {pairingCode ? (
          <div className="flex flex-col items-center gap-4 bg-gray-900 rounded-xl p-6">
            <h3 className="text-sm font-medium text-white">
              Scan this on your new device
            </h3>
            <div className="bg-white p-3 rounded-xl">
              <QRCodeSVG value={pairingCode} size={180} level="M" />
            </div>
            <p className="text-xs text-gray-500 text-center">
              This code expires in 5 minutes
            </p>
            <button
              onClick={() => setPairingCode(null)}
              className="text-sm text-gray-400 hover:text-white"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={handleAddDevice}
            disabled={adding}
            className="w-full bg-mesh-600 hover:bg-mesh-700 text-white py-2.5 rounded-lg text-sm font-medium"
          >
            {adding ? 'Generating pairing code...' : 'Add New Device'}
          </button>
        )}
      </div>
    </div>
  );
}
