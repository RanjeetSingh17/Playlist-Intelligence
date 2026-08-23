from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import analysis, generate, planning, playlist, transcripts
from app.core.config import settings

app = FastAPI(
    title="YouTube Playlist Intelligence API",
    description="Backend for importing YouTube playlists and computing watch-time intelligence.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(playlist.router, prefix="/api/playlist", tags=["playlist"])
app.include_router(transcripts.router, prefix="/api/transcripts", tags=["transcripts"])
app.include_router(analysis.router, prefix="/api/analysis", tags=["analysis"])
app.include_router(generate.router, prefix="/api/generate", tags=["generate"])
app.include_router(planning.router, prefix="/api/planning", tags=["planning"])


@app.get("/")
def health_check():
    return {"status": "ok", "service": "YouTube Playlist Intelligence API"}
