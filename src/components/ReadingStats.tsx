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
    <div className="bg-card border border-border rounded-lg p-4 mb-8">
      <div className="flex items-center justify-between mb-2">
        <span className="text-muted-foreground text-sm">Your Progress</span>
        <span className="text-primary text-sm font-medium">
          {readCount} / {totalCount} stories
        </span>
      </div>
      <Progress value={percentage} className="h-2 bg-muted" />
      <p className="text-muted-foreground text-xs mt-2">
        {percentage === 100 
          ? "You've read all available stories!" 
          : `${percentage}% complete`}
      </p>
    </div>
  );
};

export default ReadingStats;
