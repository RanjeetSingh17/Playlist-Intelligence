"""
Difficulty scoring: a heuristic composite score built from readability
metrics (textstat), not a trained model or an LLM call. That's the right
tradeoff here — it's instant, free, deterministic, and transparent about
exactly how a score was produced, which a black-box model wouldn't be.

Two signals feed the composite:
  - Flesch reading ease, inverted (textstat gives 0-100 where 100 = easiest;
    we want higher = harder, so it's flipped).
  - Technical density: the share of "difficult" words (textstat's
    Dale-Chall-style word-familiarity list) in the transcript.
"""
from typing import Optional

import textstat

EASY_THRESHOLD = 35
HARD_THRESHOLD = 65
MIN_WORD_COUNT = 20  # below this, a readability score isn't meaningful


def compute_difficulty(text: str) -> dict:
    text = (text or "").strip()

    if not text or textstat.lexicon_count(text) < MIN_WORD_COUNT:
        return {
            "flesch_reading_ease": None,
            "flesch_kincaid_grade": None,
            "technical_density": None,
            "difficulty_score": None,
            "difficulty_label": "unknown",
        }

    reading_ease = textstat.flesch_reading_ease(text)
    grade_level = textstat.flesch_kincaid_grade(text)

    word_count = textstat.lexicon_count(text)
    difficult_word_count = textstat.difficult_words(text)
    technical_density = (difficult_word_count / word_count) * 100 if word_count else 0.0

    # Real transcripts sometimes score slightly outside the nominal 0-100
    # Flesch band, so both components are clamped before combining.
    ease_component = 100 - max(0, min(100, reading_ease))
    # Difficult-word ratios in ordinary speech are usually well under 25%,
    # so this is scaled up to use more of the 0-100 range.
    density_component = max(0, min(100, technical_density * 4))

    composite = round(0.6 * ease_component + 0.4 * density_component, 1)
    composite = max(0.0, min(100.0, composite))

    if composite < EASY_THRESHOLD:
        label = "easy"
    elif composite < HARD_THRESHOLD:
        label = "medium"
    else:
        label = "hard"

    return {
        "flesch_reading_ease": round(reading_ease, 1),
        "flesch_kincaid_grade": round(grade_level, 1),
        "technical_density": round(technical_density, 1),
        "difficulty_score": composite,
        "difficulty_label": label,
    }
