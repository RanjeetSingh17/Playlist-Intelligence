-- Run this once in your Supabase project's SQL Editor
-- (Project -> SQL Editor -> New query -> paste -> Run)
-- before starting the backend.

-- Videos are stored independently of any playlist, keyed by YouTube's own
-- video ID. A video can belong to more than one playlist, and later steps
-- (embeddings, difficulty scores) attach to this table by video_id.
create table if not exists videos (
    video_id text primary key,
    title text not null,
    channel_title text not null,
    thumbnail_url text not null,
    duration_seconds integer not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists playlists (
    playlist_id text primary key,
    title text not null,
    video_count integer not null,
    unavailable_count integer not null default 0,
    total_duration_seconds integer not null,
    imported_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Join table: which videos are in which playlist, and at what position.
create table if not exists playlist_videos (
    playlist_id text not null references playlists(playlist_id) on delete cascade,
    video_id text not null references videos(video_id) on delete cascade,
    position integer not null,
    primary key (playlist_id, video_id)
);

do $$ begin
    create type transcript_status as enum ('available', 'unavailable', 'error');
exception
    when duplicate_object then null;
end $$;

-- One row per video. 'error' means an infrastructure problem (e.g. YouTube
-- rate-limited or blocked the request) and is safe to retry later.
-- 'unavailable' means we successfully asked YouTube and it has no
-- transcript for this video — retrying won't change that.
create table if not exists transcripts (
    video_id text primary key references videos(video_id) on delete cascade,
    status transcript_status not null,
    language text,
    language_code text,
    is_generated boolean,
    segment_count integer,
    full_text text,
    error_message text,
    fetched_at timestamptz not null default now()
);

create index if not exists idx_playlist_videos_playlist on playlist_videos(playlist_id);
create index if not exists idx_transcripts_status on transcripts(status);

-- Step 3: one embedding vector per video, computed from its transcript.
-- Stored as a plain float array rather than pgvector — at the scale of a
-- single imported playlist (tens to a couple hundred videos), brute-force
-- cosine similarity in Python is instant, so a proper vector column with an
-- ANN index isn't buying anything yet. (Worth revisiting with pgvector if
-- this ever needs to compare across thousands of videos at once.)
create table if not exists embeddings (
    video_id text primary key references videos(video_id) on delete cascade,
    model_name text not null,
    embedding double precision[] not null,
    dimensions integer not null,
    created_at timestamptz not null default now()
);

create table if not exists difficulty_scores (
    video_id text primary key references videos(video_id) on delete cascade,
    flesch_reading_ease double precision,
    flesch_kincaid_grade double precision,
    technical_density double precision,
    difficulty_score double precision,
    difficulty_label text not null,
    computed_at timestamptz not null default now()
);

-- Step 4: LLM-generated notes/flashcards/quiz per video. notes, flashcards,
-- and quiz are stored as jsonb since they're nested arrays of objects —
-- Postgres jsonb round-trips these directly with no extra serialization
-- work needed on the Python side.
create table if not exists study_materials (
    video_id text primary key references videos(video_id) on delete cascade,
    model_name text not null,
    summary text not null,
    notes jsonb not null,
    flashcards jsonb not null,
    quiz jsonb not null,
    generated_at timestamptz not null default now()
);

-- This local, single-user application uses Supabase's anon key by design.
-- Make that expectation explicit so a project where RLS was enabled earlier
-- does not fail every cache read/write with a 42501 policy error.
alter table playlists disable row level security;
alter table videos disable row level security;
alter table playlist_videos disable row level security;
alter table transcripts disable row level security;
alter table embeddings disable row level security;
alter table difficulty_scores disable row level security;
alter table study_materials disable row level security;
