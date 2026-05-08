from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_family_id
from app.database.session import get_db
from app.models.user import User
from app.schemas.couple import (
    CoupleGoalCreate,
    CoupleGoalRead,
    CoupleGoalUpdate,
    CoupleSpaceRead,
    DateIdeaCreate,
    DateIdeaRead,
    DateIdeaUpdate,
    QuickNoteCreate,
    QuickNoteRead,
    QuickNoteUpdate,
)
from app.services.couple_service import (
    create_date_idea,
    create_goal,
    create_note,
    delete_date_idea,
    delete_goal,
    delete_note,
    get_couple_space,
    update_date_idea,
    update_goal,
    update_note,
)


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


@router.patch("/goals/{goal_id}", response_model=CoupleGoalRead)
def update_couple_goal(goal_id: str, payload: CoupleGoalUpdate, family_id: str = Depends(get_family_id), db: Session = Depends(get_db)):
    return update_goal(db, family_id, goal_id, payload)


@router.delete("/goals/{goal_id}", status_code=204)
def delete_couple_goal(goal_id: str, family_id: str = Depends(get_family_id), db: Session = Depends(get_db)):
    delete_goal(db, family_id, goal_id)
    return None


@router.patch("/date-ideas/{idea_id}", response_model=DateIdeaRead)
def update_couple_date_idea(idea_id: str, payload: DateIdeaUpdate, family_id: str = Depends(get_family_id), db: Session = Depends(get_db)):
    return update_date_idea(db, family_id, idea_id, payload)


@router.delete("/date-ideas/{idea_id}", status_code=204)
def delete_couple_date_idea(idea_id: str, family_id: str = Depends(get_family_id), db: Session = Depends(get_db)):
    delete_date_idea(db, family_id, idea_id)
    return None


@router.patch("/notes/{note_id}", response_model=QuickNoteRead)
def update_couple_note(note_id: str, payload: QuickNoteUpdate, family_id: str = Depends(get_family_id), db: Session = Depends(get_db)):
    return update_note(db, family_id, note_id, payload)


@router.delete("/notes/{note_id}", status_code=204)
def delete_couple_note(note_id: str, family_id: str = Depends(get_family_id), db: Session = Depends(get_db)):
    delete_note(db, family_id, note_id)
    return None
