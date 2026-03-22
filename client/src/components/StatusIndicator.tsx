import type { ConnectionStatus } from '../types';

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  online: 'bg-green-500',
  registered: 'bg-yellow-500',
  offline: 'bg-gray-500',
  hijack_detected: 'bg-red-500',
};

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  online: 'Online',
  registered: 'Registered',
  offline: 'Offline',
  hijack_detected: 'Security Alert',
};

export function StatusIndicator({ status }: { status: ConnectionStatus }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[status]} ${status === 'hijack_detected' ? 'animate-pulse' : ''}`} />
      <span className="text-xs text-gray-400">{STATUS_LABELS[status]}</span>
    </span>
  );
}
