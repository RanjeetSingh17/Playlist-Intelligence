"""
Persistence + orchestration for step 4. LLM output is cached permanently
once generated — regenerating costs real (if free-tier) Groq quota, so a
cache hit must never silently re-call the API. Regeneration only happens
when explicitly requested (`force_regenerate=True`).
"""
from typing import Optional

from app.db.client import get_supabase
from app.services.llm_generation import MODEL_NAME, generate_study_materials


def get_cached_study_materials(video_id: str) -> Optional[dict]:
    supabase = get_supabase()
    result = (
        supabase.table("study_materials").select("*").eq("video_id", video_id).execute()
    )
    return result.data[0] if result.data else None


def _store_study_materials(video_id: str, materials: dict) -> None:
    supabase = get_supabase()
    supabase.table("study_materials").upsert(
        {
            "video_id": video_id,
            "model_name": MODEL_NAME,
            "summary": materials["summary"],
            "notes": materials["notes"],
            "flashcards": materials["flashcards"],
            "quiz": materials["quiz"],
        }
    ).execute()


def _get_transcript(video_id: str) -> Optional[str]:
    supabase = get_supabase()
    result = (
        supabase.table("transcripts")
        .select("full_text, status")
        .eq("video_id", video_id)
        .eq("status", "available")
        .execute()
    )
    if not result.data or not result.data[0].get("full_text"):
        return None
    return result.data[0]["full_text"]


def _get_video_title(video_id: str) -> str:
    supabase = get_supabase()
    result = supabase.table("videos").select("title").eq("video_id", video_id).execute()
    return result.data[0]["title"] if result.data else video_id


async def ensure_study_materials(video_id: str, force_regenerate: bool = False) -> dict:
    if not force_regenerate:
        cached = get_cached_study_materials(video_id)
        if cached is not None:
            return {**cached, "cached": True}

    transcript_text = _get_transcript(video_id)
    if transcript_text is None:
        raise ValueError(
            f"No cached transcript for video {video_id} — fetch its transcript first (step 2)."
        )

    title = _get_video_title(video_id)
    materials = await generate_study_materials(title, transcript_text)
    _store_study_materials(video_id, materials)

    return {
        "video_id": video_id,
        "model_name": MODEL_NAME,
        "summary": materials["summary"],
        "notes": materials["notes"],
        "flashcards": materials["flashcards"],
        "quiz": materials["quiz"],
        "cached": False,
    }
