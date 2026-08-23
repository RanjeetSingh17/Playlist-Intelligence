"use client";

import { useState } from "react";
import { computeAnalysis, findDuplicates } from "@/lib/api";
import { DifficultyScore, VideoItem } from "@/lib/types";

interface Props {
  videos: VideoItem[];
  onDifficultyUpdate: (difficulty: Record<string, DifficultyScore>) => void;
  onDuplicatesFound: (clusters: string[][]) => void;
}

// Embedding a video is CPU-bound model inference — batched client-side so
// a big playlist doesn't sit inside one very long request. Duplicate
// clustering, by contrast, is cheap (DB read + math) but MUST see every
// video at once, so it's called separately, once, after every compute
// batch has finished — see the analysis.py comment on the backend for why.
const COMPUTE_BATCH_SIZE = 8;

type Phase = "idle" | "computing" | "clustering" | "done";

export default function AnalysisPanel({
  videos,
  onDifficultyUpdate,
  onDuplicatesFound,
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [processed, setProcessed] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyze() {
    setError(null);
    setProcessed(0);
    setSkippedCount(0);
    setPhase("computing");

    const difficultyMap: Record<string, DifficultyScore> = {};
    const ids = videos.map((v) => v.video_id);
    let skipped = 0;

    try {
      for (let i = 0; i < ids.length; i += COMPUTE_BATCH_SIZE) {
        const batch = ids.slice(i, i + COMPUTE_BATCH_SIZE);
        const result = await computeAnalysis(batch);
        for (const d of result.difficulty) {
          difficultyMap[d.video_id] = d;
        }
        skipped += result.skipped_no_transcript.length;
        setSkippedCount(skipped);
        setProcessed(Math.min(i + batch.length, ids.length));
        onDifficultyUpdate({ ...difficultyMap });
      }

      setPhase("clustering");
      const duplicatesResult = await findDuplicates(ids);
      onDuplicatesFound(duplicatesResult.duplicate_clusters);

      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
      setPhase("idle");
    }
  }

  const isRunning = phase === "computing" || phase === "clustering";

  return (
    <div className="flex flex-col gap-3 rounded-card border border-ink-700 bg-ink-900 p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-display text-base font-semibold text-mist-50">
            Difficulty &amp; duplicates
          </p>
          <p className="text-s text-mist-400">
            {phase === "computing" && `Analyzing ${processed} / ${videos.length}…`}
            {phase === "clustering" && "Comparing videos for duplicates…"}
            {phase === "done" && "Done — see badges and duplicates below."}
            {phase === "idle" && "Needs transcripts fetched first."}
          </p>
        </div>
        <button
          onClick={handleAnalyze}
          disabled={isRunning}
          className="shrink-0 rounded-card bg-signal px-4 py-2 font-display text-base font-semibold text-ink-950 transition hover:bg-signal-dim disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRunning ? "Analyzing…" : "Run analysis"}
        </button>
      </div>
      {phase === "done" && skippedCount > 0 && (
        <p className="text-xs text-mist-400">
          {skippedCount} video{skippedCount === 1 ? "" : "s"} skipped — no cached
          transcript yet.
        </p>
      )}
      {error && <p className="text-xs text-amber">{error}</p>}
    </div>
  );
}
