from datetime import datetime, timedelta, timezone

from app.core.security import hash_password
from app.database.init_db import create_database_tables
from app.database.session import SessionLocal
from app.models.couple import CoupleGoal, DateIdea, QuickNote
from app.models.enums import FamilyRole, TaskPriority, TaskStatus
from app.models.family import Family, FamilyMember
from app.models.task import Task
from app.models.user import User
from app.services.category_service import ensure_default_categories


def run() -> None:
    create_database_tables()
    db = SessionLocal()
    try:
        if db.query(User).filter(User.email == "kauan@casasync.app").first():
            print("Seed já existe. Use kauan@casasync.app / 12345678 para entrar.")
            return

        kauan = User(name="Kauan", username="kauan", email="kauan@casasync.app", hashed_password=hash_password("12345678"))
        bia = User(name="Bia", username="bia", email="bia@casasync.app", hashed_password=hash_password("12345678"))
        db.add_all([kauan, bia])
        db.flush()

        family = Family(name="Kauan & Bia", invite_code="CASA2026", created_by_id=kauan.id)
        db.add(family)
        db.flush()
        db.add_all(
            [
                FamilyMember(family_id=family.id, user_id=kauan.id, role=FamilyRole.OWNER.value, points=80),
                FamilyMember(family_id=family.id, user_id=bia.id, role=FamilyRole.MEMBER.value, points=95),
            ]
        )
        db.commit()

        categories = ensure_default_categories(db, family.id)
        category_map = {category.name: category for category in categories}
        now = datetime.now(timezone.utc)

        tasks = [
            ("Planejar date da semana", "Escolher lugar, horário e orçamento.", bia.id, "Relacionamento", TaskPriority.HIGH, TaskStatus.PENDING, 0),
            ("Comprar mercado", "Conferir lista compartilhada.", kauan.id, "Casa", TaskPriority.MEDIUM, TaskStatus.PENDING, 0),
            ("Estudar para prova de Física", "Revisar exercícios principais.", kauan.id, "Faculdade", TaskPriority.MEDIUM, TaskStatus.PENDING, 1),
            ("Lavar roupas", "Separar roupas claras e escuras.", bia.id, "Casa", TaskPriority.LOW, TaskStatus.IN_PROGRESS, 3),
            ("Ligar para o médico", "Confirmar consulta e documentos.", bia.id, "Saúde", TaskPriority.LOW, TaskStatus.DONE, -1),
            ("Revisar plano financeiro do mês", "Olhar contas e próximos vencimentos.", kauan.id, "Finanças", TaskPriority.HIGH, TaskStatus.OVERDUE, -2),
        ]

        for title, description, assignee_id, category_name, priority, task_status, days in tasks:
            task = Task(
                family_id=family.id,
                title=title,
                description=description,
                assignee_id=assignee_id,
                creator_id=bia.id if assignee_id == kauan.id else kauan.id,
                category_id=category_map[category_name].id,
                due_date=now + timedelta(days=days),
                priority=priority.value,
                status=task_status.value,
                completed_at=now - timedelta(days=1) if task_status == TaskStatus.DONE else None,
                points_awarded=5 if task_status == TaskStatus.DONE else 0,
            )
            db.add(task)

        db.add_all(
            [
                CoupleGoal(
                    family_id=family.id,
                    title="Viajar juntos",
                    description="Guardar um valor mensal e escolher o destino.",
                    target_date=now + timedelta(days=90),
                    created_by_id=kauan.id,
                ),
                DateIdea(
                    family_id=family.id,
                    title="Cinema em casa",
                    description="Filme, pipoca e celular longe.",
                    suggested_date=now + timedelta(days=4),
                    mood="acolhedor",
                    created_by_id=bia.id,
                ),
                QuickNote(
                    family_id=family.id,
                    message='Mensagem do dia: "Te amo!"',
                    created_by_id=bia.id,
                ),
            ]
        )
        db.commit()
        print("Seed criada. Login: kauan@casasync.app ou kauan / 12345678; bia@casasync.app ou bia / 12345678")
    finally:
        db.close()


if __name__ == "__main__":
    run()
