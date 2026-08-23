from fastapi import APIRouter, HTTPException

from app.core.config import MissingConfigurationError
from app.models.schemas import (
    AnalyzeComputeRequest,
    AnalyzeComputeResponse,
    DifficultyScore,
    DuplicatesRequest,
    DuplicatesResponse,
)
from app.services.analysis import ensure_analyzed, find_duplicates_for_videos

router = APIRouter()

MAX_VIDEOS_PER_REQUEST = 100


@router.post("/compute", response_model=AnalyzeComputeResponse)
async def compute_route(payload: AnalyzeComputeRequest):
    """Computes + caches embeddings and difficulty for a batch of videos.
    Call this in small batches for a large playlist to avoid one very
    long-running request — then call /duplicates once, over the full list,
    to cluster."""
    if not payload.video_ids:
        raise HTTPException(status_code=400, detail="video_ids must not be empty.")

    video_ids = payload.video_ids[:MAX_VIDEOS_PER_REQUEST]
    try:
        result = await ensure_analyzed(video_ids)
    except MissingConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    difficulty_list = [
        DifficultyScore(
            video_id=vid,
            flesch_reading_ease=scores.get("flesch_reading_ease"),
            flesch_kincaid_grade=scores.get("flesch_kincaid_grade"),
            technical_density=scores.get("technical_density"),
            difficulty_score=scores.get("difficulty_score"),
            difficulty_label=scores.get("difficulty_label", "unknown"),
        )
        for vid, scores in result["difficulty"].items()
    ]

    return AnalyzeComputeResponse(
        analyzed=result["analyzed"],
        skipped_no_transcript=result["skipped_no_transcript"],
        difficulty=difficulty_list,
    )


@router.post("/duplicates", response_model=DuplicatesResponse)
async def duplicates_route(payload: DuplicatesRequest):
    """Clusters whichever of the given videos already have a cached
    embedding. Cheap — call this once with the full video list, after
    /compute has been run (possibly in several batches) for all of them."""
    if not payload.video_ids:
        raise HTTPException(status_code=400, detail="video_ids must not be empty.")

    try:
        clusters = find_duplicates_for_videos(
            payload.video_ids, duplicate_threshold=payload.duplicate_threshold
        )
    except MissingConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return DuplicatesResponse(duplicate_clusters=clusters)
