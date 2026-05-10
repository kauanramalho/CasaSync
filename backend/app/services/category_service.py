from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.category import Category
from app.schemas.category import CategoryCreate, CategoryUpdate


DEFAULT_CATEGORIES = [
    {"name": "Relacionamento", "color": "rose", "icon": "heart"},
    {"name": "Casa", "color": "blue", "icon": "home"},
    {"name": "Faculdade", "color": "emerald", "icon": "book-open"},
    {"name": "Estudos", "color": "violet", "icon": "graduation-cap"},
    {"name": "Igreja", "color": "purple", "icon": "music"},
    {"name": "Trabalho", "color": "slate", "icon": "briefcase"},
    {"name": "Saúde", "color": "green", "icon": "phone"},
    {"name": "Compras", "color": "amber", "icon": "shopping-bag"},
    {"name": "Finanças", "color": "cyan", "icon": "wallet"},
    {"name": "Pessoal", "color": "pink", "icon": "book"},
]


def ensure_default_categories(db: Session, family_id: str) -> list[Category]:
    existing_names = {
        name
        for (name,) in db.query(Category.name).filter(Category.family_id == family_id).all()
    }
    created_categories: list[Category] = []

    for item in DEFAULT_CATEGORIES:
        if item["name"] in existing_names:
            continue
        category = Category(family_id=family_id, **item, is_default=True)
        db.add(category)
        created_categories.append(category)

    if created_categories:
        db.commit()

    return list_categories(db, family_id)


def list_categories(db: Session, family_id: str) -> list[Category]:
    return (
        db.query(Category)
        .filter(Category.family_id == family_id)
        .order_by(Category.is_default.desc(), Category.name.asc())
        .all()
    )


def _ensure_unique_category_name(db: Session, family_id: str, name: str, category_id: str | None = None) -> None:
    query = db.query(Category).filter(
        Category.family_id == family_id,
        func.lower(Category.name) == name.strip().lower(),
    )
    if category_id:
        query = query.filter(Category.id != category_id)
    if query.first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ja existe uma categoria com este nome.")


def create_category(db: Session, family_id: str, payload: CategoryCreate) -> Category:
    name = payload.name.strip()
    _ensure_unique_category_name(db, family_id, name)
    category = Category(
        family_id=family_id,
        name=name,
        color=payload.color,
        icon=payload.icon,
        is_default=False,
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def update_category(db: Session, family_id: str, category_id: str, payload: CategoryUpdate) -> Category:
    category = db.query(Category).filter(Category.family_id == family_id, Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Categoria nao encontrada.")

    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"]:
        name = data["name"].strip()
        _ensure_unique_category_name(db, family_id, name, category.id)
        category.name = name
    if "color" in data and data["color"]:
        category.color = data["color"]
    if "icon" in data and data["icon"]:
        category.icon = data["icon"]

    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def get_category_by_name(db: Session, family_id: str, name: str) -> Category | None:
    return (
        db.query(Category)
        .filter(Category.family_id == family_id, Category.name.ilike(name.strip()))
        .first()
    )
