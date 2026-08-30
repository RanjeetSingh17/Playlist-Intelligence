"""
Transcript fetching with a Postgres-backed cache.

YouTube's unofficial transcript endpoints rate-limit requests fairly
aggressively — confirmed in practice, not just in theory: a long playlist
(many videos fetched back-to-back) reliably triggers `IpBlocked` partway
through, even from an ordinary home connection. This module's strategy:

1. Never re-fetch a video whose transcript is already cached as
   'available' or 'unavailable' — only 'error' rows (infrastructure
   problems, not content problems) are retried.
2. Throttle consecutive live requests within one batch, with jitter so the
   request pattern isn't perfectly periodic.
3. Classify failures: a missing/disabled transcript is a permanent,
   cacheable fact about the video; an IP block is a transient
   infrastructure problem and must not be cached as if it were permanent.
4. CIRCUIT BREAKER: the instant a live fetch hits IpBlocked or
   RequestBlocked, every remaining video in the current call is left
   completely untouched — not attempted, not written to the cache as an
   error — and the function returns immediately.
5. Optional proxy support via WEBSHARE_PROXY_USERNAME/PASSWORD.

IMPORTANT — the fallback-language path shares the SAME exception handling
as the primary fetch, deliberately. When a video has no transcript in the
requested language, the code below falls back to whatever language IS
available (`_ytt_api.list()` + `transcript.fetch()`). That fallback call
hits the network exactly like the primary one, and can fail the exact same
ways — including IpBlocked. An earlier version of this file gave the
fallback its own narrower `except (NoTranscriptFound, StopIteration):`
that didn't account for that, so an IpBlocked hit during the fallback went
completely uncaught and crashed the request (which then showed up in the
browser as a misleading CORS error, since a raw unhandled crash doesn't
get the usual response headers attached). Nesting the fallback inside the
same outer try block, with only NoTranscriptFound special-cased to trigger
it, closes that gap — anything else the fallback raises now falls through
to the same handlers as the primary call.
"""
import asyncio
import random
from typing import Dict, List, Optional

from youtube_transcript_api import (
    IpBlocked,
    NoTranscriptFound,
    RequestBlocked,
    TranscriptsDisabled,
    VideoUnavailable,
    YouTubeTranscriptApi,
)
from youtube_transcript_api.proxies import WebshareProxyConfig

from app.core.config import settings
from app.db.client import get_supabase

THROTTLE_SECONDS = 2.0
THROTTLE_JITTER_SECONDS = 1.5


def _build_api() -> YouTubeTranscriptApi:
    if settings.WEBSHARE_PROXY_USERNAME and settings.WEBSHARE_PROXY_PASSWORD:
        return YouTubeTranscriptApi(
            proxy_config=WebshareProxyConfig(
                proxy_username=settings.WEBSHARE_PROXY_USERNAME,
                proxy_password=settings.WEBSHARE_PROXY_PASSWORD,
            )
        )
    return YouTubeTranscriptApi()


_ytt_api = _build_api()


def _get_cached_transcript(video_id: str) -> Optional[dict]:
    supabase = get_supabase()
    result = supabase.table("transcripts").select("*").eq("video_id", video_id).execute()
    return result.data[0] if result.data else None


def _store_transcript_result(video_id: str, record: dict) -> None:
    supabase = get_supabase()
    supabase.table("transcripts").upsert({"video_id": video_id, **record}).execute()


def _fetch_one_live(video_id: str) -> dict:
    """Hits YouTube directly — no cache check. Returns a dict with a
    `blocked` key used only for in-process circuit-breaker signaling
    (popped off before anything is written to the database)."""
    try:
        try:
            fetched = _ytt_api.fetch(video_id, languages=["en"])
        except NoTranscriptFound:
            # Fallback: no English transcript — grab whatever language IS
            # available instead. This makes its own network call and can
            # fail exactly the same ways as the primary fetch, so it stays
            # inside this same outer try block rather than having its own
            # separate (and previously incomplete) exception handling.
            transcript_list = _ytt_api.list(video_id)
            transcript = next(iter(transcript_list))
            fetched = transcript.fetch()
    except (NoTranscriptFound, StopIteration):
        return {
            "status": "unavailable",
            "blocked": False,
            "error_message": "No transcript in any language.",
        }
    except TranscriptsDisabled:
        return {
            "status": "unavailable",
            "blocked": False,
            "error_message": "Captions are disabled for this video.",
        }
    except VideoUnavailable:
        return {"status": "unavailable", "blocked": False, "error_message": "Video is unavailable."}
    except (IpBlocked, RequestBlocked) as exc:
        return {
            "status": "error",
            "blocked": True,
            "error_message": f"{type(exc).__name__}: blocked by YouTube. Safe to retry later.",
        }
    except Exception as exc:  # noqa: BLE001 — last-resort catch; this is an unofficial API
        return {"status": "error", "blocked": False, "error_message": f"{type(exc).__name__}: {exc}"}

    full_text = " ".join(snippet.text for snippet in fetched)
    return {
        "status": "available",
        "blocked": False,
        "language": fetched.language,
        "language_code": fetched.language_code,
        "is_generated": fetched.is_generated,
        "segment_count": len(fetched),
        "full_text": full_text,
        "error_message": None,
    }


async def get_or_fetch_transcript(video_id: str) -> dict:
    cached = _get_cached_transcript(video_id)
    if cached is not None and cached["status"] in ("available", "unavailable"):
        return {**cached, "cached": True, "blocked": False}

    record = await asyncio.to_thread(_fetch_one_live, video_id)
    blocked = record.pop("blocked", False)
    _store_transcript_result(video_id, record)
    return {"video_id": video_id, **record, "cached": False, "blocked": blocked}


async def fetch_transcripts_for_videos(video_ids: List[str]) -> Dict:
    results: List[dict] = []
    stopped_early = False
    skipped_video_ids: List[str] = []

    for i, video_id in enumerate(video_ids):
        result = await get_or_fetch_transcript(video_id)
        results.append(result)

        if result.get("blocked"):
            stopped_early = True
            skipped_video_ids = video_ids[i + 1 :]
            break

        if not result.get("cached") and i < len(video_ids) - 1:
            await asyncio.sleep(THROTTLE_SECONDS + random.uniform(0, THROTTLE_JITTER_SECONDS))

    return {
        "results": results,
        "stopped_early": stopped_early,
        "skipped_video_ids": skipped_video_ids,
    }