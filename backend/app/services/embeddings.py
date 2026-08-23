"""
Transcript embeddings + duplicate detection.

Uses sentence-transformers' all-MiniLM-L6-v2: small (~80MB), fast on CPU,
384-dimensional embeddings — enough to detect near-duplicate video content
without a GPU or a paid API.

The model is imported and loaded lazily, inside _get_model(), not at module
load time. That means importing this module — and therefore booting the
app — never requires network access or the (fairly heavy) torch dependency
to already be resolvable; the cost is only paid the first time an embedding
is actually requested.
"""
from functools import lru_cache
from typing import Dict, List

import numpy as np

MODEL_NAME = "all-MiniLM-L6-v2"
MAX_CHUNKS_PER_VIDEO = 20
WORDS_PER_CHUNK = 200
DEFAULT_DUPLICATE_THRESHOLD = 0.87


@lru_cache
def _get_model():
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(MODEL_NAME)


def _chunk_text(text: str, words_per_chunk: int = WORDS_PER_CHUNK) -> List[str]:
    words = text.split()
    if not words:
        return []
    return [
        " ".join(words[i : i + words_per_chunk])
        for i in range(0, len(words), words_per_chunk)
    ]


def _select_chunks(chunks: List[str], max_chunks: int = MAX_CHUNKS_PER_VIDEO) -> List[str]:
    """
    Evenly samples across the transcript instead of taking only the first
    N chunks, so a long video's embedding reflects its whole runtime rather
    than just its intro.
    """
    if len(chunks) <= max_chunks:
        return chunks
    step = len(chunks) / max_chunks
    return [chunks[int(i * step)] for i in range(max_chunks)]


def generate_video_embedding(transcript_text: str) -> List[float]:
    """Chunks the transcript, embeds each chunk, and mean-pools into one
    video-level vector (re-normalized, since the mean of unit vectors isn't
    itself unit length)."""
    chunks = _select_chunks(_chunk_text(transcript_text))
    if not chunks:
        raise ValueError("Transcript has no content to embed.")

    model = _get_model()
    chunk_vectors = model.encode(chunks, normalize_embeddings=True)
    video_vector = np.mean(chunk_vectors, axis=0)

    norm = np.linalg.norm(video_vector)
    if norm > 0:
        video_vector = video_vector / norm

    return video_vector.tolist()


def cosine_similarity(a: List[float], b: List[float]) -> float:
    a_arr, b_arr = np.array(a, dtype=float), np.array(b, dtype=float)
    denom = np.linalg.norm(a_arr) * np.linalg.norm(b_arr)
    if denom == 0:
        return 0.0
    return float(np.dot(a_arr, b_arr) / denom)


def find_duplicate_clusters(
    embeddings: Dict[str, List[float]],
    threshold: float = DEFAULT_DUPLICATE_THRESHOLD,
) -> List[List[str]]:
    """
    Union-find clustering: any two videos whose embeddings are cosine-similar
    at or above `threshold` land in the same cluster, and membership is
    transitive — if A~B and B~C both clear the bar, all three end up
    together even if A and C alone fall just short of it. That's a known,
    honest limitation of this approach (a long "chain" of similar videos
    can merge into one cluster) rather than a bug.

    A cluster of size 1 means no duplicate was found for that video and is
    excluded from the result.
    """
    video_ids = list(embeddings.keys())
    parent = {vid: vid for vid in video_ids}

    def find(vid: str) -> str:
        while parent[vid] != vid:
            parent[vid] = parent[parent[vid]]
            vid = parent[vid]
        return vid

    def union(a: str, b: str) -> None:
        root_a, root_b = find(a), find(b)
        if root_a != root_b:
            parent[root_b] = root_a

    for i in range(len(video_ids)):
        for j in range(i + 1, len(video_ids)):
            vid_a, vid_b = video_ids[i], video_ids[j]
            if cosine_similarity(embeddings[vid_a], embeddings[vid_b]) >= threshold:
                union(vid_a, vid_b)

    clusters: Dict[str, List[str]] = {}
    for vid in video_ids:
        root = find(vid)
        clusters.setdefault(root, []).append(vid)

    return [members for members in clusters.values() if len(members) > 1]
