"""
YouTube Data API v3 integration: playlist import + watch-time calculation.

No YouTube client library is used on purpose — the raw REST endpoints are
simple enough that adding google-api-python-client would be a heavier
dependency than this app needs.
"""
import re
from typing import Dict, List, Optional, Tuple

import httpx

from app.core.config import settings
from app.models.schemas import VideoItem, WatchTimeBreakdown

YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3"
DEFAULT_SPEEDS = [1.0, 1.25, 1.5, 2.0]

# Matches a raw playlist ID (they start with PL, UU, LL, FL, RD, or OL).
_PLAYLIST_ID_RE = re.compile(r"^(PL|UU|LL|FL|RD|OL)[\w-]{10,}$")
_ISO8601_DURATION_RE = re.compile(r"^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$")


class YouTubeAPIError(Exception):
    """Raised when the YouTube Data API returns an error response."""


class InvalidPlaylistURLError(Exception):
    """Raised when a playlist ID can't be extracted from user input."""


def extract_playlist_id(url_or_id: str) -> str:
    """
    Accepts a full playlist URL, a "watch?v=...&list=..." URL, or a raw
    playlist ID, and returns the playlist ID.
    """
    candidate = url_or_id.strip()

    if _PLAYLIST_ID_RE.match(candidate):
        return candidate

    match = re.search(r"[?&]list=([\w-]+)", candidate)
    if match:
        return match.group(1)

    raise InvalidPlaylistURLError(
        f"Couldn't find a playlist ID in '{url_or_id}'. Paste a full playlist "
        "URL (e.g. https://www.youtube.com/playlist?list=...) or the raw "
        "playlist ID (starts with PL, UU, LL, FL, RD, or OL)."
    )


def parse_iso8601_duration(duration: str) -> int:
    """Converts a YouTube ISO 8601 duration (e.g. 'PT1H2M3S') to seconds."""
    match = _ISO8601_DURATION_RE.match(duration)
    if not match:
        return 0
    hours, minutes, seconds = (int(g) if g else 0 for g in match.groups())
    return hours * 3600 + minutes * 60 + seconds


def format_seconds(total_seconds: int) -> str:
    """Formats a second count as e.g. '12h 34m', '45m 3s', or '30s'."""
    hours, remainder = divmod(total_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    if hours:
        return f"{hours}h {minutes}m"
    if minutes:
        return f"{minutes}m {seconds}s"
    return f"{seconds}s"


def compute_watch_time(
    total_seconds: int, speeds: Optional[List[float]] = None
) -> List[WatchTimeBreakdown]:
    speeds = speeds or DEFAULT_SPEEDS
    breakdown = []
    for speed in speeds:
        adjusted = int(round(total_seconds / speed))
        breakdown.append(
            WatchTimeBreakdown(
                speed=speed,
                total_seconds=adjusted,
                formatted=format_seconds(adjusted),
            )
        )
    return breakdown


async def _get(client: httpx.AsyncClient, path: str, params: dict) -> dict:
    params = {**params, "key": settings.require("YOUTUBE_API_KEY")}
    response = await client.get(f"{YOUTUBE_API_BASE}/{path}", params=params)
    data = response.json()
    if response.status_code != 200:
        message = data.get("error", {}).get("message", "Unknown YouTube API error")
        raise YouTubeAPIError(f"YouTube API error ({response.status_code}): {message}")
    return data


async def fetch_playlist_title(client: httpx.AsyncClient, playlist_id: str) -> str:
    data = await _get(client, "playlists", {"part": "snippet", "id": playlist_id})
    items = data.get("items", [])
    if not items:
        raise YouTubeAPIError(
            "Playlist not found. It may be private, deleted, or the ID is wrong."
        )
    return items[0]["snippet"]["title"]


async def fetch_playlist_items(
    client: httpx.AsyncClient, playlist_id: str
) -> List[Dict]:
    """
    Returns [{video_id, position}, ...] for every item in the playlist,
    following pagination. Deleted/private videos still show up here — we
    filter them out later once we cross-check against videos.list.
    """
    items: List[Dict] = []
    page_token = None

    while True:
        params = {"part": "snippet", "playlistId": playlist_id, "maxResults": 50}
        if page_token:
            params["pageToken"] = page_token

        data = await _get(client, "playlistItems", params)

        for entry in data.get("items", []):
            snippet = entry["snippet"]
            video_id = snippet.get("resourceId", {}).get("videoId")
            if not video_id:
                continue
            items.append(
                {"video_id": video_id, "position": snippet.get("position", len(items))}
            )

        page_token = data.get("nextPageToken")
        if not page_token:
            break

    return items


async def fetch_video_details(
    client: httpx.AsyncClient, video_ids: List[str]
) -> Dict[str, Dict]:
    """
    Batches video_ids into groups of 50 (the API's max per request) and
    fetches duration + display metadata for each. Private or deleted videos
    simply won't appear in the response — that's how we detect them.
    """
    details: Dict[str, Dict] = {}

    for batch_start in range(0, len(video_ids), 50):
        batch = video_ids[batch_start : batch_start + 50]
        data = await _get(
            client, "videos", {"part": "snippet,contentDetails", "id": ",".join(batch)}
        )
        for item in data.get("items", []):
            snippet = item["snippet"]
            thumbnails = snippet.get("thumbnails", {})
            details[item["id"]] = {
                "title": snippet["title"],
                "channel_title": snippet["channelTitle"],
                "thumbnail_url": (
                    thumbnails.get("medium", {}).get("url")
                    or thumbnails.get("default", {}).get("url", "")
                ),
                "duration_seconds": parse_iso8601_duration(
                    item["contentDetails"]["duration"]
                ),
            }

    return details


async def import_playlist(url_or_id: str) -> dict:
    """
    Full pipeline: URL -> playlist ID -> items -> video details -> watch-time
    breakdown. Returns a plain dict shaped like PlaylistImportResponse.
    """
    playlist_id = extract_playlist_id(url_or_id)

    async with httpx.AsyncClient(timeout=15.0) as client:
        playlist_title = await fetch_playlist_title(client, playlist_id)
        items = await fetch_playlist_items(client, playlist_id)
        details = await fetch_video_details(client, [i["video_id"] for i in items])

    videos: List[VideoItem] = []
    for item in sorted(items, key=lambda i: i["position"]):
        detail = details.get(item["video_id"])
        if detail is None:
            continue  # private, deleted, or region-blocked
        videos.append(
            VideoItem(
                video_id=item["video_id"],
                position=item["position"],
                title=detail["title"],
                channel_title=detail["channel_title"],
                thumbnail_url=detail["thumbnail_url"],
                duration_seconds=detail["duration_seconds"],
            )
        )

    total_seconds = sum(v.duration_seconds for v in videos)

    return {
        "playlist_id": playlist_id,
        "playlist_title": playlist_title,
        "video_count": len(videos),
        "unavailable_count": len(items) - len(videos),
        "total_duration_seconds": total_seconds,
        "watch_time_by_speed": compute_watch_time(total_seconds),
        "videos": videos,
    }

# Added after second version 
def filter_videos_by_range(
    videos: List[VideoItem],
    start_position: Optional[int] = None,
    end_position: Optional[int] = None,
) -> List[VideoItem]:
    """
    Selects the videos whose `position` falls within [start_position,
    end_position] inclusive. Both bounds are optional — omitting either
    (or both) defaults to that end of the playlist, which is how "no range
    specified = whole playlist" is implemented: this function just doesn't
    filter anything out in that case.

    Positions are matched against the *actual* positions present in
    `videos` (0-indexed), not assumed to be contiguous from 0 — a playlist
    with unavailable videos removed during import can have gaps.
    """
    if not videos:
        return []

    positions = [v.position for v in videos]
    min_pos, max_pos = min(positions), max(positions)

    resolved_start = start_position if start_position is not None else min_pos
    resolved_end = end_position if end_position is not None else max_pos

    if resolved_start > resolved_end:
        raise ValueError(
            f"start_position ({resolved_start}) must be <= end_position ({resolved_end})."
        )

    return [v for v in videos if resolved_start <= v.position <= resolved_end]