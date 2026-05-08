from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.enums import TaskPriority
from app.schemas.planner import PlannerSuggestion
from app.schemas.task import TaskCreate
from app.services.task_service import create_task


def generate_mock_plan(prompt: str) -> list[PlannerSuggestion]:
    text = prompt.lower()
    base_date = datetime.now(timezone.utc).replace(hour=18, minute=0, second=0, microsecond=0)

    if "igreja" in text:
        raw = [
            ("Separar louvores e materiais", "Organizar tudo antes do compromisso.", "Igreja", TaskPriority.MEDIUM, 1),
            ("Confirmar agenda da célula", "Checar horário, local e responsáveis.", "Igreja", TaskPriority.LOW, 2),
            ("Planejar momento devocional", "Reservar um tempo leve para leitura e oração.", "Relacionamento", TaskPriority.MEDIUM, 3),
        ]
    elif "casa" in text or "limpeza" in text:
        raw = [
            ("Revisar lista de compras", "Separar itens essenciais para a semana.", "Compras", TaskPriority.MEDIUM, 1),
            ("Organizar cozinha e lavanderia", "Dividir por blocos de 30 minutos.", "Casa", TaskPriority.HIGH, 2),
            ("Separar documentos e contas", "Deixar finanças domésticas em dia.", "Finanças", TaskPriority.MEDIUM, 3),
        ]
    elif "estudo" in text or "faculdade" in text:
        raw = [
            ("Revisar matéria principal", "Criar resumo com pontos mais cobrados.", "Estudos", TaskPriority.HIGH, 1),
            ("Resolver lista de exercícios", "Focar nos exercícios de maior dificuldade.", "Faculdade", TaskPriority.HIGH, 2),
            ("Preparar revisão curta", "Revisar por 25 minutos e descansar 5.", "Estudos", TaskPriority.MEDIUM, 3),
        ]
    else:
        raw = [
            ("Planejar prioridades da semana", "Escolher até 3 tarefas importantes por dia.", "Pessoal", TaskPriority.MEDIUM, 1),
            ("Criar bloco de cuidado do casal", "Reservar um momento sem telas.", "Relacionamento", TaskPriority.MEDIUM, 2),
            ("Revisar compromissos e prazos", "Conferir o que precisa entrar na agenda.", "Trabalho", TaskPriority.LOW, 3),
        ]

    return [
        PlannerSuggestion(
            title=title,
            description=description,
            category_name=category,
            priority=priority,
            due_date=base_date + timedelta(days=days),
        )
        for title, description, category, priority, days in raw
    ]


def create_tasks_from_suggestions(
    db: Session,
    family_id: str,
    creator_id: str,
    assignee_id: str | None,
    suggestions: list[PlannerSuggestion],
):
    created_tasks = []
    for suggestion in suggestions:
        created_tasks.append(
            create_task(
                db,
                family_id,
                creator_id,
                TaskCreate(
                    title=suggestion.title,
                    description=suggestion.description,
                    assignee_id=assignee_id or creator_id,
                    category_name=suggestion.category_name,
                    due_date=suggestion.due_date,
                    priority=suggestion.priority,
                ),
            )
        )
    return created_tasks

