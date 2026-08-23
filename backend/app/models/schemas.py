"""
Pydantic models shared across the API.
"""
from datetime import date
from typing import List, Literal, Optional

from pydantic import BaseModel, Field , field_validator

TranscriptStatus = Literal["available", "unavailable", "error"]


class PlaylistImportRequest(BaseModel):
    url: str = Field(..., description="Any YouTube playlist URL or a raw playlist ID")
    refresh: bool = Field(
        False, description="If true, skip the cache and re-fetch from YouTube"
    )


class VideoItem(BaseModel):
    video_id: str
    position: int
    title: str
    channel_title: str
    thumbnail_url: str
    duration_seconds: int


class WatchTimeBreakdown(BaseModel):
    speed: float
    total_seconds: int
    formatted: str


class PlaylistImportResponse(BaseModel):
    playlist_id: str
    playlist_title: str
    video_count: int
    unavailable_count: int
    total_duration_seconds: int
    watch_time_by_speed: List[WatchTimeBreakdown]
    videos: List[VideoItem]
    cached: bool = False


class TranscriptFetchRequest(BaseModel):
    video_ids: List[str] = Field(
        ..., description="YouTube video IDs to fetch transcripts for (max 100 per request)"
    )


class TranscriptResult(BaseModel):
    video_id: str
    status: TranscriptStatus
    language: Optional[str] = None
    segment_count: Optional[int] = None
    error_message: Optional[str] = None
    cached: bool


class TranscriptFetchSummary(BaseModel):
    requested: int
    available: int
    unavailable: int
    error: int
    cached_hits: int
    results: List[TranscriptResult]
    truncated: bool


class DifficultyScore(BaseModel):
    video_id: str
    flesch_reading_ease: Optional[float] = None
    flesch_kincaid_grade: Optional[float] = None
    technical_density: Optional[float] = None
    difficulty_score: Optional[float] = None
    difficulty_label: str


class AnalyzeComputeRequest(BaseModel):
    video_ids: List[str] = Field(
        ...,
        description="Video IDs to compute embeddings + difficulty for — each must already have a cached transcript (see step 2)",
    )


class AnalyzeComputeResponse(BaseModel):
    analyzed: List[str]
    skipped_no_transcript: List[str]
    difficulty: List[DifficultyScore]


class DuplicatesRequest(BaseModel):
    video_ids: List[str] = Field(
        ...,
        description="Video IDs to compare for duplicates — call /compute for all of these first, or any without a cached embedding are silently skipped",
    )
    duplicate_threshold: float = Field(
        0.87, ge=0.5, le=1.0, description="Cosine similarity threshold above which two videos are grouped as duplicates"
    )


class DuplicatesResponse(BaseModel):
    duplicate_clusters: List[List[str]]


class FlashcardItem(BaseModel):
    question: str
    answer: str


class QuizQuestion(BaseModel):
    question: str
    options: List[str]
    correct_index: int
    explanation: str


class StudyMaterialsRequest(BaseModel):
    video_id: str = Field(..., description="Must already have a cached transcript (see step 2)")
    force_regenerate: bool = Field(
        False, description="If true, skip the cache and call the LLM again"
    )


class StudyMaterialsResponse(BaseModel):
    video_id: str
    model_name: str
    summary: str
    notes: List[str]
    flashcards: List[FlashcardItem]
    quiz: List[QuizQuestion]
    cached: bool


class VideoRecommendation(BaseModel):
    video_id: str
    action: Literal["watch", "skip"]
    reason: Optional[str] = None


class RecommendationsRequest(BaseModel):
    videos: List[VideoItem]
    duplicate_clusters: List[List[str]] = Field(default_factory=list)


class RecommendationsResponse(BaseModel):
    recommendations: List[VideoRecommendation]
    skip_count: int
    watch_count: int


class ScheduledVideo(BaseModel):
    video_id: str
    title: str
    position: int
    minutes: float


class ScheduledDay(BaseModel):
    day_number: int
    scheduled_date: Optional[date] = None
    videos: List[ScheduledVideo]
    total_minutes: float
    exceeds_daily_budget: bool


class ScheduleRequest(BaseModel):
    videos: List[VideoItem] = Field(
        ..., description="Videos to schedule, in the order they should be watched"
    )
    daily_minutes: float = Field(..., gt=0, description="Minutes available to study per day")
    speed: float = Field(1.0, gt=0, description="Playback speed multiplier")
    start_date: Optional[date] = Field(
        None, description="First study day; omit for relative day numbers only"
    )
    study_weekdays: Optional[List[int]] = Field(
        None, description="0=Monday..6=Sunday; omit to study every day"
    )


class ScheduleResponse(BaseModel):
    total_days: int
    total_minutes: float
    days: List[ScheduledDay]

#  added after second version
class WatchTimeRequest(BaseModel):
    videos: List[VideoItem] = Field(..., description="The playlist's videos (frontend already has these from import)")
    start_position: Optional[int] = Field(
        None, ge=0, description="0-indexed start position, inclusive; omit for the beginning of the playlist"
    )
    end_position: Optional[int] = Field(
        None, ge=0, description="0-indexed end position, inclusive; omit for the end of the playlist"
    )
    speeds: Optional[List[float]] = Field(
        None, description="Playback speeds to compute; omit for the default 1x/1.25x/1.5x/2x"
    )

    @field_validator("speeds")
    @classmethod
    def validate_speeds(cls, value):
        if value is None:
            return value
        if not value:
            raise ValueError("speeds must not be empty if provided.")
        for speed in value:
            if speed <= 0:
                raise ValueError(f"Invalid speed {speed}: must be positive.")
            if speed > 10:
                raise ValueError(f"Invalid speed {speed}: must be 10x or less.")
        return value


class WatchTimeResponse(BaseModel):
    video_count: int
    total_duration_seconds: int
    watch_time_by_speed: List[WatchTimeBreakdown]
    start_position: int
    end_position: int
