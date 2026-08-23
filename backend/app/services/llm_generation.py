"""
LLM-generated study materials (notes, flashcards, quiz) via Groq's free
tier. Uses Groq's OpenAI-compatible REST endpoint directly with httpx,
rather than the `groq` SDK, to stay consistent with how the rest of this
backend talks to external APIs (see services/youtube.py) and to avoid an
extra dependency for what is, in the end, one POST request.

MODEL CHOICE — read this before assuming the model name below is stale:
Groq deprecated `llama-3.3-70b-versatile` and `llama-3.1-8b-instant` — the
two models almost every Groq tutorial and blog post uses — with a shutdown
date of 2026-08-16. This uses `openai/gpt-oss-120b`, Groq's current
featured flagship open-weight model, instead. Model churn is a fact of life
on Groq (they've deprecated a model roughly every 1-2 months through 2026);
if this model is ever retired in turn, check
https://console.groq.com/docs/models and update MODEL_NAME.

RELIABILITY — this uses Groq's Structured Outputs in strict mode
(`response_format.json_schema.strict: true`), which constrains decoding so
the response is *guaranteed* to be valid JSON matching RESPONSE_SCHEMA
below. That eliminates an entire category of bugs (markdown-fenced JSON,
truncated JSON, extra prose before/after the JSON) that a plain "please
respond in JSON" prompt would need retry logic to handle.

RATE LIMITS — the free tier gives this model roughly 8,000 tokens/minute
(see README). A single call here can easily use 3,000-5,000 tokens between
the transcript, the schema, and the output, so *token* budget — not request
count — is the real constraint. MIN_SECONDS_BETWEEN_CALLS enforces a
conservative gap between calls for that reason. This is a per-process
in-memory throttle, correct for the single-user local setup this project
assumes, but it would need to move to something shared (e.g. Redis) to
work correctly across multiple server processes or a multi-user deployment.
"""
import asyncio
import json
import time
from typing import Optional

import httpx

from app.core.config import settings

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
MODEL_NAME = "openai/gpt-oss-120b"

MIN_SECONDS_BETWEEN_CALLS = 25
MAX_TRANSCRIPT_WORDS = 2000
MAX_COMPLETION_TOKENS = 2000

_last_call_at: float = 0.0
_throttle_lock = asyncio.Lock()

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "notes": {"type": "array", "items": {"type": "string"}},
        "flashcards": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "question": {"type": "string"},
                    "answer": {"type": "string"},
                },
                "required": ["question", "answer"],
                "additionalProperties": False,
            },
        },
        "quiz": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "question": {"type": "string"},
                    "options": {"type": "array", "items": {"type": "string"}},
                    "correct_index": {"type": "integer"},
                    "explanation": {"type": "string"},
                },
                "required": ["question", "options", "correct_index", "explanation"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["summary", "notes", "flashcards", "quiz"],
    "additionalProperties": False,
}

SYSTEM_PROMPT = (
    "You are a study assistant that converts a video transcript into structured "
    "study materials. Base every fact strictly on the transcript provided — never "
    "invent information that isn't in it. Write a 2-3 sentence summary, 6-10 concise "
    "study notes, 6-8 flashcards (question + answer), and 5 multiple-choice quiz "
    "questions (4 options each, with the 0-indexed correct answer and a one-sentence "
    "explanation). If the transcript is too short or unclear to support this, produce "
    "fewer items rather than inventing content."
)


class GroqAPIError(Exception):
    """Raised when the Groq API returns a non-recoverable error."""


class GroqRateLimitedError(Exception):
    """Raised when Groq rate-limits the request even after retrying."""


def _truncate_transcript(text: str, max_words: int = MAX_TRANSCRIPT_WORDS) -> str:
    words = text.split()
    if len(words) <= max_words:
        return text
    return " ".join(words[:max_words]) + " ...[transcript truncated for length]"


async def _throttle() -> None:
    """Enforces a minimum gap since the last call so a burst of requests
    (e.g. clicking 'Generate' on several videos in a row) doesn't blow
    through Groq's free-tier tokens-per-minute budget."""
    global _last_call_at
    async with _throttle_lock:
        elapsed = time.monotonic() - _last_call_at
        wait = MIN_SECONDS_BETWEEN_CALLS - elapsed
        if wait > 0:
            await asyncio.sleep(wait)
        _last_call_at = time.monotonic()


async def _call_groq(
    video_title: str, transcript_text: str, *, _transport: Optional[httpx.AsyncBaseTransport] = None
) -> dict:
    """`_transport` is a test-only hook (httpx.MockTransport) for exercising
    the retry/throttle logic without a real network call — never set this
    in application code."""
    payload = {
        "model": MODEL_NAME,
        "max_completion_tokens": MAX_COMPLETION_TOKENS,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Video title: {video_title}\n\n"
                    f"Transcript:\n{_truncate_transcript(transcript_text)}"
                ),
            },
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "study_materials",
                "strict": True,
                "schema": RESPONSE_SCHEMA,
            },
        },
    }
    headers = {
        "Authorization": f"Bearer {settings.require('GROQ_API_KEY')}",
        "Content-Type": "application/json",
    }

    await _throttle()

    async with httpx.AsyncClient(timeout=60.0, transport=_transport) as client:
        response = None
        for attempt in range(3):
            response = await client.post(GROQ_API_URL, json=payload, headers=headers)

            if response.status_code == 429:
                retry_after = float(response.headers.get("retry-after", 10))
                if attempt == 2:
                    raise GroqRateLimitedError(
                        f"Groq rate-limited this request after {attempt + 1} attempts. "
                        f"Try again in about {int(retry_after)}s."
                    )
                await asyncio.sleep(retry_after)
                continue

            break

        if response.status_code != 200:
            raise GroqAPIError(f"Groq API error ({response.status_code}): {response.text[:300]}")

        data = response.json()

    content = data["choices"][0]["message"]["content"]
    return json.loads(content)  # guaranteed valid JSON — see module docstring


async def generate_study_materials(video_title: str, transcript_text: str) -> dict:
    return await _call_groq(video_title, transcript_text)
