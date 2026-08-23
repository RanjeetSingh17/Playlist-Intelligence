"""
Persistence layer for playlists and videos.

This wraps app.services.youtube (unchanged from step 1) with a Postgres
cache: a repeat import of the same playlist reads from the database instead
of hitting the YouTube API again, and every video gets a stable row that
later steps (transcripts, embeddings, difficulty scores) key off of by
video_id.
"""
from typing import Optional, Tuple

from app.db.client import get_supabase
from app.models.schemas import VideoItem
from app.services.youtube import (
    compute_watch_time,
    extract_playlist_id,
    import_playlist as fetch_playlist_from_youtube,
)


async def get_cached_playlist(playlist_id: str) -> Optional[dict]:
    supabase = get_supabase()

    playlist_row = (
        supabase.table("playlists")
        .select("*")
        .eq("playlist_id", playlist_id)
        .execute()
    )
    if not playlist_row.data:
        return None
    playlist = playlist_row.data[0]

    joined = (
        supabase.table("playlist_videos")
        .select("position, videos(*)")
        .eq("playlist_id", playlist_id)
        .order("position")
        .execute()
    )

    videos = [
        VideoItem(
            video_id=row["videos"]["video_id"],
            position=row["position"],
            title=row["videos"]["title"],
            channel_title=row["videos"]["channel_title"],
            thumbnail_url=row["videos"]["thumbnail_url"],
            duration_seconds=row["videos"]["duration_seconds"],
        )
        for row in joined.data
    ]

    return {
        "playlist_id": playlist["playlist_id"],
        "playlist_title": playlist["title"],
        "video_count": playlist["video_count"],
        "unavailable_count": playlist["unavailable_count"],
        "total_duration_seconds": playlist["total_duration_seconds"],
        "watch_time_by_speed": compute_watch_time(playlist["total_duration_seconds"]),
        "videos": videos,
    }


def _persist_playlist(result: dict) -> None:
    supabase = get_supabase()

    supabase.table("playlists").upsert(
        {
            "playlist_id": result["playlist_id"],
            "title": result["playlist_title"],
            "video_count": result["video_count"],
            "unavailable_count": result["unavailable_count"],
            "total_duration_seconds": result["total_duration_seconds"],
        }
    ).execute()

    videos: list[VideoItem] = result["videos"]
    if not videos:
        return

    supabase.table("videos").upsert(
        [
            {
                "video_id": v.video_id,
                "title": v.title,
                "channel_title": v.channel_title,
                "thumbnail_url": v.thumbnail_url,
                "duration_seconds": v.duration_seconds,
            }
            for v in videos
        ]
    ).execute()

    supabase.table("playlist_videos").upsert(
        [
            {
                "playlist_id": result["playlist_id"],
                "video_id": v.video_id,
                "position": v.position,
            }
            for v in videos
        ]
    ).execute()


async def import_and_persist_playlist(
    url_or_id: str, refresh: bool = False
) -> Tuple[dict, bool]:
    """Returns (result_dict, was_cached)."""
    playlist_id = extract_playlist_id(url_or_id)

    if not refresh:
        cached = await get_cached_playlist(playlist_id)
        if cached is not None:
            return cached, True

    result = await fetch_playlist_from_youtube(url_or_id)
    _persist_playlist(result)
    return result, False
