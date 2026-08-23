"""
Orchestrates step 3: for a batch of videos that already have a cached
transcript (step 2), compute — or read from cache — an embedding and a
difficulty score for each, then derive duplicate clusters across the batch.

Embeddings and difficulty scores are cached permanently once computed
(deterministic given the same transcript text and model), the same caching
philosophy as transcripts in step 2. Duplicate clusters are NOT cached —
they're cheap to recompute (brute-force cosine similarity over at most a
few hundred videos is instant) and caching them would mean invalidating
that cache every time a new video's embedding is added, for no real benefit.
"""
import asyncio
from typing import Dict, List

from app.db.client import get_supabase
from app.services.difficulty import compute_difficulty
from app.services.embeddings import MODEL_NAME, find_duplicate_clusters, generate_video_embedding

DEFAULT_DUPLICATE_THRESHOLD = 0.87


def _get_available_transcripts(video_ids: List[str]) -> Dict[str, str]:
    supabase = get_supabase()
    result = (
        supabase.table("transcripts")
        .select("video_id, full_text, status")
        .in_("video_id", video_ids)
        .eq("status", "available")
        .execute()
    )
    return {row["video_id"]: row["full_text"] for row in result.data if row["full_text"]}


def _get_cached_embeddings(video_ids: List[str]) -> Dict[str, List[float]]:
    if not video_ids:
        return {}
    supabase = get_supabase()
    result = (
        supabase.table("embeddings")
        .select("video_id, embedding")
        .in_("video_id", video_ids)
        .execute()
    )
    return {row["video_id"]: row["embedding"] for row in result.data}


def _store_embedding(video_id: str, embedding: List[float]) -> None:
    supabase = get_supabase()
    supabase.table("embeddings").upsert(
        {
            "video_id": video_id,
            "embedding": embedding,
            "model_name": MODEL_NAME,
            "dimensions": len(embedding),
        }
    ).execute()


def _get_cached_difficulty(video_ids: List[str]) -> Dict[str, dict]:
    if not video_ids:
        return {}
    supabase = get_supabase()
    result = (
        supabase.table("difficulty_scores").select("*").in_("video_id", video_ids).execute()
    )
    return {row["video_id"]: row for row in result.data}


def _store_difficulty(video_id: str, scores: dict) -> None:
    supabase = get_supabase()
    supabase.table("difficulty_scores").upsert({"video_id": video_id, **scores}).execute()


async def ensure_analyzed(video_ids: List[str]) -> dict:
    """
    Computes and caches an embedding + difficulty score for each video_id
    that has an available transcript. Safe to call in small batches — each
    video's computation is independent and idempotent (a cache hit just
    returns immediately).

    Deliberately does NOT do duplicate clustering here. Clustering needs to
    see every embedding at once to compare correctly — if this function
    were called in batches of, say, 8 videos and clustered within each call,
    two duplicate videos that happened to land in different batches would
    never be compared against each other and the duplicate would be missed
    entirely. Call find_duplicates_for_videos() separately, once, after
    every video you care about has been analyzed.
    """
    transcripts = _get_available_transcripts(video_ids)
    skipped = [vid for vid in video_ids if vid not in transcripts]

    cached_embeddings = _get_cached_embeddings(list(transcripts.keys()))
    cached_difficulty = _get_cached_difficulty(list(transcripts.keys()))

    difficulty: Dict[str, dict] = {}

    for video_id, text in transcripts.items():
        if video_id not in cached_embeddings:
            # Model inference is CPU-bound and synchronous — run it in a
            # thread so it doesn't block the event loop for other requests.
            vector = await asyncio.to_thread(generate_video_embedding, text)
            _store_embedding(video_id, vector)

        if video_id in cached_difficulty:
            difficulty[video_id] = cached_difficulty[video_id]
        else:
            scores = compute_difficulty(text)
            _store_difficulty(video_id, scores)
            difficulty[video_id] = {"video_id": video_id, **scores}

    return {
        "analyzed": list(transcripts.keys()),
        "skipped_no_transcript": skipped,
        "difficulty": difficulty,
    }


def find_duplicates_for_videos(
    video_ids: List[str], duplicate_threshold: float = DEFAULT_DUPLICATE_THRESHOLD
) -> List[List[str]]:
    """
    Reads whichever embeddings are already cached for these video_ids (call
    ensure_analyzed() first for any that haven't been computed yet — this
    function silently skips ones with no cached embedding rather than
    computing them) and clusters them. Cheap: just a DB read plus in-memory
    math, no model inference, so it's fine to call with the full video list
    in one request even though ensure_analyzed() needed batching.
    """
    embeddings = _get_cached_embeddings(video_ids)
    return find_duplicate_clusters(embeddings, threshold=duplicate_threshold)
