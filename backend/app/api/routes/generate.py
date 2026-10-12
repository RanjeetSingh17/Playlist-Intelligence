from fastapi import APIRouter, HTTPException

from app.core.config import MissingConfigurationError
from app.db.client import get_supabase
from app.models.schemas import (
    ChatRequest,
    ChatResponse,
    StudyMaterialsRequest,
    StudyMaterialsResponse,
)
from app.services.llm_generation import (
    GroqAPIError,
    GroqRateLimitedError,
    chat_with_video,
)
from app.services.study_materials import ensure_study_materials

router = APIRouter()


@router.post("/study-materials", response_model=StudyMaterialsResponse)
async def generate_study_materials_route(payload: StudyMaterialsRequest):
    try:
        result = await ensure_study_materials(
            payload.video_id, force_regenerate=payload.force_regenerate
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except GroqRateLimitedError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except GroqAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except MissingConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return result


@router.post("/chat", response_model=ChatResponse)
async def chat_with_video_route(payload: ChatRequest):
    """Answer a question about a video using its cached transcript as context."""
    supabase = get_supabase()

    # Fetch transcript
    transcript_row = (
        supabase.table("transcripts")
        .select("full_text, status")
        .eq("video_id", payload.video_id)
        .eq("status", "available")
        .execute()
    )
    if not transcript_row.data or not transcript_row.data[0].get("full_text"):
        raise HTTPException(
            status_code=400,
            detail=(
                f"No cached transcript for video {payload.video_id}. "
                "Fetch the transcript first (step 2)."
            ),
        )
    transcript_text: str = transcript_row.data[0]["full_text"]

    # Fetch video title for the system prompt
    title_row = (
        supabase.table("videos")
        .select("title")
        .eq("video_id", payload.video_id)
        .execute()
    )
    video_title = title_row.data[0]["title"] if title_row.data else payload.video_id

    messages = [{"role": m.role, "content": m.content} for m in payload.messages]

    try:
        reply = await chat_with_video(video_title, transcript_text, messages)
    except GroqRateLimitedError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except GroqAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except MissingConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return ChatResponse(reply=reply)

