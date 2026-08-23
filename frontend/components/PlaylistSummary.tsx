"use client";

import { PlaylistImportResponse, WatchTimeResponse } from "@/lib/types";
import WatchTimeBars from "./WatchTimeBars";

interface Props {
  data: PlaylistImportResponse;
  watchTime: WatchTimeResponse | null;
  onRefresh?: () => void;
}

export default function PlaylistSummary({ data, watchTime, onRefresh }: Props) {
  const displayedBreakdown =
    watchTime?.watch_time_by_speed ?? data.watch_time_by_speed;

  return (
    <div className="flex flex-col gap-6 rounded-card border border-ink-700 bg-ink-900 p-6 shadow-lg shadow-ink-950/10">
      <div>
        <p className="font-mono text-s uppercase tracking-wide text-signal">
          {data.video_count} videos
          {data.unavailable_count > 0 &&
            ` · ${data.unavailable_count} unavailable`}
          {data.cached}
        </p>
        <div className="flex items-center gap-3">
          <h2 className="font-display text-2xl font-semibold text-mist-50">
            {data.playlist_title}
          </h2>
          {data.cached && onRefresh && (
            <button
              onClick={onRefresh}
              className="font-mono text-xs text-mist-400 underline decoration-dotted underline-offset-4 hover:text-signal"
            >
              refresh from YouTube
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col rounded-card border border-ink-700 bg-ink-800 p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-mist-400">
            Watch time by speed
          </h3>
          {watchTime && (
            <span className="font-mono text-s text-signal">
              Videos #{watchTime.start_position + 1}–#{watchTime.end_position + 1} (
              {watchTime.video_count} Videos)
            </span>
          )}
        </div>

        <WatchTimeBars breakdown={displayedBreakdown} />
      </div>
    </div>
  );
}
