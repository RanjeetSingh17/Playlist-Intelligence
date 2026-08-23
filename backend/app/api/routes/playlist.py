from fastapi import APIRouter, HTTPException
from app.services.youtube import compute_watch_time, filter_videos_by_range

from app.core.config import MissingConfigurationError
from app.models.schemas import PlaylistImportRequest, PlaylistImportResponse ,WatchTimeRequest, WatchTimeResponse # second version
from app.services.playlist_store import import_and_persist_playlist
from app.services.youtube import InvalidPlaylistURLError, YouTubeAPIError

router = APIRouter()


@router.post("/import", response_model=PlaylistImportResponse)
async def import_playlist_route(payload: PlaylistImportRequest):
    try:
        result, was_cached = await import_and_persist_playlist(
            payload.url, refresh=payload.refresh
        )
    except InvalidPlaylistURLError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except YouTubeAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except MissingConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {**result, "cached": was_cached}

# Second version

@router.post("/watch-time", response_model=WatchTimeResponse)
async def watch_time_route(payload: WatchTimeRequest):
    """
    Recomputes watch time for an optional sub-range of the playlist at an
    optional custom set of speeds. Omitting start_position/end_position
    means the whole playlist (the required default); omitting speeds means
    the standard 1x/1.25x/1.5x/2x set.
    """
    try:
        selected = filter_videos_by_range(
            payload.videos, payload.start_position, payload.end_position
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not selected:
        raise HTTPException(status_code=400, detail="No videos found in the specified range.")

    total_seconds = sum(v.duration_seconds for v in selected)
    breakdown = compute_watch_time(total_seconds, payload.speeds)

    return WatchTimeResponse(
        video_count=len(selected),
        total_duration_seconds=total_seconds,
        watch_time_by_speed=breakdown,
        start_position=min(v.position for v in selected),
        end_position=max(v.position for v in selected),
    )