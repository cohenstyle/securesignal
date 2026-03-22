/**
 * First-run setup screen — generates identity and shows contact card.
 */

import { useState } from 'react';

interface FirstRunProps {
  onSetup: (displayName: string, passphrase?: string) => Promise<void>;
  initializing: boolean;
}

export function FirstRun({ onSetup, initializing }: FirstRunProps) {
  const [displayName, setDisplayName] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [usePassphrase, setUsePassphrase] = useState(false);
  const [step, setStep] = useState<'name' | 'generating'>('name');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    setStep('generating');
    await onSetup(displayName.trim(), usePassphrase ? passphrase : undefined);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-mesh-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">SecureMesh</h1>
          <p className="text-gray-400 mt-2">
            Quantum-resistant P2P encrypted messenger
          </p>
        </div>

        {step === 'generating' || initializing ? (
          <div className="bg-gray-900 rounded-xl p-8 text-center">
            <div className="animate-spin w-12 h-12 border-4 border-mesh-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-white font-medium">Generating key bundle...</p>
            <p className="text-gray-400 text-sm mt-2">
              Creating ML-KEM-1024, ML-DSA-87, X25519, and Ed25519 keypairs
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-gray-900 rounded-xl p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value.slice(0, 64))}
                placeholder="Your name"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-mesh-500 focus:border-transparent"
                maxLength={64}
                autoFocus
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="usePassphrase"
                checked={usePassphrase}
                onChange={(e) => setUsePassphrase(e.target.checked)}
                className="rounded border-gray-600 text-mesh-500 focus:ring-mesh-500 bg-gray-800"
              />
              <label htmlFor="usePassphrase" className="text-sm text-gray-300">
                Set a passphrase for local key encryption
              </label>
            </div>

            {usePassphrase && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Passphrase
                </label>
                <input
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="Passphrase for local key protection"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-mesh-500 focus:border-transparent"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={!displayName.trim()}
              className="w-full bg-mesh-600 hover:bg-mesh-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium py-2.5 rounded-lg transition-colors"
            >
              Create Identity
            </button>

            <p className="text-xs text-gray-500 text-center">
              Keys are generated and stored locally. No account or server needed.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
