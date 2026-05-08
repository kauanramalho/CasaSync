from sqlalchemy import Boolean, Column, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database.base import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin


class Category(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("family_id", "name", name="uq_category_family_name"),)

    family_id = Column(String(36), ForeignKey("families.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(80), nullable=False)
    color = Column(String(40), default="rose", nullable=False)
    icon = Column(String(40), default="sparkles", nullable=False)
    is_default = Column(Boolean, default=True, nullable=False)

    family = relationship("Family", back_populates="categories")
    tasks = relationship("Task", back_populates="category")

