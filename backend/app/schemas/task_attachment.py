from datetime import datetime

from app.schemas.common import ORMModel


class TaskAttachmentRead(ORMModel):
    id: str
    task_id: str
    original_name: str
    mime_type: str
    size: int
    created_at: datetime
    uploaded_by_id: str | None = None
