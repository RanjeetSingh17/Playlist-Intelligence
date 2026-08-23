from fastapi import APIRouter, HTTPException

from app.core.config import MissingConfigurationError
from app.models.schemas import (
    TranscriptFetchRequest,
    TranscriptFetchSummary,
    TranscriptResult,
)
from app.services.transcripts import fetch_transcripts_for_videos

router = APIRouter()

# Keeps a single request bounded — the frontend calls this in smaller
# batches anyway so it can show incremental progress, but the backend
# enforces its own ceiling regardless of what a client sends.
MAX_VIDEOS_PER_REQUEST = 100


@router.post("/fetch", response_model=TranscriptFetchSummary)
async def fetch_transcripts_route(payload: TranscriptFetchRequest):
    if not payload.video_ids:
        raise HTTPException(status_code=400, detail="video_ids must not be empty.")

    video_ids = payload.video_ids[:MAX_VIDEOS_PER_REQUEST]
    try:
        raw_results = await fetch_transcripts_for_videos(video_ids)
    except MissingConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    results = [
        TranscriptResult(
            video_id=r["video_id"],
            status=r["status"],
            language=r.get("language"),
            segment_count=r.get("segment_count"),
            error_message=r.get("error_message"),
            cached=r.get("cached", False),
        )
        for r in raw_results
    ]

    return TranscriptFetchSummary(
        requested=len(video_ids),
        available=sum(1 for r in results if r.status == "available"),
        unavailable=sum(1 for r in results if r.status == "unavailable"),
        error=sum(1 for r in results if r.status == "error"),
        cached_hits=sum(1 for r in results if r.cached),
        results=results,
        truncated=len(payload.video_ids) > MAX_VIDEOS_PER_REQUEST,
    )
