from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    RecommendationsRequest,
    RecommendationsResponse,
    ScheduleRequest,
    ScheduleResponse,
)
from app.services.recommendations import build_recommendations
from app.services.scheduler import build_schedule

router = APIRouter()


@router.post("/recommendations", response_model=RecommendationsResponse)
async def recommendations_route(payload: RecommendationsRequest):
    recs = build_recommendations(payload.videos, payload.duplicate_clusters)
    skip_count = sum(1 for r in recs if r["action"] == "skip")
    return RecommendationsResponse(
        recommendations=recs,
        skip_count=skip_count,
        watch_count=len(recs) - skip_count,
    )


@router.post("/schedule", response_model=ScheduleResponse)
async def schedule_route(payload: ScheduleRequest):
    try:
        days = build_schedule(
            payload.videos,
            daily_minutes=payload.daily_minutes,
            speed=payload.speed,
            start_date=payload.start_date,
            study_weekdays=payload.study_weekdays,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    total_minutes = round(sum(d.total_minutes for d in days), 1)
    return ScheduleResponse(total_days=len(days), total_minutes=total_minutes, days=days)
