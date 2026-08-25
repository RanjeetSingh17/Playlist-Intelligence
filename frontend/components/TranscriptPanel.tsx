// "use client";

// import { useState } from "react";
// import { fetchTranscripts } from "@/lib/api";
// import { TranscriptResult, VideoItem } from "@/lib/types";

// interface Props {
//   videos: VideoItem[];
//   onStatusUpdate: (status: Record<string, TranscriptResult>) => void;
// }

// // The backend caps a single request at 100 and throttles internally, but we
// // also batch client-side in smaller groups so the UI can show incremental
// // progress instead of one long spinner for a big playlist.
// const BATCH_SIZE = 15;

// export default function TranscriptPanel({ videos, onStatusUpdate }: Props) {
//   const [isRunning, setIsRunning] = useState(false);
//   const [processed, setProcessed] = useState(0);
//   const [error, setError] = useState<string | null>(null);

//   async function handleFetch() {
//     setIsRunning(true);
//     setError(null);
//     setProcessed(0);

//     const statusMap: Record<string, TranscriptResult> = {};
//     const ids = videos.map((v) => v.video_id);

//     try {
//       for (let i = 0; i < ids.length; i += BATCH_SIZE) {
//         const batch = ids.slice(i, i + BATCH_SIZE);
//         const summary = await fetchTranscripts(batch);
//         for (const result of summary.results) {
//           statusMap[result.video_id] = result;
//         }
//         setProcessed(Math.min(i + batch.length, ids.length));
//         onStatusUpdate({ ...statusMap });
//       }
//     } catch (err) {
//       setError(err instanceof Error ? err.message : "Transcript fetch failed.");
//     } finally {
//       setIsRunning(false);
//     }
//   }

//   return (
//     <div className="flex flex-col gap-3 rounded-card border border-ink-700 bg-ink-900 p-4">
//       <div className="flex items-center justify-between gap-4">
//         <div>
//           <p className="font-display text-sm font-semibold text-mist-50">
//             Transcripts
//           </p>
//           <p className="text-xs text-mist-400">
//             {isRunning
//               ? `Processing ${processed} / ${videos.length}…`
//               : "Fetches once per video, cached forever after."}
//           </p>
//         </div>
//         <button
//           onClick={handleFetch}
//           disabled={isRunning}
//           className="shrink-0 rounded-card bg-signal px-4 py-2 font-display text-sm font-semibold text-ink-950 transition hover:bg-signal-dim disabled:cursor-not-allowed disabled:opacity-60"
//         >
//           {isRunning ? "Fetching…" : "Fetch transcripts"}
//         </button>
//       </div>
//       {error && <p className="text-xs text-amber">{error}</p>}
//     </div>
//   );
// }


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

export default function TranscriptPanel({
  videos,
  onStatusUpdate,
}: Props) {
  const [isRunning, setIsRunning] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, TranscriptResult>>(
    {}
  );

  async function handleFetch() {
    setIsRunning(true);
    setError(null);
    setProcessed(0);
    setSummary({ available: 0, unavailable: 0, error: 0 });
    setResults({});

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
        setSummary({
          available,
          unavailable,
          error: errored,
        });

        setResults({ ...statusMap });
        onStatusUpdate({ ...statusMap });
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Transcript fetch failed."
      );
    } finally {
      setIsRunning(false);
    }
  }

  function statusLine(): string {
    if (isRunning) {
      return `Fetching ${processed} / ${videos.length}…`;
    }

    if (summary) {
      const parts = [
        `${summary.available} / ${videos.length} transcripts fetched`,
      ];

      if (summary.unavailable > 0) {
        parts.push(`${summary.unavailable} unavailable`);
      }

      if (summary.error > 0) {
        parts.push(`${summary.error} errored`);
      }

      return parts.join(" · ");
    }

    return "Fetches once per video, cached forever after.";
  }

  const videoById = new Map(
    videos.map((video) => [video.video_id, video])
  );

  const erroredResults = Object.values(results).filter(
    (result) => result.status === "error"
  );

  return (
    <div className="flex flex-col gap-3 rounded-card border border-ink-700 bg-ink-900 p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-display text-base font-semibold text-mist-50">
            Transcripts
          </p>

          <p className="text-s text-mist-400">
            {statusLine()}
          </p>
        </div>

        <button
          onClick={handleFetch}
          disabled={isRunning}
          className="shrink-0 rounded-card bg-signal px-4 py-2 font-display text-base font-semibold text-ink-950 transition hover:bg-signal-dim disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRunning
            ? "Fetching…"
            : summary
              ? "Fetch again"
              : "Fetch transcripts"}
        </button>
      </div>

      {error && (
        <p className="text-s text-amber">
          {error}
        </p>
      )}

      {erroredResults.length > 0 && (
        <div className="mt-2 flex flex-col gap-2 border-t border-ink-700 pt-3">
          <p className="font-display text-xs font-semibold uppercase tracking-wide text-amber">
            Transcript errors
          </p>

          {erroredResults.map((result) => {
            const video = videoById.get(result.video_id);

            return (
              <div
                key={result.video_id}
                className="rounded-card border border-amber-dim bg-ink-800 p-3"
              >
                <p className="text-sm font-medium text-mist-50">
                  {video?.position !== undefined
                    ? `${video.position + 1}. `
                    : ""}
                  {video?.title ?? result.video_id}
                </p>

                <p className="mt-1 font-mono text-xs text-amber">
                  {result.error_message ?? "Unknown transcript error"}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}