/**
 * Avatar component — displays user photo or generated avatar from pk hash.
 */

const AVATAR_COLORS = [
  'bg-blue-600', 'bg-indigo-600', 'bg-purple-600', 'bg-pink-600',
  'bg-red-600', 'bg-orange-600', 'bg-amber-600', 'bg-emerald-600',
  'bg-teal-600', 'bg-cyan-600',
];

function hashToColor(hash: string): string {
  let num = 0;
  for (let i = 0; i < hash.length; i++) {
    num = ((num << 5) - num + hash.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(num) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');
}

interface AvatarProps {
  photo?: string;
  displayName: string;
  pkHash?: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-16 h-16 text-xl',
};

export function Avatar({ photo, displayName, pkHash, size = 'md' }: AvatarProps) {
  if (photo) {
    return (
      <img
        src={`data:image/jpeg;base64,${photo}`}
        alt={displayName}
        className={`${SIZES[size]} rounded-full object-cover`}
      />
    );
  }

  const color = hashToColor(pkHash || displayName);
  const initials = getInitials(displayName) || '?';

  return (
    <div
      className={`${SIZES[size]} ${color} rounded-full flex items-center justify-center font-semibold text-white`}
    >
      {initials}
    </div>
  );
}
