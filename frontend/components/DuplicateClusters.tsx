import { VideoItem } from "@/lib/types";

interface Props {
  clusters: string[][];
  videos: VideoItem[];
}

export default function DuplicateClusters({ clusters, videos }: Props) {
  if (clusters.length === 0) return null;

  const titleByVideoId = new Map(videos.map((v) => [v.video_id, v.title]));

  return (
    <div className="flex flex-col gap-3 rounded-card border border-amber-dim bg-ink-900 p-5">
      <div>
        <p className="font-display text-base font-semibold text-mist-50">
          Possible duplicates
        </p>
        <p className="text-s text-mist-400">
          These videos have highly similar transcript content.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {clusters.map((cluster, i) => (
          <div key={i} className="flex flex-col gap-1 rounded-card bg-ink-800 p-3">
            {cluster.map((videoId) => (
              <p key={videoId} className="truncate text-base text-mist-200">
                {titleByVideoId.get(videoId) ?? videoId}
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
