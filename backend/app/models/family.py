from sqlalchemy import Column, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database.base import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import FamilyRole


class Family(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "families"

    name = Column(String(140), nullable=False)
    invite_code = Column(String(16), unique=True, index=True, nullable=False)
    created_by_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    members = relationship("FamilyMember", back_populates="family", cascade="all, delete-orphan")
    categories = relationship("Category", back_populates="family", cascade="all, delete-orphan")
    tasks = relationship("Task", back_populates="family", cascade="all, delete-orphan")
    goals = relationship("CoupleGoal", back_populates="family", cascade="all, delete-orphan")
    date_ideas = relationship("DateIdea", back_populates="family", cascade="all, delete-orphan")
    notes = relationship("QuickNote", back_populates="family", cascade="all, delete-orphan")


class FamilyMember(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "family_members"
    __table_args__ = (UniqueConstraint("family_id", "user_id", name="uq_family_member"),)

    family_id = Column(String(36), ForeignKey("families.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(24), default=FamilyRole.MEMBER.value, nullable=False)
    points = Column(Integer, default=0, nullable=False)

    family = relationship("Family", back_populates="members")
    user = relationship("User", back_populates="memberships")

