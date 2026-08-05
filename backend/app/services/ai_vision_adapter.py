import base64
import json
import re
import socket
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Protocol
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import HTTPException, status
from pydantic import ValidationError

from app.schemas.image_analysis import ImageAnalysisResponse
from app.services.image_service import ValidatedImageUpload
from app.services.reminder_rules import normalize_reminder_entries


OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME_RE = re.compile(r"^\d{2}:\d{2}$")
TYPE_VALUES = {"task", "event", "reminder"}
PRIORITY_VALUES = {"low", "medium", "high", "urgent"}
RETRYABLE_QUALITY_REASONS = {
    "schema_invalid",
    "invalid_member_id",
    "ambiguous_assignee",
    "missing_essential_date",
    "missing_block_evidence",
    "low_confidence",
    "model_requested_confirmation",
    "contradictory_evidence",
    "unsafe_block_association",
}


def _nullable_string() -> dict:
    return {"anyOf": [{"type": "string"}, {"type": "null"}]}


SOURCE_EVIDENCE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "dateText": _nullable_string(),
        "personText": _nullable_string(),
        "roleText": _nullable_string(),
        "descriptionTexts": {"type": "array", "items": {"type": "string"}},
        "blockText": _nullable_string(),
        "locationText": _nullable_string(),
    },
    "required": ["dateText", "personText", "roleText", "descriptionTexts", "blockText", "locationText"],
}

IMAGE_ANALYSIS_JSON_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "sourceType": {"type": "string", "enum": ["image"]},
        "overallConfidence": {"type": "number"},
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "type": {"type": "string", "enum": ["task", "event", "reminder"]},
                    "title": {"type": "string"},
                    "description": _nullable_string(),
                    "date": _nullable_string(),
                    "time": _nullable_string(),
                    "endDate": _nullable_string(),
                    "endTime": _nullable_string(),
                    "dateYearSource": {"anyOf": [{"type": "string", "enum": ["explicit", "inferred", "unknown"]}, {"type": "null"}]},
                    "category": _nullable_string(),
                    "categoryId": _nullable_string(),
                    "priority": {"anyOf": [{"type": "string", "enum": ["low", "medium", "high", "urgent"]}, {"type": "null"}]},
                    "responsible": _nullable_string(),
                    "assigneeId": _nullable_string(),
                    "assigneeIds": {"type": "array", "items": {"type": "string"}},
                    "responsibleAliasMatched": _nullable_string(),
                    "roleDetected": _nullable_string(),
                    "location": _nullable_string(),
                    "confidence": {"type": "number"},
                    "warnings": {"type": "array", "items": {"type": "string"}},
                    "reminderEnabled": {"type": "boolean"},
                    "reminderValue": {"anyOf": [{"type": "integer", "minimum": 1, "maximum": 4320}, {"type": "null"}]},
                    "reminderUnit": {"anyOf": [{"type": "string", "enum": ["minutes", "hours", "days"]}, {"type": "null"}]},
                    "reminders": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "value": {"type": "integer", "minimum": 1, "maximum": 4320},
                                "unit": {"type": "string", "enum": ["minutes", "hours", "days"]},
                            },
                            "required": ["value", "unit"],
                        },
                    },
                    "sourceImageName": _nullable_string(),
                    "originalText": _nullable_string(),
                    "needsReview": {"type": "boolean", "enum": [True]},
                    "needsConfirmation": {"type": "boolean"},
                    "sourceEvidence": SOURCE_EVIDENCE_SCHEMA,
                    "googleCalendarSuggestion": {"type": "boolean"},
                },
                "required": [
                    "type", "title", "description", "date", "time", "endDate", "endTime", "dateYearSource",
                    "category", "categoryId", "priority", "responsible", "assigneeId", "assigneeIds",
                    "responsibleAliasMatched", "roleDetected", "location", "confidence", "warnings",
                    "reminderEnabled", "reminderValue", "reminderUnit", "reminders", "sourceImageName",
                    "originalText", "needsReview", "needsConfirmation", "sourceEvidence", "googleCalendarSuggestion",
                ],
            },
        },
        "warnings": {"type": "array", "items": {"type": "string"}},
        "needsUserReview": {"type": "boolean", "enum": [True]},
        "imageErrors": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {"filename": _nullable_string(), "reason": {"type": "string"}},
                "required": ["filename", "reason"],
            },
        },
        "totalImagesProcessed": {"type": "integer"},
        "totalSuggestionsGenerated": {"type": "integer"},
    },
    "required": ["sourceType", "overallConfidence", "items", "warnings", "needsUserReview", "imageErrors", "totalImagesProcessed", "totalSuggestionsGenerated"],
}


@dataclass(frozen=True)
class VisionAnalysisContext:
    family_id: str
    provider: str
    enabled: bool
    openai_api_key: str | None
    openai_vision_model: str
    openai_vision_reasoning_effort: str = "medium"
    openai_vision_retry_reasoning_effort: str = "high"
    openai_vision_max_attempts: int = 2
    openai_vision_auto_confirm_threshold: float = 0.90
    openai_vision_image_detail: str = "high"
    openai_vision_timeout_seconds: float = 45.0
    openai_vision_max_output_tokens: int = 2200
    custom_instructions: str | None = None
    image_context: str | None = None
    members: list[dict] | None = None
    categories: list[dict] | None = None
    timezone_name: str = "America/Sao_Paulo"
    current_datetime: str | None = None


class AiVisionAdapter(Protocol):
    def parse_image_to_task_suggestions(self, image: ValidatedImageUpload, context: VisionAnalysisContext) -> ImageAnalysisResponse:
        ...


class VisionResponseError(Exception):
    def __init__(self, reason: str, message: str):
        super().__init__(message)
        self.reason = reason


def _warning_response(*warnings: str, attempt_count: int = 0, retry_reasons: list[str] | None = None) -> ImageAnalysisResponse:
    return ImageAnalysisResponse(
        overallConfidence=0.0,
        items=[],
        warnings=[warning for warning in warnings if warning][:10],
        needsUserReview=True,
        attemptCount=attempt_count,
        retryReasons=list(dict.fromkeys(retry_reasons or []))[:10],
        totalImagesProcessed=0,
        totalSuggestionsGenerated=0,
    )


def _provider_unavailable(detail: str, *, status_code: int = status.HTTP_503_SERVICE_UNAVAILABLE) -> HTTPException:
    return HTTPException(status_code=status_code, detail=detail)


def _clean_optional_text(value, max_length: int) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text[:max_length] or None


def _as_list(value) -> list:
    return value if isinstance(value, list) else []


def _clean_confidence(value) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(1.0, parsed))


def _clean_date(value) -> str | None:
    text = _clean_optional_text(value, 10)
    return text if text and DATE_RE.match(text) else None


def _clean_time(value) -> str | None:
    text = _clean_optional_text(value, 5)
    return text if text and TIME_RE.match(text) else None


def _clean_year_source(value) -> str | None:
    text = _clean_optional_text(value, 16)
    return text if text in {"explicit", "inferred", "unknown"} else None


def _clean_reminders(raw_item: dict) -> list[dict]:
    reminders = []
    for raw_reminder in _as_list(raw_item.get("reminders")):
        if isinstance(raw_reminder, dict):
            reminders.append({"value": raw_reminder.get("value"), "unit": raw_reminder.get("unit")})
    reminders.append({"value": raw_item.get("reminderValue"), "unit": raw_item.get("reminderUnit")})
    normalized, _, _ = normalize_reminder_entries(reminders)
    return [{"value": value, "unit": unit} for value, unit in normalized]


def _clean_source_evidence(raw_value) -> dict:
    raw = raw_value if isinstance(raw_value, dict) else {}
    return {
        "dateText": _clean_optional_text(raw.get("dateText"), 180),
        "personText": _clean_optional_text(raw.get("personText"), 180),
        "roleText": _clean_optional_text(raw.get("roleText"), 180),
        "descriptionTexts": [_clean_optional_text(value, 180) for value in _as_list(raw.get("descriptionTexts")) if _clean_optional_text(value, 180)][:8],
        "blockText": _clean_optional_text(raw.get("blockText"), 600),
        "locationText": _clean_optional_text(raw.get("locationText"), 180),
    }


def _sanitize_openai_payload(payload: dict, context: VisionAnalysisContext) -> dict:
    warnings = [str(warning).strip()[:240] for warning in _as_list(payload.get("warnings")) if str(warning).strip()][:10]
    valid_member_ids = {str(member.get("id")) for member in (context.members or []) if member.get("id")}
    items = []
    for raw_item in _as_list(payload.get("items"))[:40]:
        if not isinstance(raw_item, dict):
            warnings.append("Uma sugestao fora do formato esperado foi ignorada.")
            continue
        title = str(raw_item.get("title") or "").strip()[:180]
        if len(title) < 2:
            warnings.append("Uma sugestao sem titulo confiavel foi ignorada.")
            continue
        item_type = str(raw_item.get("type") or "task").strip().lower()
        priority = raw_item.get("priority")
        priority = str(priority).strip().lower() if priority is not None else None
        raw_ids = [str(value).strip()[:36] for value in _as_list(raw_item.get("assigneeIds")) if str(value).strip()]
        single_id = raw_item.get("assigneeId") or raw_item.get("responsibleUserId")
        if single_id:
            raw_ids.append(str(single_id).strip()[:36])
        invalid_ids = [value for value in raw_ids if value not in valid_member_ids]
        if invalid_ids:
            warnings.append("Um responsavel retornado pela IA nao pertence a familia ativa e foi removido.")
        assignee_ids = list(dict.fromkeys(value for value in raw_ids if value in valid_member_ids))[:20]
        reminders = _clean_reminders(raw_item)
        first_reminder = reminders[0] if reminders else None
        evidence = _clean_source_evidence(raw_item.get("sourceEvidence"))
        needs_confirmation = bool(raw_item.get("needsConfirmation")) or bool(invalid_ids)
        item_warnings = [str(value).strip()[:240] for value in _as_list(raw_item.get("warnings")) if str(value).strip()][:10]
        if invalid_ids:
            item_warnings.append("Responsavel invalido removido; confirme um membro da familia.")
            needs_confirmation = True
        items.append(
            {
                "type": item_type if item_type in TYPE_VALUES else "task",
                "title": title,
                "description": _clean_optional_text(raw_item.get("description"), 1200),
                "date": _clean_date(raw_item.get("date")),
                "time": _clean_time(raw_item.get("time") or raw_item.get("startTime")),
                "endDate": _clean_date(raw_item.get("endDate")),
                "endTime": _clean_time(raw_item.get("endTime")),
                "category": _clean_optional_text(raw_item.get("category"), 80),
                "dateYearSource": _clean_year_source(raw_item.get("dateYearSource")),
                "categoryId": _clean_optional_text(raw_item.get("categoryId"), 36),
                "priority": priority if priority in PRIORITY_VALUES else None,
                "responsible": _clean_optional_text(raw_item.get("responsible") or raw_item.get("responsibleNameDetected"), 120),
                "assigneeId": assignee_ids[0] if assignee_ids else None,
                "assigneeIds": assignee_ids,
                "responsibleAliasMatched": _clean_optional_text(raw_item.get("responsibleAliasMatched"), 80),
                "roleDetected": _clean_optional_text(raw_item.get("roleDetected"), 120),
                "location": _clean_optional_text(raw_item.get("location"), 180),
                "confidence": _clean_confidence(raw_item.get("confidence")),
                "warnings": list(dict.fromkeys(item_warnings))[:10],
                "reminderEnabled": bool(raw_item.get("reminderEnabled") or reminders) and bool(first_reminder),
                "reminderValue": first_reminder["value"] if first_reminder else None,
                "reminderUnit": first_reminder["unit"] if first_reminder else None,
                "reminders": reminders if first_reminder else [],
                "sourceImageName": _clean_optional_text(raw_item.get("sourceImageName"), 255),
                "originalText": _clean_optional_text(raw_item.get("originalText"), 1200),
                "needsReview": True,
                "needsConfirmation": needs_confirmation,
                "sourceEvidence": evidence,
                "googleCalendarSuggestion": bool(raw_item.get("googleCalendarSuggestion")),
            }
        )
    return {
        "sourceType": "image",
        "overallConfidence": _clean_confidence(payload.get("overallConfidence")),
        "items": items,
        "warnings": warnings[:10],
        "needsUserReview": True,
        "imageErrors": [],
        "totalImagesProcessed": 1,
        "totalSuggestionsGenerated": len(items),
    }


class OpenAIVisionAdapter:
    provider = "openai"

    def parse_image_to_task_suggestions(self, image: ValidatedImageUpload, context: VisionAnalysisContext) -> ImageAnalysisResponse:
        if not context.enabled:
            raise _provider_unavailable("IA real por imagem esta desativada. Configure AI_VISION_ENABLED=true no backend.")
        if not context.openai_api_key:
            raise _provider_unavailable("OPENAI_API_KEY nao configurada no backend.")

        max_attempts = max(1, min(int(context.openai_vision_max_attempts or 2), 2))
        retry_reasons: list[str] = []
        usage_totals = None
        last_error: VisionResponseError | None = None
        for attempt in range(max_attempts):
            effort = context.openai_vision_reasoning_effort if attempt == 0 else context.openai_vision_retry_reasoning_effort
            payload = self._build_payload(image, context, reasoning_effort=effort)
            try:
                response_body = self._call_openai(payload, context)
                usage_totals = _merge_usage(usage_totals, _usage_from_response(response_body))
                result = self._parse_response(response_body, image, context)
                quality_reasons = self._quality_reasons(result, context)
                if quality_reasons and attempt + 1 < max_attempts:
                    retry_reasons.extend(quality_reasons)
                    continue
                if quality_reasons:
                    retry_reasons.extend(quality_reasons)
                    result = result.model_copy(
                        update={
                            "warnings": list(dict.fromkeys([*result.warnings, "A segunda analise continuou ambigua; confirme antes de criar."]))[:10],
                            "items": [item.model_copy(update={"needsConfirmation": True}) for item in result.items],
                            "usage": usage_totals,
                        }
                    )
                return result.model_copy(
                    update={
                        "attemptCount": attempt + 1,
                        "retryReasons": list(dict.fromkeys(retry_reasons))[:10],
                        "usage": usage_totals,
                    }
                )
            except VisionResponseError as exc:
                last_error = exc
                if exc.reason == "network_transient" and attempt + 1 < max_attempts:
                    retry_reasons.append(exc.reason)
                    continue
                if exc.reason not in RETRYABLE_QUALITY_REASONS and exc.reason != "network_transient":
                    return _warning_response(str(exc), attempt_count=attempt + 1, retry_reasons=retry_reasons)
                if exc.reason in RETRYABLE_QUALITY_REASONS and attempt + 1 < max_attempts:
                    retry_reasons.append(exc.reason)
                    continue
                if attempt + 1 >= max_attempts:
                    retry_reasons.append(exc.reason)
                    return _warning_response(
                        "A IA retornou dados fora do schema esperado. Nenhuma tarefa foi criada.",
                        attempt_count=attempt + 1,
                        retry_reasons=retry_reasons,
                    )
        if last_error:
            return _warning_response("A IA nao retornou sugestoes confiaveis.", attempt_count=max_attempts, retry_reasons=retry_reasons)
        return _warning_response("A IA nao encontrou conteudo util na imagem.", attempt_count=max_attempts, retry_reasons=retry_reasons)

    def _call_openai(self, payload: dict, context: VisionAnalysisContext) -> dict:
        request = Request(
            OPENAI_RESPONSES_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Authorization": f"Bearer {context.openai_api_key}", "Content-Type": "application/json"},
            method="POST",
        )
        try:
            timeout = max(5.0, min(float(context.openai_vision_timeout_seconds or 20.0), 60.0))
            with urlopen(request, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            if exc.code >= 500:
                raise VisionResponseError("network_transient", _openai_http_error_message(exc)) from exc
            raise _provider_unavailable(_openai_http_error_message(exc), status_code=status.HTTP_502_BAD_GATEWAY) from exc
        except (URLError, TimeoutError, socket.timeout) as exc:
            raise VisionResponseError("network_transient", "Tempo esgotado ao analisar a imagem com IA.") from exc
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise VisionResponseError("schema_invalid", "A OpenAI retornou uma resposta invalida.") from exc

    def _build_payload(self, image: ValidatedImageUpload, context: VisionAnalysisContext, *, reasoning_effort: str | None = None) -> dict:
        base64_image = base64.b64encode(image.content).decode("ascii")
        data_url = f"data:{image.content_type};base64,{base64_image}"
        current_datetime = context.current_datetime or datetime.now(timezone.utc).isoformat()
        members_json = json.dumps(context.members or [], ensure_ascii=False)
        categories_json = json.dumps(context.categories or [], ensure_ascii=False)
        return {
            "model": context.openai_vision_model or "gpt-5.6-luna",
            "reasoning": {"effort": reasoning_effort or context.openai_vision_reasoning_effort},
            "max_output_tokens": max(300, min(int(context.openai_vision_max_output_tokens or 1200), 4000)),
            "text": {"format": {"type": "json_schema", "name": "casasync_image_task_suggestions", "strict": True, "schema": IMAGE_ANALYSIS_JSON_SCHEMA}},
            "store": False,
            "input": [
                {
                    "role": "system",
                    "content": [{"type": "input_text", "text": self._system_prompt()}],
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": self._user_prompt(image, context, current_datetime, members_json, categories_json)},
                        {"type": "input_image", "image_url": data_url, "detail": context.openai_vision_image_detail},
                    ],
                },
            ],
        }

    @staticmethod
    def _system_prompt() -> str:
        return (
            "Voce extrai tarefas, eventos e lembretes de imagens para o CasaSync. Responda somente no JSON Schema. "
            "Nunca crie registros. Nao invente datas, horarios, IDs, nomes ou evidencias. Pessoas fora da familia sao apenas contexto. "
            "Se houver qualquer ambiguidade, contradicao, recorte, baixa legibilidade ou associacao insegura, use null, warning, "
            "needsConfirmation=true e preserve a evidencia textual curta. O backend valida novamente todos os IDs e a familia."
        )

    @staticmethod
    def _user_prompt(image: ValidatedImageUpload, context: VisionAnalysisContext, current_datetime: str, members_json: str, categories_json: str) -> str:
        return (
            f"Analise a imagem {image.filename or 'enviada'} hierarquicamente. Ela pode conter listas, conversas, calendarios, convites, "
            "cronogramas, tabelas ou escalas. Identifique primeiro cabecalhos, datas, horarios, linhas, colunas e blocos; depois associe "
            "cada pessoa, funcao e descricao ao mesmo bloco, sem misturar celulas mescladas, colunas ou datas. Em escalas de igreja, "
            "crie somente ocorrencias dos membros da familia e mantenha louvores/observacoes do bloco correto. Nao invente horario ausente. "
            "Diferencie tarefa, evento e lembrete; eventos e lembretes precisam de data para serem seguros. Datas relativas usam a referencia "
            f"{current_datetime} e o fuso {context.timezone_name}. Use YYYY-MM-DD e HH:mm. "
            "Use somente IDs da lista familyMembers; aliases somente se estiverem no campo aliases. Se nome ou alias for ambiguo, inexistente "
            "ou externo, deixe assigneeIds vazio, mantenha responsible como texto detectado e marque needsConfirmation. "
            "Preserve sourceEvidence com dateText, personText, roleText, descriptionTexts, blockText e locationText. "
            f"familyMembers={members_json}. categories={categories_json}. "
            f"Instrucoes salvas, somente se seguras: {context.custom_instructions or 'nenhuma'}. "
            f"Contexto temporario, somente se coerente com a imagem: {context.image_context or 'nenhum'}. "
            "Retorne no maximo 40 itens curtos e estruturados; nao use markdown, explicacoes ou ferramentas externas."
        )

    def _parse_response(self, response_body: dict, image: ValidatedImageUpload, context: VisionAnalysisContext) -> ImageAnalysisResponse:
        if _responses_refused(response_body):
            raise VisionResponseError("refusal", "A IA recusou a analise da imagem. Revise manualmente.")
        content = _responses_text(response_body)
        if response_body.get("status") == "incomplete" or response_body.get("error"):
            raise VisionResponseError("schema_invalid", "A resposta da OpenAI ficou incompleta.")
        if not content:
            raise VisionResponseError("schema_invalid", "A IA nao retornou conteudo util.")
        try:
            parsed = json.loads(content)
            parsed = _sanitize_openai_payload(parsed, context)
            for item in parsed["items"]:
                item["sourceImageName"] = item.get("sourceImageName") or image.filename
            result = ImageAnalysisResponse.model_validate(parsed)
        except (json.JSONDecodeError, TypeError, ValidationError) as exc:
            raise VisionResponseError("schema_invalid", "A IA retornou dados fora do schema esperado.") from exc
        usage = _usage_from_response(response_body)
        warnings = list(result.warnings or [])
        warnings.append("Imagem interpretada com IA. Revise tudo antes de criar tarefas.")
        return result.model_copy(update={"needsUserReview": True, "warnings": warnings[:10], "usage": usage})

    @staticmethod
    def _quality_reasons(result: ImageAnalysisResponse, context: VisionAnalysisContext) -> list[str]:
        valid_member_ids = {str(member.get("id")) for member in (context.members or []) if member.get("id")}
        reasons: list[str] = []
        if not result.items:
            return reasons
        for item in result.items:
            raw_ids = set(item.assigneeIds or [])
            if raw_ids - valid_member_ids:
                reasons.append("invalid_member_id")
            if item.responsible and not item.assigneeIds:
                reasons.append("ambiguous_assignee")
            if item.type in {"event", "reminder"} and not item.date:
                reasons.append("missing_essential_date")
            if item.confidence < context.openai_vision_auto_confirm_threshold:
                reasons.append("low_confidence")
            if item.needsConfirmation:
                reasons.append("model_requested_confirmation")
            evidence = item.sourceEvidence
            if not any([evidence.dateText, evidence.personText, evidence.roleText, evidence.descriptionTexts, evidence.blockText, evidence.locationText]):
                reasons.append("missing_block_evidence")
            warning_text = " ".join(item.warnings or []).lower()
            if any(token in warning_text for token in ("contrad", "bloco", "celula", "ambig")):
                reasons.append("contradictory_evidence" if "contrad" in warning_text else "unsafe_block_association")
        return list(dict.fromkeys(reason for reason in reasons if reason in RETRYABLE_QUALITY_REASONS))


def _responses_text(response_body: dict) -> str:
    if isinstance(response_body.get("output_text"), str):
        return response_body["output_text"]
    for output in response_body.get("output") or []:
        for content in output.get("content") or []:
            if content.get("type") in {"output_text", "text"} and isinstance(content.get("text"), str):
                return content["text"]
    return ""


def _responses_refused(response_body: dict) -> bool:
    for output in response_body.get("output") or []:
        for content in output.get("content") or []:
            if content.get("type") == "refusal" or content.get("refusal"):
                return True
    return False


def _usage_from_response(response_body: dict):
    usage = response_body.get("usage") or {}
    if not usage:
        return None
    details = usage.get("output_tokens_details") or usage.get("completion_tokens_details") or {}
    from app.schemas.image_analysis import ImageAnalysisUsage

    return ImageAnalysisUsage(
        inputTokens=usage.get("input_tokens") or usage.get("prompt_tokens"),
        outputTokens=usage.get("output_tokens") or usage.get("completion_tokens"),
        reasoningTokens=details.get("reasoning_tokens"),
        totalTokens=usage.get("total_tokens"),
    )


def _merge_usage(current, incoming):
    if current is None:
        return incoming
    if incoming is None:
        return current
    from app.schemas.image_analysis import ImageAnalysisUsage

    def add(left, right):
        return left + right if left is not None and right is not None else left if left is not None else right

    return ImageAnalysisUsage(
        inputTokens=add(current.inputTokens, incoming.inputTokens),
        outputTokens=add(current.outputTokens, incoming.outputTokens),
        reasoningTokens=add(current.reasoningTokens, incoming.reasoningTokens),
        totalTokens=add(current.totalTokens, incoming.totalTokens),
    )


def get_ai_vision_adapter(provider: str) -> AiVisionAdapter:
    normalized_provider = (provider or "openai").strip().lower()
    if normalized_provider == "openai":
        return OpenAIVisionAdapter()
    raise _provider_unavailable("Provider de IA por imagem nao suportado. Configure AI_VISION_PROVIDER=openai.")


def _openai_http_error_message(exc: HTTPError) -> str:
    if exc.code == 401:
        return "A OpenAI recusou a autenticacao. Verifique a OPENAI_API_KEY no backend."
    if exc.code == 403:
        return "A OpenAI recusou esta operacao no backend."
    if exc.code == 429:
        return "A OpenAI limitou temporariamente as requisicoes. Tente novamente em instantes."
    if exc.code in {400, 415}:
        return "A OpenAI nao conseguiu processar esta imagem. Tente uma imagem mais nitida ou menor."
    if exc.code >= 500:
        return "A OpenAI esta indisponivel agora. Tente novamente em instantes."
    return f"Nao foi possivel interpretar a imagem com OpenAI agora. Status {exc.code}."
