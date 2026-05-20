from dataclasses import dataclass
from typing import Protocol

from app.schemas.image_analysis import ImageAnalysisItem, ImageAnalysisResponse
from app.services.image_service import ValidatedImageUpload


@dataclass(frozen=True)
class VisionAnalysisContext:
    family_id: str
    provider: str


class AiVisionAdapter(Protocol):
    def parse_image_to_task_suggestions(
        self,
        image: ValidatedImageUpload,
        context: VisionAnalysisContext,
    ) -> ImageAnalysisResponse:
        ...


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
            warnings.insert(0, f"Provedor '{context.provider}' ainda nao implementado; mock seguro utilizado.")

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


def get_ai_vision_adapter(provider: str) -> AiVisionAdapter:
    normalized_provider = (provider or "mock").strip().lower()
    if normalized_provider == "mock":
        return MockAiVisionAdapter()
    return MockAiVisionAdapter()
