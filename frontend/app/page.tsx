"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";

import AnalysisPanel from "@/components/AnalysisPanel";
import DuplicateClusters from "@/components/DuplicateClusters";
import Navbar from "@/components/Navbar";
import PlaylistImportForm, {
  WatchTimeSettings,
} from "@/components/PlaylistImportForm";
import PlaylistSummary from "@/components/PlaylistSummary";
import RecommendationsPanel from "@/components/RecommendationsPanel";
import SchedulePanel from "@/components/SchedulePanel";
import StudyMaterialsPanel from "@/components/StudyMaterialsPanel";
import TranscriptPanel from "@/components/TranscriptPanel";
import VideoList from "@/components/VideoList";

import { getWatchTime, importPlaylist } from "@/lib/api";

import {
  DifficultyScore,
  PlaylistImportResponse,
  TranscriptResult,
  VideoRecommendation,
  WatchTimeResponse,
} from "@/lib/types";

export default function HomePage() {
  const [data, setData] = useState<PlaylistImportResponse | null>(null);
  const [lastUrl, setLastUrl] = useState("");
  const [lastWatchTimeSettings, setLastWatchTimeSettings] =
    useState<WatchTimeSettings | null>(null);
  const [watchTime, setWatchTime] = useState<WatchTimeResponse | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [transcriptStatus, setTranscriptStatus] = useState<
    Record<string, TranscriptResult>
  >({});

  const [difficulty, setDifficulty] = useState<
    Record<string, DifficultyScore>
  >({});

  const [duplicateClusters, setDuplicateClusters] = useState<string[][]>([]);

  const [recommendations, setRecommendations] = useState<
    VideoRecommendation[] | null
  >(null);

  const sectionRefs = {
    summary: useRef<HTMLDivElement>(null),
    study: useRef<HTMLDivElement>(null),
    videos: useRef<HTMLDivElement>(null),
    schedule: useRef<HTMLDivElement>(null),
    transcript: useRef<HTMLDivElement>(null),
    analysis: useRef<HTMLDivElement>(null),
    duplicates: useRef<HTMLDivElement>(null),
    recommendations: useRef<HTMLDivElement>(null),
  };

  const [activeSection, setActiveSection] = useState(0);
  const [isDraggingNavigator, setIsDraggingNavigator] = useState(false);

  const navigationSections = [
    { name: "Summary", ref: sectionRefs.summary },
    { name: "Study Materials", ref: sectionRefs.study },
    { name: "Videos", ref: sectionRefs.videos },
    { name: "Schedule", ref: sectionRefs.schedule },
    { name: "Transcript", ref: sectionRefs.transcript },
    { name: "Analysis", ref: sectionRefs.analysis },
    { name: "Duplicates", ref: sectionRefs.duplicates },
    { name: "Recommendations", ref: sectionRefs.recommendations },
  ];


  function scrollToSection(index: number) {
    const section = navigationSections[index];

    if (!section?.ref.current) return;

    section.ref.current.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });

    setActiveSection(index);
  }


  function handleNavigatorDrag(event: PointerEvent<HTMLDivElement>) {
    if (!data) return;

    const navigator = event.currentTarget;
    const rect = navigator.getBoundingClientRect();

    const y = Math.max(
      0,
      Math.min(event.clientY - rect.top, rect.height)
    );

    const percentage = y / rect.height;

    const index = Math.round(
      percentage * (navigationSections.length - 1)
    );

    scrollToSection(index);
  }

  function handleNavigatorPointerDown(
    event: PointerEvent<HTMLDivElement>
  ) {
    if (!data) return;

    if ((event.target as HTMLElement).closest("button")) {
      return;
    }

    setIsDraggingNavigator(true);

    event.currentTarget.setPointerCapture(event.pointerId);

    handleNavigatorDrag(event);
  }

  function handleNavigatorPointerMove(
    event: PointerEvent<HTMLDivElement>
  ) {
    if (!isDraggingNavigator) return;

    handleNavigatorDrag(event);
  }

  function handleNavigatorPointerUp(
    event: PointerEvent<HTMLDivElement>
  ) {
    setIsDraggingNavigator(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  useEffect(() => {
    if (!data) return;

    function handleScroll() {
      const scrollPosition =
        window.scrollY + window.innerHeight * 0.35;

      let closestIndex = 0;
      let closestDistance = Infinity;

      navigationSections.forEach((section, index) => {
        const element = section.ref.current;

        if (!element) return;

        const elementTop =
          element.getBoundingClientRect().top + window.scrollY;

        const distance = Math.abs(elementTop - scrollPosition);

        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });

      setActiveSection(closestIndex);
    }

    window.addEventListener("scroll", handleScroll, {
      passive: true,
    });

    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [data]);

  async function handleImport(
    url: string,
    settings: WatchTimeSettings,
    refresh = false
  ) {
    setIsLoading(true);
    setError(null);
    setWatchTime(null);
    setTranscriptStatus({});
    setDifficulty({});
    setDuplicateClusters([]);
    setRecommendations(null);

    let importedPlaylist: PlaylistImportResponse;

    try {
      importedPlaylist = await importPlaylist(url, refresh);

      setData(importedPlaylist);
      setLastUrl(url);
      setLastWatchTimeSettings(settings);
      setActiveSection(0);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong."
      );

      setData(null);
      setIsLoading(false);
      return;
    }

    try {
      const calculatedWatchTime = await getWatchTime({
        videos: importedPlaylist.videos,
        start_position: settings.startPosition,
        end_position: settings.endPosition,
        speeds: settings.speeds,
      });

      setWatchTime(calculatedWatchTime);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Playlist imported, but the watch time could not be calculated."
      );
    } finally {
      setIsLoading(false);
    }
  }

  const studyMaterialVideos = data
    ? data.videos.filter((video) => {
      const start = lastWatchTimeSettings?.startPosition ?? 0;
      const end = lastWatchTimeSettings?.endPosition;

      if (end === undefined) {
        return video.position >= start;
      }

      return (
        video.position >= start &&
        video.position <= end
      );
    })
    : [];

  return (
    <>
      <Navbar />

      <main className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-7xl flex-col gap-10 px-6 py-14">
        <header className="flex flex-col items-center gap-2 text-center">
          <h1 className="font-display text-4xl font-bold text-mist-50">
            Turn any playlist into a study plan
          </h1>

          <p className="max-w-l text-mist-400">
            Paste a YouTube playlist URL to see total watch time at different
            playback speed and generate short notes for revision.
          </p>
        </header>

        <PlaylistImportForm
          onSubmit={(url, settings) =>
            handleImport(url, settings)
          }
          isLoading={isLoading}
        />

        {error && (
          <p className="rounded-card border border-amber-dim bg-ink-800 px-5 py-4 text-sm text-amber">
            {error}
          </p>
        )}

        {data && (
          <div className="flex flex-col gap-9">

            <div ref={sectionRefs.summary}>
              <PlaylistSummary
                data={data}
                watchTime={watchTime}
                onRefresh={() =>
                  lastWatchTimeSettings &&
                  handleImport(
                    lastUrl,
                    lastWatchTimeSettings,
                    true
                  )
                }
              />
            </div>

            <div ref={sectionRefs.study}>
              <StudyMaterialsPanel
                videos={studyMaterialVideos}
              />
            </div>


            <div ref={sectionRefs.videos}>
              <VideoList
                videos={studyMaterialVideos}
                transcriptStatus={transcriptStatus}
                difficulty={difficulty}
              />
            </div>
            <div ref={sectionRefs.schedule}>
              <SchedulePanel
                videos={studyMaterialVideos}
                recommendations={recommendations}
              />
            </div>
            <div ref={sectionRefs.transcript}>
              <TranscriptPanel
                videos={studyMaterialVideos}
                onStatusUpdate={setTranscriptStatus}
              />
            </div>
            <div ref={sectionRefs.analysis}>
              <AnalysisPanel
                videos={studyMaterialVideos}
                onDifficultyUpdate={setDifficulty}
                onDuplicatesFound={setDuplicateClusters}
              />
            </div>

            {duplicateClusters.length > 0 && (
              <div ref={sectionRefs.duplicates}>
                <DuplicateClusters
                  clusters={duplicateClusters}
                  videos={data.videos}
                />
              </div>
            )}
            <div ref={sectionRefs.recommendations}>
              <RecommendationsPanel
                videos={studyMaterialVideos}
                duplicateClusters={duplicateClusters}
                onRecommendations={setRecommendations}
              />
            </div>

          </div>
        )}
      </main>

      {data && (
        <div
          className={`page-navigator ${isDraggingNavigator
            ? "page-navigator-dragging"
            : ""
            }`}
          onPointerDown={handleNavigatorPointerDown}
          onPointerMove={handleNavigatorPointerMove}
          onPointerUp={handleNavigatorPointerUp}
          onPointerCancel={handleNavigatorPointerUp}
          role="slider"
          aria-label="Navigate through playlist sections"
          aria-valuemin={0}
          aria-valuemax={navigationSections.length - 1}
          aria-valuenow={activeSection}
          tabIndex={0}
        >
          <div className="page-navigator-lines">
            {navigationSections.map((section, index) => (
              <button
                key={section.name}
                type="button"
                className={`page-navigator-item ${index === activeSection ? "active" : ""
                  }`}
                onClick={(event) => {
                  event.stopPropagation();
                  scrollToSection(index);
                }}
                aria-label={`Go to ${section.name}`}
              >
                {/* Small line */}
                <span className="page-navigator-line" />

                {/* Section name shown on hover */}
                <span className="page-navigator-label">
                  {section.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
