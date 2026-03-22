/**
 * Add Contact screen — paste URL, scan QR, or show own QR.
 */

import { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface AddContactProps {
  ownContactUrl: string;
  onAddFromUrl: (url: string) => Promise<boolean>;
  onBack: () => void;
}

type Tab = 'show-qr' | 'scan-qr' | 'paste-url';

export function AddContact({ ownContactUrl, onAddFromUrl, onBack }: AddContactProps) {
  const [tab, setTab] = useState<Tab>('show-qr');
  const [urlInput, setUrlInput] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const handlePasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!urlInput.trim()) return;

    try {
      const ok = await onAddFromUrl(urlInput.trim());
      if (ok) {
        setSuccess(true);
        setUrlInput('');
      } else {
        setError('Invalid contact card or already a contact');
      }
    } catch {
      setError('Failed to process contact card');
    }
  };

  const startScanning = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setScanning(true);
    } catch {
      setError('Camera access denied');
    }
  };

  const stopScanning = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  };

  useEffect(() => {
    if (tab === 'scan-qr') {
      startScanning();
    } else {
      stopScanning();
    }
    return () => stopScanning();
  }, [tab]);

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'SecureMesh Contact',
          text: 'Add me on SecureMesh',
          url: ownContactUrl,
        });
      } catch {
        // User cancelled or error
      }
    } else {
      await navigator.clipboard.writeText(ownContactUrl);
    }
  };

  const handleCopyUrl = async () => {
    await navigator.clipboard.writeText(ownContactUrl);
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 p-3 border-b border-gray-800">
        <button onClick={onBack} className="p-1 text-gray-400 hover:text-white">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold text-white">Add Contact</h1>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800">
        {(['show-qr', 'scan-qr', 'paste-url'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setError(''); setSuccess(false); }}
            className={`flex-1 py-3 text-sm font-medium ${
              tab === t
                ? 'text-mesh-400 border-b-2 border-mesh-500'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t === 'show-qr' ? 'My QR Code' : t === 'scan-qr' ? 'Scan QR' : 'Paste URL'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Show QR */}
        {tab === 'show-qr' && (
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-gray-400 text-center">
              Let others scan this code to add you as a contact
            </p>
            {ownContactUrl && (
              <div className="bg-white p-4 rounded-2xl">
                <QRCodeSVG
                  value={ownContactUrl}
                  size={220}
                  level="M"
                  includeMargin={false}
                />
              </div>
            )}
            <div className="flex gap-2 w-full max-w-xs">
              <button
                onClick={handleCopyUrl}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2 rounded-lg text-sm"
              >
                Copy URL
              </button>
              <button
                onClick={handleShare}
                className="flex-1 bg-mesh-600 hover:bg-mesh-700 text-white py-2 rounded-lg text-sm"
              >
                Share
              </button>
            </div>
          </div>
        )}

        {/* Scan QR */}
        {tab === 'scan-qr' && (
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-gray-400 text-center">
              Point your camera at another user's SecureMesh QR code
            </p>
            <div className="relative w-full max-w-xs aspect-square bg-gray-900 rounded-2xl overflow-hidden">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
              />
              {scanning && (
                <div className="absolute inset-0 border-2 border-mesh-500 rounded-2xl pointer-events-none">
                  <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-mesh-500 animate-pulse" />
                </div>
              )}
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>
        )}

        {/* Paste URL */}
        {tab === 'paste-url' && (
          <div className="max-w-md mx-auto">
            <p className="text-sm text-gray-400 mb-4">
              Paste a SecureMesh contact URL to add someone
            </p>
            <form onSubmit={handlePasteSubmit} className="space-y-3">
              <textarea
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Paste contact URL here..."
                className="w-full h-32 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-mesh-500 text-sm font-mono resize-none"
              />
              {error && <p className="text-sm text-red-400">{error}</p>}
              {success && (
                <p className="text-sm text-green-400">Contact request sent!</p>
              )}
              <button
                type="submit"
                disabled={!urlInput.trim()}
                className="w-full bg-mesh-600 hover:bg-mesh-700 disabled:bg-gray-700 disabled:text-gray-500 text-white py-2.5 rounded-lg text-sm font-medium"
              >
                Add Contact
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
