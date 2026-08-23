import { WatchTimeBreakdown } from "@/lib/types";

interface Props {
  breakdown: WatchTimeBreakdown[];
}

export default function WatchTimeBars({ breakdown }: Props) {
  const baseline = breakdown[0]?.total_seconds || 1;

  return (
    <div className="flex flex-1 flex-col justify-center gap-4">
      {breakdown.map((entry) => {
        const widthPercent = Math.max(8, (entry.total_seconds / baseline) * 100);
        return (
          <div key={entry.speed} className="flex items-center gap-4">
            <span className="w-12 shrink-0 font-mono text-base text-mist-400">
              {entry.speed}×
            </span>
            <div className="h-10 flex-1 rounded-card bg-ink-900">
              <div
                className="flex h-full items-center justify-end rounded-card bg-amber px-3 transition-all"
                style={{ width: `${widthPercent}%` }}
              >
                <span className="font-mono text-base font-semibold text-ink-950">
                  {entry.formatted}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
