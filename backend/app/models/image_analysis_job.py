from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from app.database.base import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin


class AiImageAnalysisJob(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "ai_image_analysis_jobs"

    family_id = Column(String(36), ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(32), default="pending", nullable=False, index=True)
    progress = Column(Integer, default=0, nullable=False)
    message = Column(String(240), nullable=True)
    image_count = Column(Integer, default=0, nullable=False)
    processed_count = Column(Integer, default=0, nullable=False)
    suggestions_count = Column(Integer, default=0, nullable=False)
    storage_path = Column(Text, nullable=True)
    image_metadata_json = Column(Text, nullable=True)
    image_errors_json = Column(Text, nullable=True)
    image_context = Column(Text, nullable=True)
    result_json = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
