from fastapi import UploadFile

from app.core.config import Settings
from app.schemas.image_analysis import ImageAnalysisFileError, ImageAnalysisItem, ImageAnalysisResponse
from app.services.ai_vision_adapter import VisionAnalysisContext, get_ai_vision_adapter
from app.services.image_service import MAX_IMAGE_ANALYSIS_BYTES, read_validated_image_upload


MAX_IMAGE_ANALYSIS_FILES = 10
MAX_IMAGE_ANALYSIS_ITEMS = 20


async def parse_image_to_task_suggestions(
    *,
    file: UploadFile,
    family_id: str,
    settings: Settings,
) -> ImageAnalysisResponse:
    return await parse_images_to_task_suggestions(files=[file], family_id=family_id, settings=settings)


async def parse_images_to_task_suggestions(
    *,
    files: list[UploadFile],
    family_id: str,
    settings: Settings,
    custom_instructions: str | None = None,
) -> ImageAnalysisResponse:
    if not files:
        return _analysis_response(warnings=["Selecione pelo menos uma imagem para interpretar."])

    if len(files) > MAX_IMAGE_ANALYSIS_FILES:
        return _analysis_response(warnings=[f"Envie no maximo {MAX_IMAGE_ANALYSIS_FILES} imagens por vez."])

    adapter = get_ai_vision_adapter(settings.ai_vision_provider)
    context = VisionAnalysisContext(
        family_id=family_id,
        provider=settings.ai_vision_provider,
        enabled=settings.ai_vision_enabled,
        openai_api_key=settings.openai_api_key,
        openai_vision_model=settings.openai_vision_model,
        openai_vision_timeout_seconds=settings.openai_vision_timeout_seconds,
        openai_vision_max_output_tokens=settings.openai_vision_max_output_tokens,
        custom_instructions=custom_instructions,
    )

    items = []
    warnings = []
    image_errors: list[ImageAnalysisFileError] = []
    processed = 0

    for file in files:
        filename = (file.filename or "")[:255] or None
        try:
            image = await read_validated_image_upload(
                file,
                max_bytes=MAX_IMAGE_ANALYSIS_BYTES,
                max_bytes_detail="A imagem deve ter no maximo 8 MB.",
            )
            result = adapter.parse_image_to_task_suggestions(image, context)
            processed += 1
            items.extend(_apply_custom_instruction_defaults(result.items, custom_instructions))
            warnings.extend(result.warnings or [])
        except Exception as exc:  # noqa: BLE001 - batch imports must keep other images alive.
            detail = getattr(exc, "detail", None) or str(exc) or "Nao foi possivel interpretar esta imagem."
            image_errors.append(ImageAnalysisFileError(filename=filename, reason=str(detail)[:300]))

    limited_items = items[:MAX_IMAGE_ANALYSIS_ITEMS]
    if len(items) > len(limited_items):
        warnings.append("A IA encontrou mais de 20 sugestoes; apenas as 20 primeiras foram carregadas para revisao.")
    if image_errors:
        warnings.append("Algumas imagens nao puderam ser processadas. Revise os erros por imagem.")
    if processed and not limited_items:
        warnings.append("Nenhuma tarefa clara foi encontrada nas imagens processadas.")

    confidence_values = [item.confidence for item in limited_items]
    overall_confidence = sum(confidence_values) / len(confidence_values) if confidence_values else 0.0

    return ImageAnalysisResponse(
        overallConfidence=overall_confidence,
        items=limited_items,
        warnings=list(dict.fromkeys(warnings))[:10],
        needsUserReview=True,
        imageErrors=image_errors[:10],
        totalImagesProcessed=processed,
        totalSuggestionsGenerated=len(limited_items),
    )


def _analysis_response(*, warnings: list[str]) -> ImageAnalysisResponse:
    return ImageAnalysisResponse(
        overallConfidence=0.0,
        items=[],
        warnings=warnings[:10],
        needsUserReview=True,
        imageErrors=[],
        totalImagesProcessed=0,
        totalSuggestionsGenerated=0,
    )


def _apply_custom_instruction_defaults(items: list[ImageAnalysisItem], custom_instructions: str | None) -> list[ImageAnalysisItem]:
    instructions = (custom_instructions or "").strip().lower()
    if not instructions:
        return items

    reminder = _preferred_reminder(instructions)
    wants_calendar = "google agenda" in instructions or "google calendar" in instructions
    mentions_multiple_reminders = reminder and _mentions_multiple_reminders(instructions)
    updated_items = []

    for item in items:
        warnings = list(item.warnings or [])
        patch = {}

        if reminder:
            if item.date:
                if not item.reminderEnabled:
                    patch.update({"reminderEnabled": True, "reminderValue": reminder[0], "reminderUnit": reminder[1]})
                if mentions_multiple_reminders:
                    warnings.append("As instrucoes pedem mais de um lembrete, mas o CasaSync suporta um lembrete por tarefa nesta etapa.")
            else:
                warnings.append("As instrucoes pedem lembrete, mas a IA nao encontrou data suficiente para criar lembrete valido.")

        if wants_calendar:
            if item.date and item.time:
                patch["googleCalendarSuggestion"] = True
            elif item.date:
                warnings.append("As instrucoes pedem Google Agenda, mas falta horario para sincronizar com seguranca.")

        if warnings != list(item.warnings or []):
            patch["warnings"] = list(dict.fromkeys(warnings))[:10]
        updated_items.append(item.model_copy(update=patch) if patch else item)

    return updated_items


def _preferred_reminder(instructions: str) -> tuple[int, str] | None:
    if any(term in instructions for term in ("1 hora", "uma hora", "1h", "60 minutos")):
        return 1, "hours"
    if any(term in instructions for term in ("1 dia", "um dia", "24 horas")):
        return 1, "days"
    if any(term in instructions for term in ("15 minutos", "15 min")):
        return 15, "minutes"
    return None


def _mentions_multiple_reminders(instructions: str) -> bool:
    hour = any(term in instructions for term in ("1 hora", "uma hora", "1h", "60 minutos"))
    day = any(term in instructions for term in ("1 dia", "um dia", "24 horas"))
    return hour and day
