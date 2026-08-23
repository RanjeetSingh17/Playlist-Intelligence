"use client";

import { FormEvent, useState } from "react";
import { buildSchedule } from "@/lib/api";
import { ScheduledDay, VideoItem, VideoRecommendation } from "@/lib/types";

interface Props {
  videos: VideoItem[];
  recommendations: VideoRecommendation[] | null;
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function SchedulePanel({ videos, recommendations }: Props) {
  const [dailyMinutes, setDailyMinutes] = useState(30);
  const [speed, setSpeed] = useState(1);
  const [startDate, setStartDate] = useState("");
  const [excludeSkips, setExcludeSkips] = useState(true);
  const [studyDays, setStudyDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [schedule, setSchedule] = useState<ScheduledDay[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const skipIds = new Set(
    recommendations?.filter((r) => r.action === "skip").map((r) => r.video_id) ?? []
  );
  const hasSkips = skipIds.size > 0;

  function toggleDay(day: number) {
    setStudyDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const videosToSchedule =
        excludeSkips && hasSkips
          ? videos.filter((v) => !skipIds.has(v.video_id))
          : videos;
      const result = await buildSchedule({
        videos: videosToSchedule,
        daily_minutes: dailyMinutes,
        speed,
        start_date: startDate || undefined,
        study_weekdays: studyDays.length < 7 ? studyDays : undefined,
      });
      setSchedule(result.days);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't build a schedule.");
      setSchedule(null);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-card border border-ink-700 bg-ink-900 p-5">
      <div>
        <p className="font-display text-base font-semibold text-mist-50">
          Study schedule
        </p>
        <p className="text-s text-mist-400">
          Split this playlist across days based on how much time you have.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-s text-mist-400">
            Minutes per day
            <input
              type="number"
              min={5}
              step={5}
              value={dailyMinutes}
              onChange={(e) => setDailyMinutes(Number(e.target.value))}
              className="w-28 rounded-card border border-ink-700 bg-ink-800 px-3 py-2 text-base text-mist-50 focus:border-signal focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-s text-mist-400">
            Playback speed
            <select
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="w-28 rounded-card border border-ink-700 bg-ink-800 px-3 py-2 text-base text-mist-50 focus:border-signal focus:outline-none"
            >
              {[1, 1.25, 1.5, 2].map((s) => (
                <option key={s} value={s}>
                  {s}×
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-s text-mist-400">
            Start date (optional)
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-card border border-ink-700 bg-ink-800 px-3 py-2 text-base text-mist-50 focus:border-signal focus:outline-none"
            />
          </label>
          {hasSkips && (
            <label className="flex items-center gap-2 pb-2 text-s text-mist-400">
              <input
                type="checkbox"
                checked={excludeSkips}
                onChange={(e) => setExcludeSkips(e.target.checked)}
                className="accent-signal text-s"
              />
              Exclude recommended skips ({skipIds.size})
            </label>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-s text-mist-400">Study days</span>
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_LABELS.map((label, i) => (
              <button
                type="button"
                key={label}
                onClick={() => toggleDay(i)}
                className={`rounded-card border px-3 py-1.5 font-mono text-s transition ${
                  studyDays.includes(i)
                    ? "border-signal text-signal"
                    : "border-ink-700 text-mist-400 hover:border-ink-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading || studyDays.length === 0}
          className="self-start rounded-card bg-signal px-4 py-2 font-display text-base font-semibold text-ink-950 transition hover:bg-signal-dim disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? "Building…" : "Build schedule"}
        </button>
      </form>

      {error && <p className="text-xs text-amber">{error}</p>}

      {schedule && (
        <div className="flex flex-col gap-2 border-t border-ink-700 pt-4">
          <p className="font-mono text-s uppercase tracking-wide text-signal">
            {schedule.length} day{schedule.length === 1 ? "" : "s"} total
          </p>
          {schedule.map((day) => (
            <div
              key={day.day_number}
              className="rounded-card border border-ink-700 bg-ink-800 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-display text-base font-semibold text-mist-50">
                  Day {day.day_number}
                  {day.scheduled_date && (
                    <span className="ml-2 font-mono text-s text-mist-400">
                      {day.scheduled_date}
                    </span>
                  )}
                </p>
                <span className="font-mono text-s text-mist-400">
                  {Math.round(day.total_minutes)} min
                  {day.exceeds_daily_budget && (
                    <span className="ml-2 text-amber">over daily time</span>
                  )}
                </span>
              </div>
              <ul className="mt-2 flex flex-col gap-1">
                {day.videos.map((v) => (
                  <li
                    key={v.video_id}
                    className="flex justify-between gap-3 text-s text-mist-200"
                  >
                    <span className="truncate">{v.title}</span>
                    <span className="shrink-0 font-mono text-mist-400">
                      {Math.round(v.minutes)}m
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
