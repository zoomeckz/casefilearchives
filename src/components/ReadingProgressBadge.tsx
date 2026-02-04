import React from 'react';
import { Icons } from '@/lib/icons';

interface ReadingProgressBadgeProps {
  isRead: boolean;
  onClick?: (e: React.MouseEvent) => void;
  showLabel?: boolean;
}

export const ReadingProgressBadge: React.FC<ReadingProgressBadgeProps> = ({
  isRead,
  onClick,
  showLabel = false,
}) => {
  if (!isRead) return null;

  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-900/30 text-emerald-400 text-xs font-medium transition-colors hover:bg-emerald-900/50"
      title="Mark as unread"
    >
      <Icons.Check className="w-3 h-3" />
      {showLabel && <span>Read</span>}
    </button>
  );
};

export default ReadingProgressBadge;
