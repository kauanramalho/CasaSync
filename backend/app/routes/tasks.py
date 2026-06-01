from fastapi import APIRouter, Body, Depends, File, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.deps import get_current_user, get_family_id
from app.database.session import get_db
from app.models.user import User
from app.schemas.task import TaskCreate, TaskDeleteRequest, TaskDeleteResponse, TaskRead, TaskUpdate
from app.schemas.task_attachment import TaskAttachmentRead
from app.schemas.task_import import TaskSuggestionsImportRequest, TaskSuggestionsImportResponse
from app.services.task_attachment_service import (
    create_task_attachment,
    delete_task_attachment,
    get_task_attachment_file,
    list_task_attachments,
    safe_content_disposition,
)
from app.services.task_import_service import import_task_suggestions
from app.services.task_service import complete_task, create_task, delete_task, get_task, list_due_reminder_tasks, list_tasks, update_task
from app.services.calendar_service import delete_task_calendar_event


router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=list[TaskRead])
def list_all(
    status: str | None = Query(default=None),
    category_id: str | None = Query(default=None),
    assignee_id: str | None = Query(default=None),
    search: str | None = Query(default=None),
    family_id: str = Depends(get_family_id),
    db: Session = Depends(get_db),
):
    return list_tasks(db, family_id, status, category_id, assignee_id, search)


@router.post("", response_model=TaskRead, status_code=201)
def create(
    payload: TaskCreate,
    current_user: User = Depends(get_current_user),
    family_id: str = Depends(get_family_id),
    db: Session = Depends(get_db),
):
    return create_task(db, family_id, current_user.id, payload)


@router.get("/reminders/due", response_model=list[TaskRead])
def due_reminders(family_id: str = Depends(get_family_id), db: Session = Depends(get_db)):
    return list_due_reminder_tasks(db, family_id)


@router.post("/import-suggestions", response_model=TaskSuggestionsImportResponse)
def import_suggestions(
    payload: TaskSuggestionsImportRequest,
    current_user: User = Depends(get_current_user),
    family_id: str = Depends(get_family_id),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    return import_task_suggestions(
        db,
        family_id=family_id,
        creator_id=current_user.id,
        items=payload.items,
        sync_google_calendar=payload.syncGoogleCalendar,
        auto_create=payload.autoCreate,
        settings=settings,
    )


@router.post("/{task_id}/attachments", response_model=TaskAttachmentRead, status_code=201)
async def upload_attachment(
    task_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    family_id: str = Depends(get_family_id),
    db: Session = Depends(get_db),
):
    return await create_task_attachment(
        db,
        family_id=family_id,
        task_id=task_id,
        uploaded_by_id=current_user.id,
        file=file,
    )


@router.get("/{task_id}/attachments", response_model=list[TaskAttachmentRead])
def list_attachments(task_id: str, family_id: str = Depends(get_family_id), db: Session = Depends(get_db)):
    return list_task_attachments(db, family_id=family_id, task_id=task_id)


@router.get("/{task_id}/attachments/{attachment_id}/download")
def download_attachment(task_id: str, attachment_id: str, family_id: str = Depends(get_family_id), db: Session = Depends(get_db)):
    attachment, path = get_task_attachment_file(db, family_id=family_id, task_id=task_id, attachment_id=attachment_id)
    return FileResponse(
        path,
        media_type=attachment.mime_type,
        headers={
            "Content-Disposition": safe_content_disposition(attachment.original_name),
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.delete("/{task_id}/attachments/{attachment_id}", status_code=204)
def remove_attachment(task_id: str, attachment_id: str, family_id: str = Depends(get_family_id), db: Session = Depends(get_db)):
    delete_task_attachment(db, family_id=family_id, task_id=task_id, attachment_id=attachment_id)


@router.get("/{task_id}", response_model=TaskRead)
def retrieve(task_id: str, family_id: str = Depends(get_family_id), db: Session = Depends(get_db)):
    return get_task(db, family_id, task_id)


@router.patch("/{task_id}", response_model=TaskRead)
def update(task_id: str, payload: TaskUpdate, family_id: str = Depends(get_family_id), db: Session = Depends(get_db)):
    return update_task(db, family_id, task_id, payload)


@router.post("/{task_id}/complete", response_model=TaskRead)
def complete(task_id: str, family_id: str = Depends(get_family_id), db: Session = Depends(get_db)):
    return complete_task(db, family_id, task_id)


@router.delete("/{task_id}", response_model=TaskDeleteResponse)
def delete(
    task_id: str,
    payload: TaskDeleteRequest | None = Body(default=None),
    current_user: User = Depends(get_current_user),
    family_id: str = Depends(get_family_id),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    task = get_task(db, family_id, task_id)
    google_result = None
    if payload and payload.delete_google_event and task.google_calendar_event_id:
        google_result = delete_task_calendar_event(
            db,
            family_id=family_id,
            user_id=current_user.id,
            task_id=task_id,
            settings=settings,
        )
    delete_task(db, family_id, task_id)
    google_deleted = bool(google_result and google_result.deleted)
    google_missing = bool(google_result and google_result.missing)
    if google_deleted:
        message = "Tarefa e evento do Google Agenda excluidos."
    elif google_missing:
        message = "Tarefa excluida. O evento do Google Agenda ja nao existia."
    else:
        message = "Tarefa excluida."
    return TaskDeleteResponse(
        task_id=task_id,
        google_calendar_event_deleted=google_deleted,
        google_calendar_event_missing=google_missing,
        message=message,
    )
