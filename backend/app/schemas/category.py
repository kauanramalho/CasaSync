from pydantic import BaseModel, Field

from app.schemas.common import NonBlankName, ORMModel, RequiredFieldsUpdate


class CategoryCreate(BaseModel):
    name: NonBlankName = Field(max_length=80)
    color: str = Field(default="rose", max_length=40)
    icon: str = Field(default="sparkles", max_length=40)


class CategoryUpdate(RequiredFieldsUpdate):
    non_nullable_fields = frozenset({"name", "color", "icon"})
    name: NonBlankName | None = Field(default=None, max_length=80)
    color: str | None = Field(default=None, max_length=40)
    icon: str | None = Field(default=None, max_length=40)


class CategoryRead(ORMModel):
    id: str
    family_id: str
    name: str
    color: str
    icon: str
    is_default: bool
