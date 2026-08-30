"use client";

import { useState } from "react";
import { fetchTranscripts } from "@/lib/api";
import { TranscriptResult, VideoItem } from "@/lib/types";

interface Props {
  videos: VideoItem[];
  onStatusUpdate: (status: Record<string, TranscriptResult>) => void;
}

const BATCH_SIZE = 15;

interface Summary {
  available: number;
  unavailable: number;
  error: number;
}

export default function TranscriptPanel({ videos, onStatusUpdate }: Props) {
  const [isRunning, setIsRunning] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blockedNotice, setBlockedNotice] = useState<string | null>(null);

  async function handleFetch() {
    setIsRunning(true);
    setError(null);
    setBlockedNotice(null);
    setProcessed(0);
    setSummary({ available: 0, unavailable: 0, error: 0 });

    const statusMap: Record<string, TranscriptResult> = {};
    const ids = videos.map((v) => v.video_id);
    let available = 0;
    let unavailable = 0;
    let errored = 0;

    try {
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        const result = await fetchTranscripts(batch);

        for (const r of result.results) {
          statusMap[r.video_id] = r;
        }
        available += result.available;
        unavailable += result.unavailable;
        errored += result.error;

        setProcessed(Math.min(i + batch.length, ids.length));
        setSummary({ available, unavailable, error: errored });
        onStatusUpdate({ ...statusMap });

        if (result.stopped_early) {
          const attempted = available + unavailable + errored;
          const notYetAttempted = ids.length - attempted;
          setBlockedNotice(
            `YouTube rate-limited this connection after ${attempted} video${attempted === 1 ? "" : "s"}. ` +
              `${notYetAttempted} video${notYetAttempted === 1 ? "" : "s"} not yet attempted — ` +
              `wait a while (or switch networks) and click "Fetch transcripts" again to pick up where this left off.`
          );
          break;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transcript fetch failed.");
    } finally {
      setIsRunning(false);
    }
  }

  function statusLine(): string {
    if (isRunning) {
      return `Fetching ${processed} / ${videos.length}…`;
    }
    if (summary) {
      const parts = [`${summary.available} / ${videos.length} transcripts fetched`];
      if (summary.unavailable > 0) parts.push(`${summary.unavailable} unavailable`);
      if (summary.error > 0) parts.push(`${summary.error} errored`);
      return parts.join(" · ");
    }
    return "Fetches once per video, cached forever after.";
  }

  return (
    <div className="flex flex-col gap-3 rounded-card border border-ink-700 bg-ink-900 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-display text-sm font-semibold text-mist-50">
            Transcripts
          </p>
          <p className="text-xs text-mist-400">{statusLine()}</p>
        </div>
        <button
          onClick={handleFetch}
          disabled={isRunning}
          className="shrink-0 rounded-card bg-signal px-4 py-2 font-display text-sm font-semibold text-ink-950 transition hover:bg-signal-dim disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRunning ? "Fetching…" : summary ? "Fetch again" : "Fetch transcripts"}
        </button>
      </div>
      {blockedNotice && (
        <p className="rounded-card border border-amber-dim bg-ink-800 px-3 py-2 text-xs text-amber">
          {blockedNotice}
        </p>
      )}
      {error && <p className="text-xs text-amber">{error}</p>}
    </div>
  );
}