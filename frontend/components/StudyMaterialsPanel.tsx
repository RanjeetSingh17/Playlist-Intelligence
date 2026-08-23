"use client";

import { useState } from "react";
import { generateStudyMaterials } from "@/lib/api";
import { StudyMaterialsResponse, VideoItem } from "@/lib/types";

interface Props {
  videos: VideoItem[];
}

export default function StudyMaterialsPanel({ videos }: Props) {
  const [selectedVideoId, setSelectedVideoId] = useState(videos[0]?.video_id ?? "");
  const [materials, setMaterials] = useState<StudyMaterialsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealedCards, setRevealedCards] = useState<Set<number>>(new Set());
  const [quizSelections, setQuizSelections] = useState<Record<number, number>>({});

  async function handleGenerate(forceRegenerate = false) {
    if (!selectedVideoId) return;
    setIsLoading(true);
    setError(null);
    setRevealedCards(new Set());
    setQuizSelections({});
    try {
      const result = await generateStudyMaterials(selectedVideoId, forceRegenerate);
      setMaterials(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
      setMaterials(null);
    } finally {
      setIsLoading(false);
    }
  }

  function handleSelectVideo(videoId: string) {
    setSelectedVideoId(videoId);
    setMaterials(null);
    setError(null);
    setRevealedCards(new Set());
    setQuizSelections({});
  }

  function toggleCard(index: number) {
    setRevealedCards((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-card border border-ink-700 bg-ink-900 p-5">
      <div>
        <p className="font-display text-base font-semibold text-mist-50">
          Study materials
        </p>
        <p className="text-s text-mist-400">
          Pick a video, then generate its short notes and flashcards from its
          transcript.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <select
          value={selectedVideoId}
          onChange={(e) => handleSelectVideo(e.target.value)}
          className="flex-1 truncate rounded-card border border-ink-700 bg-ink-800 px-3 py-2 text-base text-mist-50 focus:border-signal focus:outline-none"
        >
          {videos.map((v) => (
            <option key={v.video_id} value={v.video_id}>
              {v.position + 1}. {v.title}
            </option>
          ))}
        </select>
        <button
          onClick={() => handleGenerate(false)}
          disabled={isLoading || !selectedVideoId}
          className="shrink-0 rounded-card bg-signal px-8 py-2 font-display text-base font-semibold text-ink-950 transition hover:bg-signal-dim disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? "Generating…" : "Generate"}
        </button>
      </div>

      {isLoading && (
        <p className="text-xs text-mist-400">
          Generating short notes with flash cards.
        </p>
      )}

      {error && <p className="text-xs text-amber">{error}</p>}

      {materials && (
        <div className="flex flex-col gap-6 border-t border-ink-700 pt-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-mist-200">{materials.summary}</p>
            {materials.cached && (
              <button
                onClick={() => handleGenerate(true)}
                disabled={isLoading}
                className="shrink-0 font-mono text-xs text-mist-400 underline decoration-dotted underline-offset-4 hover:text-signal"
              >
                cached — regenerate
              </button>
            )}
          </div>

          <div>
            <h4 className="mb-2 font-display text-xs font-semibold uppercase tracking-wide text-mist-400">
              Notes
            </h4>
            <ul className="flex flex-col gap-1.5">
              {materials.notes.map((note, i) => (
                <li key={i} className="flex gap-2 text-sm text-mist-200">
                  <span className="text-signal">•</span>
                  {note}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-2 font-display text-xs font-semibold uppercase tracking-wide text-mist-400">
              Flashcards ({materials.flashcards.length})
            </h4>
            <div className="flex flex-col gap-2">
              {materials.flashcards.map((card, i) => {
                const isRevealed = revealedCards.has(i);
                return (
                  <button
                    key={i}
                    onClick={() => toggleCard(i)}
                    className="rounded-card border border-ink-700 bg-ink-800 p-3 text-left transition hover:border-signal"
                  >
                    <p className="text-sm font-medium text-mist-50">
                      {card.question}
                    </p>
                    {isRevealed ? (
                      <p className="mt-2 text-sm text-signal">{card.answer}</p>
                    ) : (
                      <p className="mt-2 font-mono text-xs text-mist-400">
                        Tap to reveal answer
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* <div>
            <h4 className="mb-2 font-display text-xs font-semibold uppercase tracking-wide text-mist-400">
              Quiz ({materials.quiz.length})
            </h4>
            <div className="flex flex-col gap-4">
              {materials.quiz.map((q, qi) => {
                const selected = quizSelections[qi];
                const isAnswered = selected !== undefined;
                return (
                  <div
                    key={qi}
                    className="rounded-card border border-ink-700 bg-ink-800 p-3"
                  >
                    <p className="mb-2 text-sm font-medium text-mist-50">
                      {q.question}
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {q.options.map((option, oi) => {
                        const isCorrect = oi === q.correct_index;
                        const isSelected = oi === selected;
                        let style = "border-ink-700 text-mist-200 hover:border-signal";
                        if (isAnswered && isCorrect) style = "border-signal text-signal";
                        else if (isAnswered && isSelected && !isCorrect)
                          style = "border-amber text-amber";
                        return (
                          <button
                            key={oi}
                            onClick={() =>
                              setQuizSelections((prev) => ({ ...prev, [qi]: oi }))
                            }
                            disabled={isAnswered}
                            className={`rounded-card border px-3 py-2 text-left text-sm transition disabled:cursor-default ${style}`}
                          >
                            {option}
                          </button>
                        );
                      })}
                    </div>
                    {isAnswered && (
                      <p className="mt-2 text-xs text-mist-400">{q.explanation}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div> */}
        </div>
      )}
    </div>
  );
}
