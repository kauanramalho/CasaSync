import base64
import json
import re
import socket
from dataclasses import dataclass
from typing import Protocol
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from pydantic import ValidationError

from app.schemas.image_analysis import ImageAnalysisItem, ImageAnalysisResponse
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
            }
        )

    return {
        "sourceType": "image",
        "overallConfidence": _clean_confidence(payload.get("overallConfidence")),
        "items": items,
        "warnings": warnings[:10],
        "needsUserReview": True,
    }


class MockAiVisionAdapter:
    provider = "mock"

    def parse_image_to_task_suggestions(
        self,
        image: ValidatedImageUpload,
        context: VisionAnalysisContext,
    ) -> ImageAnalysisResponse:
        filename = (image.filename or "").lower()
        item_type = "event" if any(token in filename for token in ["agenda", "calendario", "evento"]) else "task"
        title = "Revisar compromisso encontrado na imagem"
        category = "Agenda" if item_type == "event" else "Pessoal"
        priority = "medium"

        if "prova" in filename or "exam" in filename:
            item_type = "event"
            title = "Preparar estudo para prova"
            category = "Estudos"
            priority = "high"
        elif "compras" in filename or "lista" in filename:
            title = "Revisar lista enviada por imagem"
            category = "Compras"

        warnings = [
            "Modo mock ativo. A imagem foi validada, mas o conteudo nao foi interpretado por IA real.",
            "Nenhuma tarefa foi criada no banco.",
        ]
        if context.provider != self.provider:
            warnings.insert(0, f"Provider '{context.provider}' indisponivel; mock seguro utilizado.")

        return ImageAnalysisResponse(
            overallConfidence=0.42,
            items=[
                ImageAnalysisItem(
                    type=item_type,
                    title=title,
                    description="Sugestao gerada em modo demonstracao. Revise antes de salvar qualquer tarefa.",
                    date=None,
                    time=None,
                    endDate=None,
                    endTime=None,
                    category=category,
                    priority=priority,
                    responsible=None,
                    confidence=0.42,
                    warnings=[
                        "Analise simulada: nenhum OCR ou modelo de visao real foi chamado.",
                        "Campos de data, horario e responsavel precisam de revisao humana.",
                    ],
                )
            ],
            warnings=warnings,
            needsUserReview=True,
        )


class OpenAIVisionAdapter:
    provider = "openai"

    def parse_image_to_task_suggestions(
        self,
        image: ValidatedImageUpload,
        context: VisionAnalysisContext,
    ) -> ImageAnalysisResponse:
        if not context.enabled:
            return MockAiVisionAdapter().parse_image_to_task_suggestions(image, context)
        if not context.openai_api_key:
            return MockAiVisionAdapter().parse_image_to_task_suggestions(image, context)

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
            return _warning_response(
                "Nao foi possivel analisar a imagem com IA agora.",
                f"OpenAI retornou status {exc.code}. Tente novamente ou use o modo mock.",
            )
        except (URLError, TimeoutError, socket.timeout):
            return _warning_response("Tempo esgotado ao analisar a imagem com IA. Tente novamente com uma imagem menor ou mais nitida.")
        except (json.JSONDecodeError, UnicodeDecodeError):
            return _warning_response("A IA retornou uma resposta invalida. Nenhuma tarefa foi criada.")

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
                                "Analise esta imagem enviada pelo usuario. Extraia no maximo 20 sugestoes revisaveis. "
                                "Use datas em YYYY-MM-DD, horarios em HH:mm e prioridades low, medium, high ou urgent. "
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
        warnings.append("Sugestoes geradas por IA real. Revise tudo antes de criar tarefas.")
        return result.model_copy(update={"needsUserReview": True, "warnings": warnings[:10]})


def get_ai_vision_adapter(provider: str) -> AiVisionAdapter:
    normalized_provider = (provider or "mock").strip().lower()
    if normalized_provider == "openai":
        return OpenAIVisionAdapter()
    return MockAiVisionAdapter()
