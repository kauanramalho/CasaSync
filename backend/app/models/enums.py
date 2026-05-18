from enum import Enum


class FamilyRole(str, Enum):
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"


class TaskPriority(str, Enum):
    LOW = "baixa"
    MEDIUM = "media"
    HIGH = "alta"


class TaskStatus(str, Enum):
    PENDING = "pendente"
    IN_PROGRESS = "em_andamento"
    DONE = "concluida"
    OVERDUE = "atrasada"


class TaskType(str, Enum):
    TASK = "tarefa"
    EXAM = "prova"
    APPOINTMENT = "consulta"
    EVENT = "evento"
    REMINDER = "lembrete"


class GoalStatus(str, Enum):
    ACTIVE = "ativa"
    DONE = "concluida"
    PAUSED = "pausada"
