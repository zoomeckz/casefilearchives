import React from "react";
import { AuthUser } from "@/hooks/useAuth";
import { useAchievements } from "@/hooks/useAchievements";
import { ProfileFrame, frameOptions } from "@/components/ProfileFrame";

interface RewardsPageProps {
  user: AuthUser;
}

export const RewardsPage: React.FC<RewardsPageProps> = ({ user }) => {
  const {
    achievements,
    loading,
    getProgress,
    isUnlocked,
    selectedFrame,
    selectFrame,
  } = useAchievements(user);

  if (loading) {
    return (
      <div className="min-h-screen py-12 px-6 flex items-center justify-center">
        <p className="text-muted-foreground">Loading achievements...</p>
      </div>
    );
  }

  const unlockedCount = achievements.filter(a => isUnlocked(a.id)).length;
  const categories = [...new Set(achievements.map(a => a.category))];
  const categoryLabels: Record<string, string> = {
    reading: '📖 Reading',
    community: '💬 Community',
    engagement: '⭐ Engagement',
    special: '✨ Special',
  };

  // Get unlocked frames
  const unlockedFrames = achievements
    .filter(a => isUnlocked(a.id) && a.frame_style)
    .map(a => a.frame_style!);

  return (
    <div className="min-h-screen py-8 sm:py-12 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="font-display text-3xl sm:text-4xl text-accent mb-2">Rewards</h1>
        <p className="text-muted-foreground mb-4 text-sm sm:text-base">
          Earn achievements by reading, commenting, and engaging with the community.
          Each achievement tracks your progress — some unlock exclusive profile frames!
        </p>

        {/* Progress summary */}
        <div className="flex items-center gap-4 mb-12 p-4 bg-card/30 rounded-xl border border-border">
          <ProfileFrame avatarUrl={user.avatarUrl} name={user.name} frame={selectedFrame} size={64} />
          <div className="flex-1">
            <h3 className="text-foreground font-display text-lg">{user.name}</h3>
            <p className="text-muted-foreground text-sm">
              {unlockedCount} / {achievements.length} achievements unlocked
            </p>
            <div className="w-full bg-secondary rounded-full h-2 mt-2">
              <div
                className="bg-primary h-2 rounded-full transition-all"
                style={{ width: `${(unlockedCount / achievements.length) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Frame selector */}
        {unlockedFrames.length > 0 && (
          <section className="mb-12">
            <h2 className="font-display text-xl text-accent mb-4">Your Frames</h2>
            <p className="text-muted-foreground text-sm mb-4">Select a frame for your profile picture. Unlock more by earning achievements!</p>
            <div className="flex flex-wrap gap-4 items-center">
              <button
                onClick={() => selectFrame(null)}
                className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-colors ${
                  !selectedFrame ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
                }`}
              >
                <ProfileFrame avatarUrl={user.avatarUrl} name={user.name} frame={null} size={56} />
                <span className="text-xs text-muted-foreground">None</span>
              </button>
              {unlockedFrames.map(frame => (
                <button
                  key={frame}
                  onClick={() => selectFrame(frame)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-colors ${
                    selectedFrame === frame ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
                  }`}
                >
                  <ProfileFrame avatarUrl={user.avatarUrl} name={user.name} frame={frame} size={56} />
                  <span className="text-xs text-muted-foreground capitalize">{frame.replace('-', ' ')}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Achievements by category */}
        {categories.map(cat => (
          <section key={cat} className="mb-10">
            <h2 className="font-display text-lg text-accent mb-4">{categoryLabels[cat] || cat}</h2>
            <div className="space-y-3">
              {achievements.filter(a => a.category === cat).map(ach => {
                const unlocked = isUnlocked(ach.id);
                const { current, max } = getProgress(ach);
                const pct = Math.min((current / max) * 100, 100);

                return (
                  <div
                    key={ach.id}
                    className={`p-4 rounded-xl border transition-colors ${
                      unlocked
                        ? 'border-primary/30 bg-primary/5'
                        : 'border-border bg-card/20 opacity-70'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <span className="text-2xl" style={{ filter: unlocked ? 'none' : 'grayscale(1)' }}>
                        {ach.icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className={`font-medium ${unlocked ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {ach.title}
                          </h4>
                          {unlocked && <span className="text-xs text-primary">✓ Unlocked</span>}
                          {ach.frame_style && (
                            <span className="text-xs px-2 py-0.5 rounded bg-accent/10 text-accent border border-accent/20">
                              🖼️ Frame
                            </span>
                          )}
                        </div>
                        <p className="text-muted-foreground text-sm mt-0.5">{ach.description}</p>
                        {!unlocked && (
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                              <span>Progress</span>
                              <span>{current} / {max}</span>
                            </div>
                            <div className="w-full bg-secondary rounded-full h-1.5">
                              <div
                                className="bg-primary/60 h-1.5 rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

export default RewardsPage;
