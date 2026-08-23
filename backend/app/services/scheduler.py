"""
Study schedule generation: a greedy, sequential bin-packing algorithm over
playlist order — deliberately NOT a reordering optimizer. Watching video 7
before video 3 in a course doesn't make sense pedagogically even if some
other ordering packed days more tightly, so videos are placed into days in
the order given, one day filled at a time.

A single video longer than the entire daily budget still gets its own day
(flagged as exceeding the budget) rather than being dropped or split
mid-video, which isn't a meaningful thing to do to a video anyway.

This has no database or external API dependency — it's pure math over data
the caller already has, so it's fully unit-testable without any mocking.
"""
from datetime import date, timedelta
from typing import List, Optional

from app.models.schemas import ScheduledDay, ScheduledVideo, VideoItem


def build_schedule(
    videos: List[VideoItem],
    daily_minutes: float,
    speed: float = 1.0,
    start_date: Optional[date] = None,
    study_weekdays: Optional[List[int]] = None,
) -> List[ScheduledDay]:
    if daily_minutes <= 0:
        raise ValueError("daily_minutes must be positive.")
    if speed <= 0:
        raise ValueError("speed must be positive.")

    study_weekdays = study_weekdays if study_weekdays is not None else list(range(7))
    if not study_weekdays:
        raise ValueError("study_weekdays must include at least one day.")

    day_buckets: List[List[VideoItem]] = []
    day_minutes: List[float] = []

    current_videos: List[VideoItem] = []
    current_minutes = 0.0

    for video in videos:
        video_minutes = (video.duration_seconds / 60.0) / speed
        if current_videos and current_minutes + video_minutes > daily_minutes:
            day_buckets.append(current_videos)
            day_minutes.append(current_minutes)
            current_videos = []
            current_minutes = 0.0
        current_videos.append(video)
        current_minutes += video_minutes

    if current_videos:
        day_buckets.append(current_videos)
        day_minutes.append(current_minutes)

    dates: List[Optional[date]] = [None] * len(day_buckets)
    if start_date is not None:
        cursor = start_date
        for i in range(len(day_buckets)):
            while cursor.weekday() not in study_weekdays:
                cursor += timedelta(days=1)
            dates[i] = cursor
            cursor += timedelta(days=1)

    schedule: List[ScheduledDay] = []
    for i, (vids, minutes) in enumerate(zip(day_buckets, day_minutes)):
        schedule.append(
            ScheduledDay(
                day_number=i + 1,
                scheduled_date=dates[i],
                videos=[
                    ScheduledVideo(
                        video_id=v.video_id,
                        title=v.title,
                        position=v.position,
                        minutes=round((v.duration_seconds / 60.0) / speed, 1),
                    )
                    for v in vids
                ],
                total_minutes=round(minutes, 1),
                exceeds_daily_budget=minutes > daily_minutes + 1e-9,
            )
        )
    return schedule
