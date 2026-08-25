"""
Transcript fetching with a Postgres-backed cache.

YouTube's unofficial transcript endpoints block requests from cloud-provider
IPs fairly aggressively (see README's "Known limitation" section). This
module's strategy is:

1. Never re-fetch a video whose transcript is already cached as
   'available' or 'unavailable' — only 'error' rows (infrastructure
   problems, not content problems) are retried.
2. Throttle consecutive live requests within one batch.
3. Classify failures: a missing/disabled transcript is a permanent,
   cacheable fact about the video; an IP block is a transient
   infrastructure problem and must not be cached as if it were permanent.

Uses the current (v1+) youtube-transcript-api interface — the library
rewrote its public API around instance methods (`YouTubeTranscriptApi().fetch()`)
and removed the old static `get_transcript()` method that a lot of older
tutorials still show.
"""
import asyncio
import logging
from typing import List

from youtube_transcript_api import (
    IpBlocked,
    NoTranscriptFound,
    RequestBlocked,
    TranscriptsDisabled,
    VideoUnavailable,
    YouTubeTranscriptApi,
)

from app.db.client import get_supabase

# Courtesy delay between consecutive *live* fetches in one batch. This
# reduces (does not eliminate) the odds of tripping a rate limit — see the
# README for the honest limits of this free approach.
THROTTLE_SECONDS = 1.0

_ytt_api = YouTubeTranscriptApi()

logger = logging.getLogger(__name__)


def _get_cached_transcript(video_id: str) -> dict | None:
    supabase = get_supabase()
    result = supabase.table("transcripts").select("*").eq("video_id", video_id).execute()
    return result.data[0] if result.data else None


def _store_transcript_result(video_id: str, record: dict) -> None:
    supabase = get_supabase()
    supabase.table("transcripts").upsert({"video_id": video_id, **record}).execute()


def _fetch_one_live(video_id: str) -> dict:
    """Hits YouTube directly — no cache check. Returns a row shaped for the `transcripts` table."""
    try:
        fetched = _ytt_api.fetch(video_id, languages=["en"])
    except NoTranscriptFound:
        # No English transcript — fall back to whatever language exists
        # rather than giving up (a video with only Hindi or auto-generated
        # Spanish captions is still useful for duplicate detection later).
        try:
            transcript_list = _ytt_api.list(video_id)
            transcript = next(iter(transcript_list))
            fetched = transcript.fetch()
        except (NoTranscriptFound, TranscriptsDisabled, VideoUnavailable, StopIteration):
            return {"status": "unavailable", "error_message": "No transcript in any language."}
    except TranscriptsDisabled:
        return {"status": "unavailable", "error_message": "Captions are disabled for this video."}
    except VideoUnavailable:
        return {"status": "unavailable", "error_message": "Video is unavailable."}
    except (IpBlocked, RequestBlocked) as exc:
        logger.error(
        "YouTube transcript blocked for video %s: %s",
        video_id,
        exc,
    )

        return {
        "status": "error",
        "error_message": f"{type(exc).__name__}: blocked by YouTube. Safe to retry later.",
        }
    except Exception as exc:
        logger.exception(
        "Unexpected transcript error for video %s",
        video_id,
    )

        return {
        "status": "error",
        "error_message": f"{type(exc).__name__}: {exc}",
        }

    full_text = " ".join(snippet.text for snippet in fetched)
    return {
        "status": "available",
        "language": fetched.language,
        "language_code": fetched.language_code,
        "is_generated": fetched.is_generated,
        "segment_count": len(fetched),
        "full_text": full_text,
        "error_message": None,
    }


async def get_or_fetch_transcript(video_id: str) -> dict:
    """Cache-first: returns immediately for a cached hit, otherwise hits YouTube (in a thread, since the library is sync)."""
    cached = _get_cached_transcript(video_id)
    if cached is not None and cached["status"] in ("available", "unavailable"):
        return {**cached, "cached": True}

    record = await asyncio.to_thread(_fetch_one_live, video_id)
    _store_transcript_result(video_id, record)
    return {"video_id": video_id, **record, "cached": False}


async def fetch_transcripts_for_videos(video_ids: List[str]) -> List[dict]:
    results = []
    for i, video_id in enumerate(video_ids):
        result = await get_or_fetch_transcript(video_id)
        results.append(result)
        # Only throttle when we actually touched the network — cache hits are free.
        if not result.get("cached") and i < len(video_ids) - 1:
            await asyncio.sleep(THROTTLE_SECONDS)
    return results
