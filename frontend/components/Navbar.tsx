"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

export default function Navbar() {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("youtube-intelligence-theme");
    const shouldUseDark = savedTheme !== "light";
    setIsDark(shouldUseDark);
    document.body.dataset.theme = shouldUseDark ? "dark" : "light";
  }, []);

  function toggleTheme() {
    const nextIsDark = !isDark;
    setIsDark(nextIsDark);
    document.body.dataset.theme = nextIsDark ? "dark" : "light";
    window.localStorage.setItem(
      "youtube-intelligence-theme",
      nextIsDark ? "dark" : "light"
    );
  }

  return (
    <nav className="sticky top-0 z-50 border-b-2 border-ink-700 bg-ink-950/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="relative">
          <img
            src="/image.png"
            alt="Playlist Intelligence Logo"
            className="absolute right-full top-1/2 mr-4 h-8 w-8 -translate-y-1/2 object-contain"
          />

          <span className="font-display text-2xl font-bold tracking-tight text-mist-50">
            Playlist Intelligence
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isDark}
          aria-label="Toggle dark mode"
          onClick={toggleTheme}
          className="flex items-center gap-2 rounded-full border border-ink-600 bg-ink-800 px-2 py-1.5 text-s font-semibold text-mist-200 transition hover:border-signal"
        >
          <span aria-hidden="true">{isDark ? "☾" : "☀"}</span>
          <span className="relative h-5 w-9 rounded-full bg-ink-700 p-0.5">
            <span
              className={`block h-4 w-4 rounded-full bg-signal transition-transform ${isDark ? "translate-x-4" : "translate-x-0"
                }`}
            />
          </span>
          <span>{isDark ? "Dark" : "Light"}</span>
        </button>
      </div>
    </nav>
  );
}
