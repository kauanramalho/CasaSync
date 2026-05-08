from sqlalchemy.orm import Session, selectinload

from app.models.couple import CoupleGoal, DateIdea, QuickNote
from app.schemas.couple import CoupleGoalCreate, DateIdeaCreate, QuickNoteCreate


def get_couple_space(db: Session, family_id: str):
    goals = (
        db.query(CoupleGoal)
        .options(selectinload(CoupleGoal.created_by))
        .filter(CoupleGoal.family_id == family_id)
        .order_by(CoupleGoal.created_at.desc())
        .limit(20)
        .all()
    )
    date_ideas = (
        db.query(DateIdea)
        .options(selectinload(DateIdea.created_by))
        .filter(DateIdea.family_id == family_id)
        .order_by(DateIdea.created_at.desc())
        .limit(20)
        .all()
    )
    notes = (
        db.query(QuickNote)
        .options(selectinload(QuickNote.created_by))
        .filter(QuickNote.family_id == family_id)
        .order_by(QuickNote.created_at.desc())
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

