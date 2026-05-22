import re

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.schemas.image_analysis import ImageAnalysisFileError, ImageAnalysisItem, ImageAnalysisResponse
from app.services.ai_vision_adapter import VisionAnalysisContext, get_ai_vision_adapter
from app.services.ai_task_suggestion_post_processor import (
    AiSuggestionContext,
    build_ai_suggestion_context,
    categories_for_prompt,
    current_backend_datetime_for_prompt,
    members_for_prompt,
    post_process_image_analysis_response,
)
from app.services.image_service import MAX_IMAGE_ANALYSIS_BYTES, ValidatedImageUpload, read_validated_image_upload
from app.services.reminder_rules import normalize_reminder_entries


MAX_IMAGE_ANALYSIS_FILES = 10
MAX_IMAGE_ANALYSIS_ITEMS = 40


async def parse_image_to_task_suggestions(
    *,
    file: UploadFile,
    family_id: str,
    settings: Settings,
    db: Session | None = None,
) -> ImageAnalysisResponse:
    return await parse_images_to_task_suggestions(files=[file], family_id=family_id, settings=settings, db=db)


async def parse_images_to_task_suggestions(
    *,
    files: list[UploadFile],
    family_id: str,
    settings: Settings,
    custom_instructions: str | None = None,
    image_context: str | None = None,
    db: Session | None = None,
) -> ImageAnalysisResponse:
    if not files:
        return _analysis_response(warnings=["Selecione pelo menos uma imagem para interpretar."])

    if len(files) > MAX_IMAGE_ANALYSIS_FILES:
        return _analysis_response(warnings=[f"Envie no maximo {MAX_IMAGE_ANALYSIS_FILES} imagens por vez."])

    validated_images: list[ValidatedImageUpload] = []
    image_errors: list[ImageAnalysisFileError] = []

    for file in files:
        filename = (file.filename or "")[:255] or None
        try:
            validated_images.append(
                await read_validated_image_upload(
                    file,
                    max_bytes=MAX_IMAGE_ANALYSIS_BYTES,
                    max_bytes_detail="A imagem deve ter no maximo 8 MB.",
                )
            )
        except Exception as exc:  # noqa: BLE001 - batch imports must keep other images alive.
            detail = getattr(exc, "detail", None) or str(exc) or "Nao foi possivel interpretar esta imagem."
            image_errors.append(ImageAnalysisFileError(filename=filename, reason=str(detail)[:300]))

    if not validated_images:
        return _analysis_response(
            warnings=["Nenhuma imagem valida ficou pronta para interpretacao."],
            image_errors=image_errors,
        )

    return parse_validated_images_to_task_suggestions(
        images=validated_images,
        family_id=family_id,
        settings=settings,
        custom_instructions=custom_instructions,
        image_context=image_context,
        db=db,
        initial_image_errors=image_errors,
    )


def parse_validated_images_to_task_suggestions(
    *,
    images: list[ValidatedImageUpload],
    family_id: str,
    settings: Settings,
    custom_instructions: str | None = None,
    image_context: str | None = None,
    db: Session | None = None,
    initial_image_errors: list[ImageAnalysisFileError] | None = None,
) -> ImageAnalysisResponse:
    adapter = get_ai_vision_adapter(settings.ai_vision_provider)
    suggestion_context = (
        build_ai_suggestion_context(
            db,
            family_id,
            custom_instructions=custom_instructions,
            image_context=image_context,
            timezone_name=settings.google_calendar_default_timezone or "America/Sao_Paulo",
        )
        if db is not None
        else AiSuggestionContext(custom_instructions=custom_instructions, image_context=image_context)
    )
    context = VisionAnalysisContext(
        family_id=family_id,
        provider=settings.ai_vision_provider,
        enabled=settings.ai_vision_enabled,
        openai_api_key=settings.openai_api_key,
        openai_vision_model=settings.openai_vision_model,
        openai_vision_timeout_seconds=settings.openai_vision_timeout_seconds,
        openai_vision_max_output_tokens=settings.openai_vision_max_output_tokens,
        custom_instructions=custom_instructions,
        image_context=image_context,
        members=members_for_prompt(suggestion_context),
        categories=categories_for_prompt(suggestion_context),
        timezone_name=suggestion_context.timezone_name,
        current_datetime=current_backend_datetime_for_prompt(suggestion_context),
    )
    combined_instruction_context = _combined_instruction_context(custom_instructions, image_context)

    items = []
    warnings = []
    image_errors: list[ImageAnalysisFileError] = list(initial_image_errors or [])
    processed = 0

    for image in images:
        filename = (image.filename or "")[:255] or None
        try:
            result = adapter.parse_image_to_task_suggestions(image, context)
            processed += 1
            items.extend(_apply_custom_instruction_defaults(result.items, combined_instruction_context))
            warnings.extend(result.warnings or [])
        except Exception as exc:  # noqa: BLE001 - batch imports must keep other images alive.
            detail = getattr(exc, "detail", None) or str(exc) or "Nao foi possivel interpretar esta imagem."
            image_errors.append(ImageAnalysisFileError(filename=filename, reason=str(detail)[:300]))

    limited_items = items[:MAX_IMAGE_ANALYSIS_ITEMS]
    if len(items) > len(limited_items):
        warnings.append(f"A IA encontrou mais de {MAX_IMAGE_ANALYSIS_ITEMS} sugestoes; apenas as primeiras foram carregadas para revisao.")
    if image_errors:
        warnings.append("Algumas imagens nao puderam ser processadas. Revise os erros por imagem.")
    if processed and not limited_items:
        warnings.append("Nenhuma tarefa clara foi encontrada nas imagens processadas.")

    confidence_values = [item.confidence for item in limited_items]
    overall_confidence = sum(confidence_values) / len(confidence_values) if confidence_values else 0.0

    response = ImageAnalysisResponse(
        overallConfidence=overall_confidence,
        items=limited_items,
        warnings=list(dict.fromkeys(warnings))[:10],
        needsUserReview=True,
        imageErrors=image_errors[:10],
        totalImagesProcessed=processed,
        totalSuggestionsGenerated=len(limited_items),
    )
    return post_process_image_analysis_response(response, suggestion_context)


def _combined_instruction_context(custom_instructions: str | None, image_context: str | None) -> str | None:
    parts = []
    if custom_instructions:
        parts.append(custom_instructions)
    if image_context:
        parts.append(image_context)
    return "\n".join(parts) if parts else None


def _analysis_response(*, warnings: list[str], image_errors: list[ImageAnalysisFileError] | None = None) -> ImageAnalysisResponse:
    return ImageAnalysisResponse(
        overallConfidence=0.0,
        items=[],
        warnings=warnings[:10],
        needsUserReview=True,
        imageErrors=list(image_errors or [])[:10],
        totalImagesProcessed=0,
        totalSuggestionsGenerated=0,
    )


def _apply_custom_instruction_defaults(items: list[ImageAnalysisItem], custom_instructions: str | None) -> list[ImageAnalysisItem]:
    instructions = (custom_instructions or "").strip().lower()
    if not instructions:
        return items

    reminders = _preferred_reminders(instructions)
    wants_calendar = "google agenda" in instructions or "google calendar" in instructions
    updated_items = []

    for item in items:
        warnings = list(item.warnings or [])
        patch = {}

        if reminders:
            if item.date:
                merged_reminders = _merge_reminders(
                    [(reminder.value, reminder.unit) for reminder in (item.reminders or [])],
                    reminders,
                )
                if merged_reminders:
                    first_value, first_unit = merged_reminders[0]
                    patch.update(
                        {
                            "reminderEnabled": True,
                            "reminderValue": first_value,
                            "reminderUnit": first_unit,
                            "reminders": [{"value": value, "unit": unit} for value, unit in merged_reminders],
                        }
                    )
            else:
                warnings.append("As instrucoes pedem lembrete, mas a IA nao encontrou data suficiente para criar lembrete valido.")

        if wants_calendar:
            if item.date and item.time:
                patch["googleCalendarSuggestion"] = True
            elif item.date:
                warnings.append("As instrucoes pedem Google Agenda, mas falta horario para sincronizar com seguranca.")

        if warnings != list(item.warnings or []):
            patch["warnings"] = list(dict.fromkeys(warnings))[:10]
        updated_items.append(ImageAnalysisItem.model_validate({**item.model_dump(), **patch}) if patch else item)

    return updated_items


def _merge_reminders(*groups: list[tuple[int, str]]) -> list[tuple[int, str]]:
    raw = [{"value": value, "unit": unit} for group in groups for value, unit in group]
    normalized, _, _ = normalize_reminder_entries(raw)
    return normalized


def _preferred_reminders(instructions: str) -> list[tuple[int, str]]:
    candidates: list[tuple[int, str]] = []
    normalized = instructions.replace("uma hora", "1 hora").replace("um dia", "1 dia")
    for value, unit in re.findall(r"\b(\d{1,4})\s*(minutos?|mins?|min)\b", normalized):
        candidates.append((int(value), "minutes"))
    for value, unit in re.findall(r"\b(\d{1,4})\s*(horas?|hrs?|h)\b", normalized):
        candidates.append((int(value), "hours"))
    for value, unit in re.findall(r"\b(\d{1,4})\s*(dias?|d)\b", normalized):
        candidates.append((int(value), "days"))
    if "60 minutos" in normalized:
        candidates.append((1, "hours"))
    if "24 horas" in normalized:
        candidates.append((1, "days"))
    return _merge_reminders(candidates)
