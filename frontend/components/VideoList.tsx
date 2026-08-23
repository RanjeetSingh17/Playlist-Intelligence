import { DifficultyScore, TranscriptResult, VideoItem } from "@/lib/types";
import { formatDuration } from "@/lib/format";

interface Props {
  videos: VideoItem[];
  transcriptStatus?: Record<string, TranscriptResult>;
  difficulty?: Record<string, DifficultyScore>;
}

const STATUS_DOT_STYLES: Record<string, string> = {
  available: "bg-signal",
  unavailable: "bg-mist-400",
  error: "bg-amber",
};

const DIFFICULTY_TEXT_STYLES: Record<string, string> = {
  easy: "text-signal",
  medium: "text-mist-200",
  hard: "text-amber",
};

export default function VideoList({ videos, transcriptStatus, difficulty }: Props) {
  return (
    <ol className="flex flex-col divide-y divide-ink-700 rounded-card border border-ink-700 bg-ink-800">
      {videos.map((video) => {
        const status = transcriptStatus?.[video.video_id];
        const score = difficulty?.[video.video_id];
        return (
          <li key={video.video_id} className="flex items-center gap-4 p-4">
            <span className="w-6 shrink-0 text-right font-mono text-base text-mist-400">
              {video.position + 1}
            </span>
            {/* Plain <img> is intentional here — avoids next/image's remote
                domain allowlist config for a thumbnail host that never changes. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={video.thumbnail_url}
              alt=""
              className="h-12 w-20 shrink-0 rounded object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-medium text-mist-50">
                {video.title}
              </p>
              <p className="truncate text-xs text-mist-400">
                {video.channel_title}
              </p>
            </div>
            {score && score.difficulty_label !== "unknown" && (
              <span
                title={`Flesch reading ease: ${score.flesch_reading_ease ?? "n/a"}`}
                className={`shrink-0 font-mono text-s uppercase ${DIFFICULTY_TEXT_STYLES[score.difficulty_label]}`}
              >
                {score.difficulty_label}
              </span>
            )}
            {status && (
              <span
                title={`Transcript: ${status.status}${
                  status.error_message ? ` — ${status.error_message}` : ""
                }`}
                className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT_STYLES[status.status]}`}
              />
            )}
            <span className="shrink-0 font-mono text-base text-mist-400">
              {formatDuration(video.duration_seconds)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
