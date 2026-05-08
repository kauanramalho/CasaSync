from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_family_id
from app.database.session import get_db
from app.models.user import User
from app.schemas.couple import (
    CoupleGoalCreate,
    CoupleGoalRead,
    CoupleSpaceRead,
    DateIdeaCreate,
    DateIdeaRead,
    QuickNoteCreate,
    QuickNoteRead,
)
from app.services.couple_service import create_date_idea, create_goal, create_note, get_couple_space


router = APIRouter(prefix="/couple-space", tags=["couple-space"])


@router.get("", response_model=CoupleSpaceRead)
def summary(family_id: str = Depends(get_family_id), db: Session = Depends(get_db)):
    goals, date_ideas, notes = get_couple_space(db, family_id)
    return CoupleSpaceRead(goals=goals, date_ideas=date_ideas, notes=notes)


@router.post("/goals", response_model=CoupleGoalRead, status_code=201)
def create_couple_goal(
    payload: CoupleGoalCreate,
    current_user: User = Depends(get_current_user),
    family_id: str = Depends(get_family_id),
    db: Session = Depends(get_db),
):
    return create_goal(db, family_id, current_user.id, payload)


@router.post("/date-ideas", response_model=DateIdeaRead, status_code=201)
def create_couple_date_idea(
    payload: DateIdeaCreate,
    current_user: User = Depends(get_current_user),
    family_id: str = Depends(get_family_id),
    db: Session = Depends(get_db),
):
    return create_date_idea(db, family_id, current_user.id, payload)


@router.post("/notes", response_model=QuickNoteRead, status_code=201)
def create_couple_note(
    payload: QuickNoteCreate,
    current_user: User = Depends(get_current_user),
    family_id: str = Depends(get_family_id),
    db: Session = Depends(get_db),
):
    return create_note(db, family_id, current_user.id, payload)

