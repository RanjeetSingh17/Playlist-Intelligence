"""
Prioritize/skip recommendations.

The only defensible signal available for this without inventing data that
doesn't exist yet — a real prerequisite/topic graph is step 6's job — is
duplicate-cluster membership from step 3: when several videos cover
near-identical content, watching all of them wastes time, so this
recommends keeping one and skipping the rest.

"Keep" choice: within a cluster, the longest video is kept, on the
assumption that a longer treatment of the same material is more likely to
be the complete version. That's a simple, stated heuristic — not a claim
that longer is always better.

Also has no database dependency — pure computation over data the caller
already has (the video list plus whatever duplicate_clusters step 3 found).
"""
from typing import Dict, List

from app.models.schemas import VideoItem


def build_recommendations(
    videos: List[VideoItem], duplicate_clusters: List[List[str]]
) -> List[dict]:
    video_by_id: Dict[str, VideoItem] = {v.video_id: v for v in videos}
    skip_reason: Dict[str, str] = {}

    for cluster in duplicate_clusters:
        cluster_videos = [video_by_id[vid] for vid in cluster if vid in video_by_id]
        if len(cluster_videos) < 2:
            continue
        keeper = max(cluster_videos, key=lambda v: v.duration_seconds)
        for v in cluster_videos:
            if v.video_id != keeper.video_id:
                skip_reason[v.video_id] = f'Near-duplicate of "{keeper.title}"'

    recommendations: List[dict] = []
    for video in videos:
        if video.video_id in skip_reason:
            recommendations.append(
                {
                    "video_id": video.video_id,
                    "action": "skip",
                    "reason": skip_reason[video.video_id],
                }
            )
        else:
            recommendations.append(
                {"video_id": video.video_id, "action": "watch", "reason": None}
            )
    return recommendations
