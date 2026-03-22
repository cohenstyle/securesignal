/**
 * Security Alerts screen — displays hijacking events and recommendations.
 */

import type { SecurityAlert } from '../types';

interface SecurityAlertsProps {
  alerts: SecurityAlert[];
  onAcknowledge: (id: string) => void;
  onBack: () => void;
}

export function SecurityAlerts({ alerts, onAcknowledge, onBack }: SecurityAlertsProps) {
  return (
    <div className="flex flex-col h-screen">
      <div className="flex items-center gap-3 p-3 border-b border-gray-800">
        <button onClick={onBack} className="p-1 text-gray-400 hover:text-white">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold text-white">Security Alerts</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {alerts.length === 0 && (
          <div className="text-center py-8">
            <div className="w-12 h-12 bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <p className="text-gray-400">No security alerts</p>
            <p className="text-sm text-gray-600 mt-1">All connections are secure</p>
          </div>
        )}

        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={`rounded-xl border p-4 ${
              alert.acknowledged
                ? 'border-gray-800 bg-gray-900/50'
                : alert.type === 'targeted_attack'
                ? 'border-red-800 bg-red-950/30'
                : 'border-yellow-800 bg-yellow-950/30'
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <svg
                  className={`w-5 h-5 ${
                    alert.type === 'targeted_attack'
                      ? 'text-red-400'
                      : 'text-yellow-400'
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
                <span
                  className={`text-sm font-medium ${
                    alert.type === 'targeted_attack'
                      ? 'text-red-400'
                      : 'text-yellow-400'
                  }`}
                >
                  {alert.type === 'targeted_attack'
                    ? 'Targeted Attack Detected'
                    : 'ID Hijacking Detected'}
                </span>
              </div>
              <span className="text-xs text-gray-500">
                {new Date(alert.timestamp).toLocaleString()}
              </span>
            </div>

            <p className="text-sm text-gray-300 mb-3">{alert.message}</p>

            <div className="text-xs text-gray-500 space-y-1 mb-3">
              <p className="font-medium text-gray-400">Recommended actions:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Verify identity out-of-band with affected contacts</li>
                <li>Consider re-keying sessions with affected friends</li>
                <li>Switch to a self-hosted PeerJS server if attacks persist</li>
              </ul>
            </div>

            {!alert.acknowledged && (
              <button
                onClick={() => onAcknowledge(alert.id)}
                className="text-sm text-mesh-400 hover:text-mesh-300"
              >
                Acknowledge
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
