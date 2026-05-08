from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class CategoryCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    color: str = "rose"
    icon: str = "sparkles"


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    color: str | None = None
    icon: str | None = None


class CategoryRead(ORMModel):
    id: str
    family_id: str
    name: str
    color: str
    icon: str
    is_default: bool
