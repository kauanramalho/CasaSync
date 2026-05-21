import base64
import json
import re
import socket
from dataclasses import dataclass
from typing import Protocol
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import HTTPException, status
from pydantic import ValidationError

from app.schemas.image_analysis import ImageAnalysisResponse
from app.services.image_service import ValidatedImageUpload


OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions"
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME_RE = re.compile(r"^\d{2}:\d{2}$")
TYPE_VALUES = {"task", "event", "reminder"}
PRIORITY_VALUES = {"low", "medium", "high", "urgent"}

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
                    "description": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                    "date": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                    "time": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                    "endDate": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                    "endTime": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                    "category": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                    "priority": {"anyOf": [{"type": "string", "enum": ["low", "medium", "high", "urgent"]}, {"type": "null"}]},
                    "responsible": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                    "confidence": {"type": "number"},
                    "warnings": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "reminderEnabled": {"type": "boolean"},
                    "reminderValue": {"anyOf": [{"type": "integer", "minimum": 1, "maximum": 365}, {"type": "null"}]},
                    "reminderUnit": {"anyOf": [{"type": "string", "enum": ["minutes", "hours", "days"]}, {"type": "null"}]},
                },
                "required": [
                    "type",
                    "title",
                    "description",
                    "date",
                    "time",
                    "endDate",
                    "endTime",
                    "category",
                    "priority",
                    "responsible",
                    "confidence",
                    "warnings",
                    "reminderEnabled",
                    "reminderValue",
                    "reminderUnit",
                ],
            },
        },
        "warnings": {
            "type": "array",
            "items": {"type": "string"},
        },
        "needsUserReview": {"type": "boolean", "enum": [True]},
    },
    "required": ["sourceType", "overallConfidence", "items", "warnings", "needsUserReview"],
}
REMINDER_UNITS = {"minutes", "hours", "days"}


@dataclass(frozen=True)
class VisionAnalysisContext:
    family_id: str
    provider: str
    enabled: bool
    openai_api_key: str | None
    openai_vision_model: str
    openai_vision_timeout_seconds: float
    openai_vision_max_output_tokens: int


class AiVisionAdapter(Protocol):
    def parse_image_to_task_suggestions(
        self,
        image: ValidatedImageUpload,
        context: VisionAnalysisContext,
    ) -> ImageAnalysisResponse:
        ...


def _warning_response(*warnings: str) -> ImageAnalysisResponse:
    return ImageAnalysisResponse(
        overallConfidence=0.0,
        items=[],
        warnings=[warning for warning in warnings if warning][:10],
        needsUserReview=True,
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


def _sanitize_openai_payload(payload: dict) -> dict:
    warnings = [
        str(warning).strip()[:240]
        for warning in _as_list(payload.get("warnings"))
        if str(warning).strip()
    ][:10]
    items = []

    for raw_item in _as_list(payload.get("items"))[:20]:
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
        reminder_unit = raw_item.get("reminderUnit")
        reminder_unit = str(reminder_unit).strip().lower() if reminder_unit is not None else None
        reminder_value = raw_item.get("reminderValue")
        try:
            reminder_value = int(reminder_value) if reminder_value is not None else None
        except (TypeError, ValueError):
            reminder_value = None
        if reminder_value is not None and not (1 <= reminder_value <= 365):
            reminder_value = None
        if reminder_unit not in REMINDER_UNITS:
            reminder_unit = None
        reminder_enabled = bool(raw_item.get("reminderEnabled")) and bool(reminder_value and reminder_unit)
        items.append(
            {
                "type": item_type if item_type in TYPE_VALUES else "task",
                "title": title,
                "description": _clean_optional_text(raw_item.get("description"), 1200),
                "date": _clean_date(raw_item.get("date")),
                "time": _clean_time(raw_item.get("time")),
                "endDate": _clean_date(raw_item.get("endDate")),
                "endTime": _clean_time(raw_item.get("endTime")),
                "category": _clean_optional_text(raw_item.get("category"), 80),
                "priority": priority if priority in PRIORITY_VALUES else None,
                "responsible": _clean_optional_text(raw_item.get("responsible"), 120),
                "confidence": _clean_confidence(raw_item.get("confidence")),
                "warnings": [
                    str(warning).strip()[:240]
                    for warning in _as_list(raw_item.get("warnings"))
                    if str(warning).strip()
                ][:10],
                "reminderEnabled": reminder_enabled,
                "reminderValue": reminder_value if reminder_enabled else None,
                "reminderUnit": reminder_unit if reminder_enabled else None,
            }
        )

    return {
        "sourceType": "image",
        "overallConfidence": _clean_confidence(payload.get("overallConfidence")),
        "items": items,
        "warnings": warnings[:10],
        "needsUserReview": True,
    }


class OpenAIVisionAdapter:
    provider = "openai"

    def parse_image_to_task_suggestions(
        self,
        image: ValidatedImageUpload,
        context: VisionAnalysisContext,
    ) -> ImageAnalysisResponse:
        if not context.enabled:
            raise _provider_unavailable("IA real por imagem esta desativada. Configure AI_VISION_ENABLED=true no backend.")
        if not context.openai_api_key:
            raise _provider_unavailable("OPENAI_API_KEY nao configurada no backend.")

        payload = self._build_payload(image, context)
        request = Request(
            OPENAI_CHAT_COMPLETIONS_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {context.openai_api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            timeout = max(5.0, min(float(context.openai_vision_timeout_seconds or 20.0), 60.0))
            with urlopen(request, timeout=timeout) as response:
                response_body = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            raise _provider_unavailable(_openai_http_error_message(exc), status_code=status.HTTP_502_BAD_GATEWAY) from exc
        except (URLError, TimeoutError, socket.timeout):
            raise _provider_unavailable(
                "Tempo esgotado ao analisar a imagem com IA. Tente novamente com uma imagem menor ou mais nitida.",
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            )
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise _provider_unavailable("A OpenAI retornou uma resposta invalida. Nenhuma tarefa foi criada.", status_code=status.HTTP_502_BAD_GATEWAY)

        return self._parse_response(response_body)

    def _build_payload(self, image: ValidatedImageUpload, context: VisionAnalysisContext) -> dict:
        base64_image = base64.b64encode(image.content).decode("ascii")
        data_url = f"data:{image.content_type};base64,{base64_image}"
        return {
            "model": context.openai_vision_model or "gpt-4.1-mini",
            "temperature": 0.1,
            "max_tokens": max(300, min(int(context.openai_vision_max_output_tokens or 1200), 4000)),
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "casasync_image_task_suggestions",
                    "strict": True,
                    "schema": IMAGE_ANALYSIS_JSON_SCHEMA,
                },
            },
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "Voce extrai tarefas, eventos e lembretes de imagens para o CasaSync. "
                        "Responda somente JSON no schema solicitado. Nunca crie tarefas. "
                        "Nao invente datas, horarios, responsaveis ou categorias; use null e warnings quando houver incerteza. "
                        "Todas as sugestoes precisam de revisao humana."
                    ),
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                "Analise esta imagem real enviada pelo usuario. Ela pode ser screenshot, foto de calendario, "
                                "print de WhatsApp, lista escrita, cronograma, planner, prova, atividade escolar/faculdade "
                                "ou agenda inclinada/escura. Extraia no maximo 20 sugestoes revisaveis. "
                                "Use datas em YYYY-MM-DD, horarios em HH:mm e prioridades low, medium, high ou urgent. "
                                "Inclua observacoes relevantes em description, categoria provavel em category, responsavel quando aparecer "
                                "e lembrete sugerido em reminderEnabled/reminderValue/reminderUnit apenas quando fizer sentido. "
                                "Se a imagem estiver ruim, vazia, ilegivel ou ambigua, retorne items vazio, baixa confianca e warnings claros."
                            ),
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": data_url,
                                "detail": "high",
                            },
                        },
                    ],
                },
            ],
        }

    def _parse_response(self, response_body: dict) -> ImageAnalysisResponse:
        try:
            message = response_body["choices"][0]["message"]
        except (KeyError, IndexError, TypeError):
            return _warning_response("A IA nao retornou sugestoes em formato esperado. Nenhuma tarefa foi criada.")

        if message.get("refusal"):
            return _warning_response("A IA recusou a analise da imagem. Tente outra imagem ou revise manualmente.")

        content = message.get("content")
        if isinstance(content, list):
            content = "".join(part.get("text", "") for part in content if isinstance(part, dict))
        if not content:
            return _warning_response("A IA nao encontrou conteudo util na imagem.")

        try:
            parsed = json.loads(content)
            parsed = _sanitize_openai_payload(parsed)
            result = ImageAnalysisResponse.model_validate(parsed)
        except (json.JSONDecodeError, TypeError, ValidationError):
            return _warning_response("A IA retornou dados fora do schema esperado. Nenhuma tarefa foi criada.")

        warnings = list(result.warnings or [])
        warnings.append("Imagem interpretada com IA real. Revise tudo antes de criar tarefas.")
        return result.model_copy(update={"needsUserReview": True, "warnings": warnings[:10]})


def get_ai_vision_adapter(provider: str) -> AiVisionAdapter:
    normalized_provider = (provider or "openai").strip().lower()
    if normalized_provider == "openai":
        return OpenAIVisionAdapter()
    raise _provider_unavailable("Provider de IA por imagem nao suportado. Configure AI_VISION_PROVIDER=openai.")


def _openai_http_error_message(exc: HTTPError) -> str:
    if exc.code == 401:
        return "A OpenAI recusou a autenticacao. Verifique a OPENAI_API_KEY no backend."
    if exc.code == 429:
        return "A OpenAI limitou temporariamente as requisicoes. Tente novamente em instantes."
    if exc.code in {400, 415}:
        return "A OpenAI nao conseguiu processar esta imagem. Tente uma imagem mais nitida ou menor."
    if exc.code >= 500:
        return "A OpenAI esta indisponivel agora. Tente novamente em instantes."
    return f"Nao foi possivel interpretar a imagem com OpenAI agora. Status {exc.code}."
