from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database.base import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin


class MonthlyScore(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "monthly_scores"
    __table_args__ = (
        UniqueConstraint("family_id", "user_id", "period_year", "period_month", name="uq_monthly_score_period_user"),
        Index("ix_monthly_scores_family_period", "family_id", "period_year", "period_month"),
    )

    family_id = Column(String(36), ForeignKey("families.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    period_year = Column(Integer, nullable=False)
    period_month = Column(Integer, nullable=False)
    points = Column(Integer, default=0, nullable=False)
    completed_tasks = Column(Integer, default=0, nullable=False)

    family = relationship("Family")
    user = relationship("User")


class MonthlyWinner(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "monthly_winners"
    __table_args__ = (
        UniqueConstraint("family_id", "period_year", "period_month", name="uq_monthly_winner_period"),
        Index("ix_monthly_winners_family_period", "family_id", "period_year", "period_month"),
    )

    family_id = Column(String(36), ForeignKey("families.id", ondelete="CASCADE"), nullable=False)
    winner_user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    winner_name = Column(String(120), nullable=True)
    period_year = Column(Integer, nullable=False)
    period_month = Column(Integer, nullable=False)
    points = Column(Integer, default=0, nullable=False)
    completed_tasks = Column(Integer, default=0, nullable=False)
    closed_at = Column(DateTime(timezone=True), nullable=False)

    family = relationship("Family")
    winner = relationship("User")
