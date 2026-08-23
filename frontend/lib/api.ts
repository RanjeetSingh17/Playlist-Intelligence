import {
  AnalyzeComputeResponse,
  DuplicatesResponse,
  PlaylistImportResponse,
  RecommendationsResponse,
  ScheduleResponse,
  StudyMaterialsResponse,
  TranscriptFetchSummary,
  VideoItem,
  WatchTimeResponse,
} from "./types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export async function importPlaylist(
  url: string,
  refresh = false
): Promise<PlaylistImportResponse> {
  const response = await fetch(`${API_BASE_URL}/api/playlist/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, refresh }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? `Import failed (${response.status})`);
  }

  return response.json();
}

export async function fetchTranscripts(
  videoIds: string[]
): Promise<TranscriptFetchSummary> {
  const response = await fetch(`${API_BASE_URL}/api/transcripts/fetch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ video_ids: videoIds }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? `Transcript fetch failed (${response.status})`);
  }

  return response.json();
}

export async function computeAnalysis(
  videoIds: string[]
): Promise<AnalyzeComputeResponse> {
  const response = await fetch(`${API_BASE_URL}/api/analysis/compute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ video_ids: videoIds }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? `Analysis failed (${response.status})`);
  }

  return response.json();
}

export async function findDuplicates(
  videoIds: string[],
  duplicateThreshold = 0.87
): Promise<DuplicatesResponse> {
  const response = await fetch(`${API_BASE_URL}/api/analysis/duplicates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      video_ids: videoIds,
      duplicate_threshold: duplicateThreshold,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? `Duplicate check failed (${response.status})`);
  }

  return response.json();
}

export async function generateStudyMaterials(
  videoId: string,
  forceRegenerate = false
): Promise<StudyMaterialsResponse> {
  const response = await fetch(`${API_BASE_URL}/api/generate/study-materials`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      video_id: videoId,
      force_regenerate: forceRegenerate,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? `Generation failed (${response.status})`);
  }

  return response.json();
}

export async function getRecommendations(
  videos: VideoItem[],
  duplicateClusters: string[][]
): Promise<RecommendationsResponse> {
  const response = await fetch(`${API_BASE_URL}/api/planning/recommendations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videos, duplicate_clusters: duplicateClusters }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? `Recommendations failed (${response.status})`);
  }

  return response.json();
}

interface BuildScheduleParams {
  videos: VideoItem[];
  daily_minutes: number;
  speed?: number;
  start_date?: string;
  study_weekdays?: number[];
}

export async function buildSchedule(
  params: BuildScheduleParams
): Promise<ScheduleResponse> {
  const response = await fetch(`${API_BASE_URL}/api/planning/schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? `Schedule build failed (${response.status})`);
  }

  return response.json();
}

// second version 
export interface GetWatchTimeParams {
  videos: VideoItem[];
  start_position?: number;
  end_position?: number;
  speeds?: number[];
}

export async function getWatchTime(
  params: GetWatchTimeParams
): Promise<WatchTimeResponse> {
  const response = await fetch(`${API_BASE_URL}/api/playlist/watch-time`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? `Watch time calculation failed (${response.status})`);
  }

  return response.json();
}