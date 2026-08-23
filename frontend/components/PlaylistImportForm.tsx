"use client";

import { FormEvent, useState } from "react";

const BASE_SPEEDS = [1, 1.25, 1.5, 2];

export interface WatchTimeSettings {
  startPosition: number;
  endPosition?: number;
  speeds: number[];
}

interface Props {
  onSubmit: (url: string, settings: WatchTimeSettings) => void;
  isLoading: boolean;
}

export default function PlaylistImportForm({ onSubmit, isLoading }: Props) {
  const [url, setUrl] = useState("");
  const [fromVideo, setFromVideo] = useState("1");
  const [toVideo, setToVideo] = useState("");
  const [extraSpeedsInput, setExtraSpeedsInput] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!url.trim()) return;

    const from = Number(fromVideo);
    const to = toVideo.trim() ? Number(toVideo) : undefined;
    if (!Number.isInteger(from) || from < 1) {
      setValidationError("Starting video must be a positive integer.");
      return;
    }
    if (to !== undefined && (!Number.isInteger(to) || to < from)) {
      setValidationError("Ending video must be a integer at or after the starting video.");
      return;
    }

    const extraSpeeds = extraSpeedsInput
      .split(",")
      .map((speed) => Number(speed.trim()))
      .filter((speed) => Number.isFinite(speed) && speed > 0 && speed <= 10);

    setValidationError(null);
    onSubmit(url.trim(), {
      startPosition: from - 1,
      endPosition: to === undefined ? undefined : to - 1,
      speeds: Array.from(new Set([...BASE_SPEEDS, ...extraSpeeds])).sort(
        (a, b) => a - b
      ),
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col rounded-card border border-ink-600 bg-ink-900 p-6 shadow-lg shadow-ink-950/10"
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/playlist?list=..."
          className="min-h-14 flex-1 rounded-card border border-ink-700 bg-ink-800 px-5 py-3 text-lg text-mist-50 placeholder:text-mist-400 focus:border-signal focus:outline-none"
          aria-label="YouTube playlist URL"
        />
        <button
          type="submit"
          disabled={isLoading}
          className="min-h-14 rounded-card bg-signal px-8 py-3 font-display text-lg font-semibold text-ink-950 transition hover:bg-signal-dim disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? "Importing…" : "Import playlist"}
        </button>
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-4 border-t border-ink-700 pt-5">
        <p className="w-full font-display text-sm font-semibold uppercase tracking-wide text-mist-400">
          Watch-time options
        </p>
        <label className="flex flex-col gap-1 text-s text-mist-400">
          From 
          <input
            type="number"
            min={1}
            value={fromVideo}
            onChange={(e) => setFromVideo(e.target.value)}
            placeholder="Start"
            className="w-48 rounded-card border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-mist-50 focus:border-signal focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-s text-mist-400">
          To 
          <input
            type="number"
            min={1}
            value={toVideo}
            onChange={(e) => setToVideo(e.target.value)}
            placeholder="End"
            className="w-48 rounded-card border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-mist-50 placeholder:text-mist-400 focus:border-signal focus:outline-none"
          />
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-s text-mist-400">
          Extra playback speeds (comma-separated)
          <input
            type="text"
            placeholder="e.g. 2.5, 3"
            value={extraSpeedsInput}
            onChange={(e) => setExtraSpeedsInput(e.target.value)}
            className="rounded-card border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-mist-50 placeholder:text-mist-400 focus:border-signal focus:outline-none"
          />
        </label>
      </div>
      {/* <p className="mt-2 text-s text-mist-400">
        Leave the ending video blank to include the rest of the playlist.
        Standard speeds (1×, 1.25×, 1.5×, and 2×) are always included.
      </p> */}
      {validationError && (
        <p className="mt-2 text-xs text-amber">{validationError}</p>
      )}
    </form>
  );
}
