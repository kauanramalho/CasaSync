from sqlalchemy import Column, ForeignKey, Integer, LargeBinary, String

from app.database.base import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin


class ImageAsset(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "image_assets"

    owner_user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    family_id = Column(String(36), ForeignKey("families.id", ondelete="CASCADE"), nullable=True, index=True)
    scope = Column(String(40), nullable=False, index=True)
    content_type = Column(String(80), nullable=False)
    original_filename = Column(String(255), nullable=True)
    byte_size = Column(Integer, nullable=False)
    content = Column(LargeBinary, nullable=False)
