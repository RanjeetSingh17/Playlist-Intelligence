"use client";

import { useEffect, useRef, useState } from "react";
import { chatWithVideo } from "@/lib/api";
import { ChatMessage } from "@/lib/types";

interface Props {
  videoId: string;
  videoTitle: string;
}

export default function VideoChatPanel({ videoId, videoTitle }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMessage: ChatMessage = { role: "user", content: trimmed };
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setInput("");
    setError(null);
    setIsLoading(true);

    try {
      const { reply } = await chatWithVideo(videoId, nextMessages);
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-card border border-ink-700 bg-ink-900 p-5">
      {/* Header */}
      <div>
        <p className="font-display text-base font-semibold text-mist-50">
          Ask about this video
        </p>
        <p className="text-xs text-mist-400">
          Chat with an AI that has read the full transcript of{" "}
          <span className="italic text-mist-200">{videoTitle}</span>.
        </p>
      </div>

      {/* Message thread */}
      {messages.length > 0 && (
        <div className="flex max-h-96 flex-col gap-3 overflow-y-auto rounded-card border border-ink-700 bg-ink-950 p-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-card px-3 py-2 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-signal text-ink-950"
                    : "bg-ink-800 text-mist-200"
                }`}
              >
                {msg.content.split("\n").map((line, li, arr) => (
                  <span key={li}>
                    {line}
                    {li < arr.length - 1 && <br />}
                  </span>
                ))}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1 rounded-card bg-ink-800 px-3 py-2">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-mist-400 [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-mist-400 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-mist-400 [animation-delay:300ms]" />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      )}

    

      {/* Error */}
      {error && <p className="text-xs text-amber">{error}</p>}

      {/* Input row */}
      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question… "
          rows={2}
          disabled={isLoading}
          className="flex-1 resize-none rounded-card border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-mist-50 placeholder-mist-500 focus:border-signal focus:outline-none disabled:opacity-60"
        />
        <button
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
          className="shrink-0 rounded-card bg-signal px-5 py-2 font-display text-sm font-semibold text-ink-950 transition hover:bg-signal-dim disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}
