export interface VideoItem {
  video_id: string;
  position: number;
  title: string;
  channel_title: string;
  thumbnail_url: string;
  duration_seconds: number;
}

export interface WatchTimeBreakdown {
  speed: number;
  total_seconds: number;
  formatted: string;
}

export interface PlaylistImportResponse {
  playlist_id: string;
  playlist_title: string;
  video_count: number;
  unavailable_count: number;
  total_duration_seconds: number;
  watch_time_by_speed: WatchTimeBreakdown[];
  videos: VideoItem[];
  cached: boolean;
}

export type TranscriptStatus = "available" | "unavailable" | "error";

export interface TranscriptResult {
  video_id: string;
  status: TranscriptStatus;
  language: string | null;
  segment_count: number | null;
  error_message: string | null;
  cached: boolean;
}

export interface TranscriptFetchSummary {
  requested: number;
  available: number;
  unavailable: number;
  error: number;
  cached_hits: number;
  results: TranscriptResult[];
  truncated: boolean;
  stopped_early: boolean;
  skipped_video_ids: string[];
}

export type DifficultyLabel = "easy" | "medium" | "hard" | "unknown";

export interface DifficultyScore {
  video_id: string;
  flesch_reading_ease: number | null;
  flesch_kincaid_grade: number | null;
  technical_density: number | null;
  difficulty_score: number | null;
  difficulty_label: DifficultyLabel;
}

export interface AnalyzeComputeResponse {
  analyzed: string[];
  skipped_no_transcript: string[];
  difficulty: DifficultyScore[];
}

export interface DuplicatesResponse {
  duplicate_clusters: string[][];
}

export interface FlashcardItem {
  question: string;
  answer: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
}

export interface StudyMaterialsResponse {
  video_id: string;
  model_name: string;
  summary: string;
  notes: string[];
  flashcards: FlashcardItem[];
  quiz: QuizQuestion[];
  cached: boolean;
}

export interface VideoRecommendation {
  video_id: string;
  action: "watch" | "skip";
  reason: string | null;
}

export interface RecommendationsResponse {
  recommendations: VideoRecommendation[];
  skip_count: number;
  watch_count: number;
}

export interface ScheduledVideo {
  video_id: string;
  title: string;
  position: number;
  minutes: number;
}

export interface ScheduledDay {
  day_number: number;
  scheduled_date: string | null;
  videos: ScheduledVideo[];
  total_minutes: number;
  exceeds_daily_budget: boolean;
}

export interface ScheduleResponse {
  total_days: number;
  total_minutes: number;
  days: ScheduledDay[];
}

// second version 

export interface WatchTimeResponse {
  video_count: number;
  total_duration_seconds: number;
  watch_time_by_speed: WatchTimeBreakdown[];
  start_position: number;
  end_position: number;
}