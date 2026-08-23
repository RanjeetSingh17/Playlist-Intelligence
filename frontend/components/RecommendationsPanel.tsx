"use client";

import { useState } from "react";
import { getRecommendations } from "@/lib/api";
import { VideoItem, VideoRecommendation } from "@/lib/types";

interface Props {
  videos: VideoItem[];
  duplicateClusters: string[][];
  onRecommendations: (recs: VideoRecommendation[]) => void;
}

export default function RecommendationsPanel({
  videos,
  duplicateClusters,
  onRecommendations,
}: Props) {
  const [recommendations, setRecommendations] = useState<VideoRecommendation[] | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGetRecommendations() {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getRecommendations(videos, duplicateClusters);
      setRecommendations(result.recommendations);
      onRecommendations(result.recommendations);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't get recommendations."
      );
    } finally {
      setIsLoading(false);
    }
  }

  const skipped = recommendations?.filter((r) => r.action === "skip") ?? [];
  const titleByVideoId = new Map(videos.map((v) => [v.video_id, v.title]));

  return (
    <div className="flex flex-col gap-3 rounded-card border border-ink-700 bg-ink-900 p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-display text-base font-semibold text-mist-50">
            Prioritize &amp; skip
          </p>
          <p className="text-s text-mist-400">
            {duplicateClusters.length === 0
              ? "Run the analysis above first to detect duplicates."
              : "Based on the duplicate detection from the analysis above."}
          </p>
        </div>
        <button
          onClick={handleGetRecommendations}
          disabled={isLoading || duplicateClusters.length === 0}
          className="shrink-0 rounded-card bg-signal px-4 py-2 font-display text-base font-semibold text-ink-950 transition hover:bg-signal-dim disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? "Checking…" : "Get recommendations"}
        </button>
      </div>

      {error && <p className="text-s text-amber">{error}</p>}

      {recommendations && (
        <div className="flex flex-col gap-2">
          {skipped.length === 0 ? (
            <p className="text-s text-mist-400">
              No videos recommended to skip.
            </p>
          ) : (
            skipped.map((r) => (
              <div
                key={r.video_id}
                className="rounded-card border border-amber-dim bg-ink-800 p-3"
              >
                <p className="text-base text-mist-50">
                  {titleByVideoId.get(r.video_id) ?? r.video_id}
                </p>
                <p className="mt-1 font-mono text-s text-amber">
                  skip — {r.reason}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
