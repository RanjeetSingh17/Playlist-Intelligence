# YouTube Playlist Intelligence — Steps 1–5

This covers **steps 1–5 of 6** in the build roadmap:

- **Step 1**: paste a playlist URL, see every video, see watch time at
  1×/1.25×/1.5×/2×.
- **Step 2**: playlists and videos now persist in Postgres (Supabase), so a
  repeat import is instant instead of re-hitting YouTube. Transcripts can be
  fetched and cached per video, with the error-handling a production app
  actually needs around YouTube's unofficial (and block-prone) transcript
  endpoints.
- **Step 3**: transcripts get embedded (sentence-transformers), near-duplicate
  videos are detected by cosine similarity, and each video gets a readability-
  based difficulty score. No LLM call, no paid API — everything here is
  free and deterministic.
- **Step 4**: pick a video, generate concise notes, flashcards, and a quiz
  from its transcript using Groq's free tier — genuinely free, no card, and
  the JSON is *guaranteed* well-formed (Groq's Structured Outputs strict
  mode), not just "hopefully parseable."
- **Step 5**: recommends skipping near-duplicate videos (using step 3's
  clustering), and builds a day-by-day study schedule from your available
  daily time, playback speed, and which days you actually study. Pure
  computation — no database, no external API, no LLM — so it's instant and
  fully unit-tested.

Nothing here is a stub — every endpoint does the real work described above.

## ⚠️ One thing to know before step 4: a model is being retired in days

Groq has scheduled `llama-3.3-70b-versatile` and `llama-3.1-8b-instant` —
the two models almost every Groq tutorial and blog post uses — for shutdown
on **August 16, 2026**. This project uses `openai/gpt-oss-120b` instead,
Groq's current featured flagship open-weight model. Model churn is routine
on Groq (they've retired a model roughly every 1-2 months through 2026); if
`openai/gpt-oss-120b` is ever deprecated in turn, check
[console.groq.com/docs/models](https://console.groq.com/docs/models) and
update `MODEL_NAME` in `backend/app/services/llm_generation.py`.

## What's included

- **`backend/`** — FastAPI service.
  - `POST /api/playlist/import` — fetches playlist + video metadata from the
    YouTube Data API (or returns it instantly from cache), handles
    pagination, skips private/deleted videos gracefully, computes watch time
    for all four speeds. *(step 1, extended in step 2 with caching)*
  - `POST /api/transcripts/fetch` — fetches and caches transcripts for a
    batch of video IDs. *(step 2)*
  - `POST /api/analysis/compute` — computes and caches an embedding +
    difficulty score for a batch of videos. *(step 3)*
  - `POST /api/analysis/duplicates` — clusters videos by transcript
    similarity, using whatever embeddings are already cached. *(step 3)*
  - `POST /api/generate/study-materials` — generates (or returns cached)
    notes, flashcards, and a quiz for one video via Groq. *(step 4)*
  - `POST /api/planning/recommendations` — flags near-duplicate videos to
    skip, using step 3's duplicate clusters. *(step 5)*
  - `POST /api/planning/schedule` — builds a day-by-day study schedule from
    daily time budget, playback speed, and study days of the week. *(step 5)*
- **`frontend/`** — Next.js 15 + TypeScript + Tailwind app. Paste a URL, see
  the playlist summary and watch-time bars, fetch transcripts, run the
  difficulty/duplicate analysis, get skip recommendations, build a study
  schedule, pick a video and generate study materials, browse the full
  video list.
- **`backend/db/schema.sql`** — all seven tables across steps 1-4 (step 5
  needs no new tables — see below).

## Prerequisites

- Python 3.11+
- Node.js 18.18+ (Next.js 15 requirement)
- A free YouTube Data API v3 key (steps below — takes about 3 minutes)

## 1. Get a YouTube Data API key

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and
   create a project (or use an existing one).
2. Go to **APIs & Services → Library**, search for **"YouTube Data API v3"**,
   and click **Enable**.
3. Go to **APIs & Services → Credentials → Create Credentials → API key**.
4. Copy the key. This is free — the default quota is 10,000 units/day, and a
   playlist import costs roughly `1 + ceil(video_count / 50) * 2` units, so
   you'd need to import playlists all day to run out.

## 2. Set up Supabase

1. Go to [supabase.com](https://supabase.com/) → **New project** (free tier
   is plenty). Wait ~2 minutes for it to provision.
2. Go to **SQL Editor → New query**, paste the entire contents of
   `backend/db/schema.sql`, and click **Run**. This creates seven tables:
   `playlists`, `videos`, `playlist_videos`, `transcripts`, `embeddings`,
   `difficulty_scores`, `study_materials`.
3. Go to **Settings → API**. Copy the **Project URL** and the **anon
   public** key.

## 3. Get a Groq API key (free, no card)

Go to [console.groq.com](https://console.groq.com/) → sign up → **API Keys**
→ **Create API Key**. Copy it — you can't view it again after this screen.

We're using the `anon` key rather than the `service_role` key on purpose —
this is a single-user local project with no Row Level Security policies
configured, so the `anon` key is the appropriate scope. If you later add
multi-user auth, that's when RLS policies and the distinction between these
two keys start to matter.

## 4. Run the backend

`sentence-transformers` (added in step 3) pulls in `torch`. The default
PyPI wheel bundles full CUDA support and can be **4-5GB** — massive
overkill for a small CPU-only embedding model. Installing a CPU-only torch
build first is optional but saves several GB and a lot of download time,
especially if you later deploy to a free-tier host with limited disk:

**Windows PowerShell:**

```powershell
cd backend
py -3 -m venv venv
.\venv\Scripts\Activate.ps1

python -m pip install torch --index-url https://download.pytorch.org/whl/cpu   # optional but recommended
python -m pip install -r requirements.txt

Copy-Item .env.example .env
# open .env and paste YOUTUBE_API_KEY, SUPABASE_URL, SUPABASE_KEY, and GROQ_API_KEY

uvicorn app.main:app --reload --port 8000
```

**macOS/Linux:**

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cpu   # optional but recommended
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

Visit `http://localhost:8000/docs` — you should see the interactive FastAPI
docs (Swagger UI) with all five endpoints listed. Try the playlist import
directly from there before touching the frontend, to confirm your API key
works:

```bash
curl -X POST http://localhost:8000/api/playlist/import \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/playlist?list=PLillGF-RfqbYeckUaD1z6nviTp31GLTH8"}'
```

(That's a public playlist ID you can swap for any playlist you want to test
with — freeCodeCamp's, a course playlist, whatever's handy.)

Import the same playlist a second time and check the response: `"cached":
true` and it returns almost instantly, since it's now reading from Supabase
instead of calling YouTube again. Try the transcripts endpoint too, using a
couple of video IDs from the import response's `videos` array:

```bash
curl -X POST http://localhost:8000/api/transcripts/fetch \
  -H "Content-Type: application/json" \
  -d '{"video_ids": ["VIDEO_ID_1", "VIDEO_ID_2"]}'
```

Then run the step 3 analysis on the same IDs — first `/compute` (this is
the one that downloads the model on first run, so it'll be slow just once),
then `/duplicates`:

```bash
curl -X POST http://localhost:8000/api/analysis/compute \
  -H "Content-Type: application/json" \
  -d '{"video_ids": ["VIDEO_ID_1", "VIDEO_ID_2"]}'

curl -X POST http://localhost:8000/api/analysis/duplicates \
  -H "Content-Type: application/json" \
  -d '{"video_ids": ["VIDEO_ID_1", "VIDEO_ID_2"]}'
```

Then generate study materials for one video (this calls Groq — the first
call may take a few seconds, and it's cached afterward):

```bash
curl -X POST http://localhost:8000/api/generate/study-materials \
  -H "Content-Type: application/json" \
  -d '{"video_id": "VIDEO_ID_1"}'
```

Step 5 needs no Supabase setup at all — it's pure computation over data you
already have from the playlist import, so you can try it with made-up video
objects:

```bash
curl -X POST http://localhost:8000/api/planning/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "videos": [
      {"video_id": "a", "position": 0, "title": "Intro", "channel_title": "X", "thumbnail_url": "http://x", "duration_seconds": 1200},
      {"video_id": "b", "position": 1, "title": "Part 2", "channel_title": "X", "thumbnail_url": "http://x", "duration_seconds": 1800}
    ],
    "daily_minutes": 20,
    "speed": 1.5
  }'
```

## 5. Run the frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Before starting the frontend, copy its environment file using the command
for your shell. It defaults to `http://localhost:8000`, so no edit is needed
for a local backend:

```powershell
# Windows PowerShell
Copy-Item .env.local.example .env.local
```

```bash
# macOS/Linux
cp .env.local.example .env.local
```

Visit `http://localhost:3000`, paste a playlist URL, click **Import
playlist**, then **Fetch transcripts**, then **Run analysis** to see
difficulty badges and any duplicate groups. Click **Get recommendations**
to see which videos are worth skipping, then **Build schedule** to split
the (optionally trimmed) playlist across days. In the **Study materials**
section, pick a video and click **Generate** for notes, flashcards, and a
quiz.

## How it works, briefly

- `extract_playlist_id()` accepts a full playlist URL, a
  `watch?v=...&list=...` URL, or a raw playlist ID.
- `fetch_playlist_items()` paginates through `playlistItems.list` to collect
  every video ID and its position in the playlist.
- `fetch_video_details()` batches those IDs into groups of 50 (the API's
  max per request) and calls `videos.list` for duration + display metadata.
  Videos that don't come back (private, deleted, region-blocked) are counted
  in `unavailable_count` and excluded from the watch-time math.
- `compute_watch_time()` divides total seconds by each speed multiplier.

**Step 2 additions:**

- `playlist_store.py` wraps the step-1 `import_playlist()` function
  unchanged — it checks Supabase first, and only calls YouTube on a cache
  miss or when `refresh: true` is passed. After a live fetch, it upserts
  into `playlists`, `videos`, and `playlist_videos`.
- `transcripts.py` uses the **current** `youtube-transcript-api` interface:
  `YouTubeTranscriptApi().fetch(video_id, languages=["en"])`, not the old
  `YouTubeTranscriptApi.get_transcript(video_id)` you'll see in a lot of
  outdated tutorials — that static method was removed in a recent release
  and will raise `AttributeError` if you copy old sample code.
- Every fetch result is classified into one of three states before being
  cached:
  - `available` — got a transcript, stored permanently.
  - `unavailable` — YouTube confirmed there isn't one (captions disabled,
    video gone). This is a fact about the video, so it's also cached
    permanently — retrying won't change the answer.
  - `error` — something went wrong at the network/infrastructure level
    (most commonly an IP block). This is **not** cached as a final answer,
    because it isn't one — it's safe and correct to retry later.

### Known limitation: YouTube blocks transcript scraping from cloud IPs

`youtube-transcript-api` (like every free option) works by reading the same
internal endpoint the YouTube player uses — there's no official API for
transcripts of videos you don't own. YouTube actively rate-limits and blocks
this from data-center IP ranges (AWS, GCP, Azure, and typical PaaS hosts
like Render/Railway all included). Locally, on your home connection, it'll
work fine. Once you deploy the backend, you may see `error` statuses show up
for videos that would succeed locally.

This won't block you from finishing the MVP — every video is cached the
moment it succeeds, and `error` rows are always safe to retry — but it's
worth knowing about before demo day. Two mitigations worth doing before
step 6 (polish week):

1. **Pre-seed a few known-good playlists** by running the transcript fetch
   from your own machine (not the deployed server) once, so your live demo
   always has cached data to show even if the deployed server gets rate
   limited on a fresh playlist.
2. If you want it bulletproof, `youtube-transcript-api` supports routing
   through a residential proxy (e.g. Webshare) via a `proxy_config` argument
   on `YouTubeTranscriptApi()` — not free, so it's out of scope here, but
   it's a one-line addition if you decide you need it later.

**Step 3 additions:**

- `embeddings.py` chunks each transcript into ~200-word pieces, embeds each
  chunk with `all-MiniLM-L6-v2` (sentence-transformers), and mean-pools them
  into one 384-dimensional vector per video. Chunks are sampled evenly
  across the transcript (not just the first N), so a long video's embedding
  reflects its whole runtime, not just its intro. The model is loaded
  lazily — importing this module, and therefore booting the app, never
  requires the model to already be downloaded.
- Duplicate detection is union-find clustering over pairwise cosine
  similarity (default threshold 0.87). Clustering is **transitive**: if
  video A and B are similar, and B and C are similar, all three end up in
  one cluster even if A and C alone fall short of the threshold. That's a
  known, honest property of this approach, not a bug.
- `difficulty.py` scores each transcript with `textstat` — Flesch reading
  ease (inverted, so higher = harder) combined with the share of
  "difficult" words, into a single 0-100 score labeled easy/medium/hard.
  No model, no LLM call — instant and fully deterministic.
- The analysis is split into **two endpoints on purpose**: `/compute` (does
  the expensive model inference, safe to call in small batches so a large
  playlist doesn't sit inside one long request) and `/duplicates` (cheap —
  just reads cached embeddings and does the math, so it must be called once
  over the *full* video list rather than per-batch, or duplicates split
  across batches would never get compared against each other).

### Known limitation: sentence-transformers' default install is large

`torch`'s default PyPI wheel bundles full CUDA support and can be 4-5GB,
even though this project only ever runs on CPU. See the install command in
step 4 above for the leaner alternative. Either way works — this only
affects disk space and download time, not functionality.

**Step 4 additions:**

- `llm_generation.py` calls Groq's OpenAI-compatible chat completions
  endpoint directly with `httpx` (no `groq` SDK dependency, consistent with
  how the rest of the backend talks to external APIs). See the file's
  docstring for the model-deprecation note above, in code, where you'll
  actually see it if you come back to this months from now.
- Uses Groq's **Structured Outputs in strict mode**
  (`response_format.json_schema.strict: true`) — this constrains decoding
  so the response is *guaranteed* to be valid JSON matching the schema.
  That eliminates an entire category of bugs (markdown-fenced JSON,
  truncated JSON, stray prose before/after the JSON) that a plain "please
  respond in JSON" prompt needs retry logic to handle. Only
  `openai/gpt-oss-20b` and `openai/gpt-oss-120b` support strict mode as of
  this writing — worth checking before switching models.
- **Rate limits are the real constraint, not request count.** The free tier
  gives this model roughly 8,000 tokens/minute. A single call here — system
  prompt + transcript + JSON schema + the generated notes/flashcards/quiz —
  easily uses 3,000-5,000 tokens, so only one or two calls fit per minute,
  not the ~30 the requests-per-minute number alone would suggest.
  `MIN_SECONDS_BETWEEN_CALLS` (25s) and `MAX_TRANSCRIPT_WORDS` (2000, so a
  very long lecture's transcript gets truncated) are both conservative on
  purpose. If you hit a 429 anyway, it's retried automatically using the
  `Retry-After` header Groq returns, up to 3 attempts.
- Study materials are generated **per video, on demand** rather than for a
  whole playlist in bulk — both because that's genuinely how someone would
  use this (you study one video at a time) and because a 30-video bulk
  generation at ~25s/video would take 10+ minutes and risk a request
  timeout on most hosts. A background job queue would be the right way to
  add bulk generation later; out of scope for this MVP.
- Generated notes/flashcards/quiz are cached permanently per video —
  regenerating only happens if you explicitly click "regenerate," since
  every generation call spends real (if free) Groq quota.

**Step 5 additions:**

- `scheduler.py` is a greedy, **sequential** bin-packer over playlist
  order — it does not reorder videos to pack days more tightly. Watching
  video 7 before video 3 in a course doesn't make sense pedagogically even
  if some other ordering fit better, so videos fill each day in the order
  given until the daily time budget would be exceeded, then the next day
  starts. A single video longer than the entire daily budget still gets its
  own day (flagged `exceeds_daily_budget`) rather than being dropped or
  split mid-video.
- `recommendations.py` only recommends skipping videos that step 3 flagged
  as near-duplicates of another video in the same cluster — it does not
  invent a "core vs. optional" judgment from difficulty or topic centrality,
  since that would need a real prerequisite/topic graph (step 6's job) to
  be defensible rather than a plausible-sounding guess. Within a duplicate
  cluster, the longest video is kept on the simple, stated assumption that
  a longer treatment is more likely to be the complete one.
- Both are **pure functions with no database or external API dependency** —
  a real change of pace from steps 2-4, where almost everything needed
  Supabase, YouTube, or Groq. That also means both were fully unit-tested
  for real in this sandbox (11 test cases total: empty input, single- and
  multi-day packing, an oversized-video edge case, speed-multiplier math,
  weekday-restricted date assignment, input validation, and duplicate-
  cluster recommendation logic including a video referenced in a cluster
  that doesn't exist) — no mocking needed, unlike every previous step.
- One bug this rigor actually caught: `ScheduledDay.date: Optional[date]`
  looked fine but silently broke, because the field name `date` shadowed
  the `datetime.date` type in its own annotation — Pydantic resolved the
  type as `None` instead of `Optional[date]`, and any real date value
  failed validation. Fixed by renaming the field to `scheduled_date`. This
  is a classic, easy-to-miss Python footgun: naming a field the same as a
  type it references in its own annotation.
- **Not covered by step 5** (or anywhere yet): progress tracking, revision
  history, and learning streaks — one of the ten original features, which
  fell out of the condensed 6-step roadmap along the way. It's a
  straightforward addition (a `progress` table + a couple of endpoints) if
  you want it folded into step 6 or added as a step 7 — just say so.

## What's next (step 6)

**Interactive knowledge graph + PDF/Markdown export.** Say "next step"
whenever you're ready and we'll build it on top of everything here.
