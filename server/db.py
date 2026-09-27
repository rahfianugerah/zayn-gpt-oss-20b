import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    String,
    Text,
    create_engine,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

from config import settings

engine = create_engine(
    settings.database_url.get_secret_value(), pool_size=5, max_overflow=5, pool_pre_ping=True
)
SessionLocal = sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # Moved forward on every new message, so the sidebar lists the latest conversation first
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    messages: Mapped[list["Message"]] = relationship(order_by="Message.id")


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (CheckConstraint("role IN ('user', 'assistant')", name="messages_role_check"),)

    # A sequence rather than a timestamp orders the turns, since two can share a timestamp
    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(16))
    content: Mapped[str] = mapped_column(Text)
    # The model's thinking, for a model that returns it apart from the answer
    reasoning: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
