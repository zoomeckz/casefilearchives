import React from 'react';
import { Progress } from '@/components/ui/progress';

interface ReadingStatsProps {
  readCount: number;
  totalCount: number;
}

export const ReadingStats: React.FC<ReadingStatsProps> = ({ readCount, totalCount }) => {
  const percentage = totalCount > 0 ? Math.round((readCount / totalCount) * 100) : 0;

  if (totalCount === 0) return null;

  return (
    <div className="bg-stone-900/50 border border-stone-800 rounded-lg p-4 mb-8">
      <div className="flex items-center justify-between mb-2">
        <span className="text-stone-400 text-sm">Your Progress</span>
        <span className="text-sky-400 text-sm font-medium">
          {readCount} / {totalCount} chapters
        </span>
      </div>
      <Progress value={percentage} className="h-2 bg-stone-800" />
      <p className="text-stone-500 text-xs mt-2">
        {percentage === 100 
          ? "You've read all available chapters!" 
          : `${percentage}% complete`}
      </p>
    </div>
  );
};

export default ReadingStats;
