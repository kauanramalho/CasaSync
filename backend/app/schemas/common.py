from typing import Annotated, ClassVar

from pydantic import BaseModel, ConfigDict, StringConstraints, ValidationInfo, field_validator


NonBlankName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2)]
NonBlankMessage = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class RequiredFieldsUpdate(BaseModel):
    """PATCH may omit required columns, but cannot set them to null."""

    non_nullable_fields: ClassVar[frozenset[str]] = frozenset()

    @field_validator("*", mode="before")
    @classmethod
    def reject_null_required_field(cls, value, info: ValidationInfo):
        if value is None and info.field_name in cls.non_nullable_fields:
            raise ValueError("Este campo nao pode ser nulo.")
        return value


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

