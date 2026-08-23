from fastapi import APIRouter, HTTPException

from app.core.config import MissingConfigurationError
from app.models.schemas import StudyMaterialsRequest, StudyMaterialsResponse
from app.services.llm_generation import GroqAPIError, GroqRateLimitedError
from app.services.study_materials import ensure_study_materials

router = APIRouter()


@router.post("/study-materials", response_model=StudyMaterialsResponse)
async def generate_study_materials_route(payload: StudyMaterialsRequest):
    try:
        result = await ensure_study_materials(
            payload.video_id, force_regenerate=payload.force_regenerate
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except GroqRateLimitedError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except GroqAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except MissingConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return result
