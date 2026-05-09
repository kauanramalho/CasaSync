from fastapi import HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.models.couple import CoupleGoal, DateIdea, QuickNote
from app.schemas.couple import CoupleGoalCreate, CoupleGoalUpdate, DateIdeaCreate, DateIdeaUpdate, QuickNoteCreate, QuickNoteUpdate


def get_couple_space(db: Session, family_id: str):
    goals = (
        db.query(CoupleGoal)
        .options(selectinload(CoupleGoal.created_by))
        .filter(CoupleGoal.family_id == family_id)
        .order_by(CoupleGoal.pinned.desc(), CoupleGoal.created_at.desc())
        .limit(20)
        .all()
    )
    date_ideas = (
        db.query(DateIdea)
        .options(selectinload(DateIdea.created_by))
        .filter(DateIdea.family_id == family_id)
        .order_by(DateIdea.pinned.desc(), DateIdea.created_at.desc())
        .limit(20)
        .all()
    )
    notes = (
        db.query(QuickNote)
        .options(selectinload(QuickNote.created_by))
        .filter(QuickNote.family_id == family_id)
        .order_by(QuickNote.pinned.desc(), QuickNote.created_at.desc())
        .limit(20)
        .all()
    )
    return goals, date_ideas, notes


def create_goal(db: Session, family_id: str, user_id: str, payload: CoupleGoalCreate) -> CoupleGoal:
    goal = CoupleGoal(family_id=family_id, created_by_id=user_id, **payload.model_dump())
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal


def create_date_idea(db: Session, family_id: str, user_id: str, payload: DateIdeaCreate) -> DateIdea:
    idea = DateIdea(family_id=family_id, created_by_id=user_id, **payload.model_dump())
    db.add(idea)
    db.commit()
    db.refresh(idea)
    return idea


def create_note(db: Session, family_id: str, user_id: str, payload: QuickNoteCreate) -> QuickNote:
    note = QuickNote(family_id=family_id, created_by_id=user_id, **payload.model_dump())
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


def _get_item(db: Session, model, family_id: str, item_id: str):
    item = db.query(model).filter(model.family_id == family_id, model.id == item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item nao encontrado.")
    return item


def update_goal(db: Session, family_id: str, goal_id: str, payload: CoupleGoalUpdate) -> CoupleGoal:
    goal = _get_item(db, CoupleGoal, family_id, goal_id)
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(goal, field, value.value if hasattr(value, "value") else value)
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal


def delete_goal(db: Session, family_id: str, goal_id: str) -> None:
    db.delete(_get_item(db, CoupleGoal, family_id, goal_id))
    db.commit()


def update_date_idea(db: Session, family_id: str, idea_id: str, payload: DateIdeaUpdate) -> DateIdea:
    idea = _get_item(db, DateIdea, family_id, idea_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(idea, field, value)
    db.add(idea)
    db.commit()
    db.refresh(idea)
    return idea


def delete_date_idea(db: Session, family_id: str, idea_id: str) -> None:
    db.delete(_get_item(db, DateIdea, family_id, idea_id))
    db.commit()


def update_note(db: Session, family_id: str, note_id: str, payload: QuickNoteUpdate) -> QuickNote:
    note = _get_item(db, QuickNote, family_id, note_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(note, field, value)
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


def delete_note(db: Session, family_id: str, note_id: str) -> None:
    db.delete(_get_item(db, QuickNote, family_id, note_id))
    db.commit()
