import itertools
import json
import logging
import math
import re
import sys
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime
from typing import Literal

import httpx
from fastapi import Depends, FastAPI, Query, Request, Response
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from ollama import Client, ResponseError
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import Select, delete, func, or_, select, text, update
from sqlalchemy.orm import Session
from starlette.exceptions import HTTPException

from config import ROOT, settings
from db import Conversation, Message, SessionLocal

# uvicorn configures only its own loggers, so without this the delete audit at INFO is dropped
logging.basicConfig(
    level=logging.INFO, stream=sys.stdout, format="%(asctime)s %(levelname)s %(name)s %(message)s"
)
logger = logging.getLogger("zayn")


def load_modelfile(text: str) -> tuple[str, dict[str, object]]:
    """Read the system prompt and the sampling options out of an Ollama Modelfile."""
    system = re.search(r'^SYSTEM\s+"""(.*?)"""', text, re.M | re.S).group(1).strip()
    options: dict[str, object] = {}
    for name, raw in re.findall(r"^PARAMETER\s+(\w+)\s+(.+?)\s*$", text, re.M):
        value = json.loads(raw)  # a number and a quoted string both parse as JSON
        if name == "stop":
            options.setdefault("stop", []).append(value)
        else:
            options[name] = value
    return system, options


# The model comes from OLLAMA_MODEL, so each machine picks its own. The Modelfile stays the one
# place the prompt and sampling are tuned; Ollama Cloud accepts every parameter per request.
MODEL = settings.ollama_model
SYSTEM_PROMPT, OPTIONS = load_modelfile((ROOT / "Modelfile").read_text(encoding="utf-8"))

model_client = Client(
    host="https://ollama.com",
    headers={"Authorization": f"Bearer {settings.ollama_api_key.get_secret_value()}"},
    timeout=300,
)

NEW_CHAT_TITLE = "New Chat"

# Each key is also a slash command: a message starting with /fix gets the fix instruction
TASK_PROMPTS: dict[str, str] = {
    "general": "Solve the request precisely. If anything is ambiguous, ask one clarifying question, otherwise produce the final result.",
    "explain": "Explain the code briefly, focusing on intent, complexity hotspots, and pitfalls. Give a short actionable summary.",
    "fix": "Find the minimal change to make the code correct, safe, and passing. Return fixed code only, no explanation.",
    "docstring": "Add or improve docstrings and type hints. Preserve behavior. Return the complete updated code.",
    "refactor": "Refactor for clarity, testability, and performance without changing the public API. Return the complete updated code.",
    "review": "Perform a concise code review: correctness, security, complexity, naming, tests, edge cases. Give a prioritized checklist.",
    "optimize": "Optimize for readability and performance, remove dead code, keep behavior. Return the complete updated code.",
    "testgen": "Add or improve tests covering edge cases and error paths. Use deterministic seeds. Return tests only unless otherwise asked.",
    "translate": "Translate code or text to the target language idiomatically while preserving semantics. Return only the translation.",
    "generate": "Generate the requested artifact in the exact format asked, nothing else.",
    # The website renders these two as a study document and a flashcard deck, so their shape is fixed
    "material": (
        "Write study material in Markdown on what the user describes, at the level they ask for. "
        "Start with a level-2 heading as the title and one short paragraph saying what it covers. "
        "Use ### headings for sections, short paragraphs, bullet lists for key points, "
        "> blockquotes for tips and key takeaways, and fenced code blocks with a language tag for code. "
        "Link only to official documentation. End with a ### Summary section. "
        "Return only the Markdown."
    ),
    "flashcards": (
        "Create flashcards that test what the user describes. "
        'Return only a JSON array, with no prose and no code fence, shaped as [{"front": "...", "back": "..."}]. '
        "The front is a question or a term, under 20 words. The back is the answer, one to three sentences. "
        "Make 10 cards unless the user asks for another number, most important ideas first."
    ),
}


COMMAND = re.compile(r"^/(\w+)\b\s*")


def split_command(content: str) -> tuple[str, str]:
    """Split a leading slash command off a message. An unknown one, such as /etc/hosts, is text."""
    match = COMMAND.match(content)
    if match and match.group(1) in TASK_PROMPTS:
        return match.group(1), content[match.end() :]
    return "general", content


class MessageIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Stored as typed, command included, so a reopened conversation shows which one was used
    content: str = Field(max_length=32_000)

    @field_validator("content")
    @classmethod
    def not_blank(cls, value: str) -> str:
        if not split_command(value)[1].strip():
            raise ValueError("the message is empty")
        return value


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: str
    content: str
    reasoning: str | None
    created_at: datetime


class ConversationRename(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(max_length=120)

    @field_validator("title")
    @classmethod
    def trimmed_and_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("the title is empty")
        return value


class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    created_at: datetime
    updated_at: datetime


class ConversationDetail(ConversationOut):
    messages: list[MessageOut]


class ConversationPage(BaseModel):
    items: list[ConversationOut]
    total: int
    limit: int
    offset: int
    # Which stage of the search ladder answered, so the website can say when matches are only close
    match: Literal["exact", "prefix", "fuzzy"] | None = None


def get_session():
    with SessionLocal() as session:
        yield session


def search_stages(session: Session, query: str) -> list[tuple[str, object, object]] | None:
    """The search ladder from search.component.md: exact, then prefix, then fuzzy.

    Returns each stage's name, predicate, and order, or None when the query is too short to search,
    in which case the list is not filtered at all.
    """
    # Normalized by the same SQL function that built the stored key, so both sides fold alike
    normalized = session.scalar(select(func.norm(query[:100]))) or ""
    if len(normalized) < 2:
        return None
    session.execute(text("SET LOCAL statement_timeout = '3s'"))
    session.execute(text("SET LOCAL pg_trgm.word_similarity_threshold = 0.3"))
    key = func.fon(normalized)
    in_a_message = (
        select(Message.id)
        .where(Message.conversation_id == Conversation.id, key.op("<%")(Message.search_fon))
        .exists()
    )
    best_message = (
        select(func.max(func.word_similarity(key, Message.search_fon)))
        .where(Message.conversation_id == Conversation.id)
        .scalar_subquery()
    )
    latest = Conversation.updated_at.desc()
    closest = func.greatest(func.word_similarity(key, Conversation.search_fon), func.coalesce(best_message, 0)).desc()
    # normalized holds only letters, digits, and spaces, so it carries no LIKE wildcard
    return [
        ("exact", Conversation.search_norm == normalized, latest),
        ("prefix", Conversation.search_norm.like(f"{normalized}%"), latest),
        ("fuzzy", or_(key.op("<%")(Conversation.search_fon), in_a_message), closest),
    ]


def build_messages(history: list[Message], content: str) -> list[dict[str, str]]:
    """Prepend the system prompt, and put the command's instruction in front of the new question.

    Earlier questions go to the model without their commands, since only the latest one applies.
    """
    task, question = split_command(content)
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        *(
            {"role": m.role, "content": split_command(m.content)[1] if m.role == "user" else m.content}
            for m in history
        ),
        {"role": "user", "content": f"{TASK_PROMPTS[task]}\n\n{question}"},
    ]


def save_reply(conversation_id: uuid.UUID, content: str, reasoning: str | None) -> None:
    if not content:
        return
    with SessionLocal() as session:
        session.add(
            Message(
                conversation_id=conversation_id,
                role="assistant",
                content=content,
                reasoning=reasoning,
            )
        )
        session.execute(
            update(Conversation)
            .where(Conversation.id == conversation_id)
            .values(updated_at=func.now())
        )
        session.commit()


def error_response(status: int, code: str, message: str, detail: object = None) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message, "detail": detail}},
    )


class RateLimiter:
    """A sliding window of request times for each client."""

    def __init__(self, limit: int, window_seconds: float = 60):
        self.limit = limit
        self.window = window_seconds
        self.hits: dict[str, deque[float]] = defaultdict(deque)

    def hit(self, client: str) -> float | None:
        """Count a request, or return the seconds until the client may try again."""
        now = time.monotonic()
        hits = self.hits[client]
        while hits and hits[0] <= now - self.window:
            hits.popleft()
        if len(hits) >= self.limit:
            return hits[0] + self.window - now
        hits.append(now)
        return None


# ponytail: counts live in this one process's memory, which fits one local server; move them to a
# shared store such as Postgres if the API ever runs as several workers, or each keeps its own count
LIMITS = {
    # Only these requests spend the Ollama usage limit, so they are limited hardest
    "model": RateLimiter(limit=20),
    "api": RateLimiter(limit=120),
}


class RateLimited(Exception):
    def __init__(self, limit: int, retry_after: float):
        self.limit = limit
        self.retry_after = retry_after


def rate_limit(bucket: str):
    # async, so the check runs on the event loop one request at a time and needs no lock
    async def check(request: Request) -> None:
        limiter = LIMITS[bucket]
        retry_after = limiter.hit(request.client.host if request.client else "unknown")
        if retry_after is not None:
            raise RateLimited(limiter.limit, retry_after)

    return Depends(check)


def not_found() -> JSONResponse:
    return error_response(404, "CONVERSATION_NOT_FOUND", "Conversation does not exist")


app = FastAPI(
    title="Zayn",
    docs_url="/api/v1/docs",
    openapi_url="/api/v1/openapi.json",
    redoc_url=None,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",")],
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type"],
)


@app.exception_handler(RequestValidationError)
async def validation_failed(_: Request, exc: RequestValidationError) -> JSONResponse:
    return error_response(
        422,
        "VALIDATION_FAILED",
        "The request could not be processed",
        jsonable_encoder(exc.errors()),
    )


@app.exception_handler(RateLimited)
async def rate_limited(_: Request, exc: RateLimited) -> JSONResponse:
    seconds = math.ceil(exc.retry_after)
    response = error_response(
        429,
        "RATE_LIMITED",
        f"Too many requests. Try again in {seconds} seconds",
        {"retry_after": seconds, "limit_per_minute": exc.limit},
    )
    response.headers["Retry-After"] = str(seconds)
    response.headers["X-RateLimit-Limit"] = str(exc.limit)
    response.headers["X-RateLimit-Remaining"] = "0"
    return response


@app.exception_handler(HTTPException)
async def http_failed(_: Request, exc: HTTPException) -> JSONResponse:
    return error_response(exc.status_code, "HTTP_ERROR", str(exc.detail))


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": MODEL}


@app.get("/api/v1/conversations", response_model=ConversationPage, dependencies=[rate_limit("api")])
def list_conversations(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    q: str | None = Query(None, max_length=200, description="Words from a title or a message"),
    session: Session = Depends(get_session),
):
    page = {"limit": limit, "offset": offset}

    def run(where, order) -> tuple[int, list[Conversation]]:
        query: Select = select(Conversation)
        if where is not None:
            query = query.where(where)
        total = session.scalar(select(func.count()).select_from(query.subquery()))
        items = session.scalars(query.order_by(order, Conversation.id).limit(limit).offset(offset)).all()
        return total, items

    stages = search_stages(session, q) if q else None
    if stages is None:
        total, items = run(None, Conversation.updated_at.desc())
        return {**page, "items": items, "total": total}

    # The first stage that finds anything answers; stages are never merged
    for match, where, order in stages:
        total, items = run(where, order)
        if total:
            return {**page, "items": items, "total": total, "match": match}
    return {**page, "items": [], "total": 0}


@app.post("/api/v1/conversations", response_model=ConversationOut, status_code=201, dependencies=[rate_limit("api")])
def create_conversation(session: Session = Depends(get_session)):
    conversation = Conversation(title=NEW_CHAT_TITLE)
    session.add(conversation)
    session.commit()
    return conversation


@app.get("/api/v1/conversations/{conversation_id}", response_model=ConversationDetail, dependencies=[rate_limit("api")])
def get_conversation(conversation_id: uuid.UUID, session: Session = Depends(get_session)):
    conversation = session.get(Conversation, conversation_id)
    if conversation is None:
        return not_found()
    return ConversationDetail.model_validate(conversation)


@app.patch("/api/v1/conversations/{conversation_id}", response_model=ConversationOut, dependencies=[rate_limit("api")])
def rename_conversation(
    conversation_id: uuid.UUID, body: ConversationRename, session: Session = Depends(get_session)
):
    conversation = session.get(Conversation, conversation_id)
    if conversation is None:
        return not_found()
    conversation.title = body.title
    session.commit()
    return conversation


@app.delete("/api/v1/conversations/{conversation_id}", status_code=204, dependencies=[rate_limit("api")])
def delete_conversation(conversation_id: uuid.UUID, session: Session = Depends(get_session)):
    deleted = session.execute(delete(Conversation).where(Conversation.id == conversation_id))
    session.commit()
    if deleted.rowcount == 0:
        return not_found()
    logger.info("Deleted conversation %s and its messages", conversation_id)
    return Response(status_code=204)


@app.post("/api/v1/conversations/{conversation_id}/messages", dependencies=[rate_limit("model")])
def create_message(
    conversation_id: uuid.UUID, body: MessageIn, session: Session = Depends(get_session)
):
    """Stream the reply as NDJSON, one {"reasoning"}, {"content"}, or {"error"} object per line."""
    conversation = session.get(Conversation, conversation_id)
    if conversation is None:
        return not_found()

    prompt = build_messages(conversation.messages, body.content)
    stream = model_client.chat(model=MODEL, messages=prompt, options=OPTIONS, stream=True)
    try:
        # The client sends the request lazily, so the first chunk is read here, where a failure
        # can still be answered with a real status instead of a broken stream
        first = next(stream)
    except (ResponseError, httpx.HTTPError, StopIteration) as error:
        logger.warning("Model request failed: %s", error)
        return error_response(
            502,
            "MODEL_UNAVAILABLE",
            "The model could not answer. Try again shortly",
            {"upstream_status": getattr(error, "status_code", None)},
        )

    # The question is saved only once the model has started answering, so a failed request
    # leaves nothing behind
    # A title the user already set is kept; only the placeholder is replaced by the question
    if not conversation.messages and conversation.title == NEW_CHAT_TITLE:
        conversation.title = split_command(body.content)[1].strip().splitlines()[0][:80]
    conversation.updated_at = func.now()
    session.add(Message(conversation_id=conversation.id, role="user", content=body.content))
    session.commit()

    def events():
        content: list[str] = []
        reasoning: list[str] = []
        try:
            for chunk in itertools.chain([first], stream):
                if chunk.message.thinking:
                    reasoning.append(chunk.message.thinking)
                    yield json.dumps({"reasoning": chunk.message.thinking}) + "\n"
                if chunk.message.content:
                    content.append(chunk.message.content)
                    yield json.dumps({"content": chunk.message.content}) + "\n"
        except Exception:
            logger.exception("Model stream was interrupted")
            error = {"code": "STREAM_INTERRUPTED", "message": "The reply was interrupted. Try again"}
            yield json.dumps({"error": error}) + "\n"
        finally:
            # Also runs when the user stops the reply, so a partial answer is kept, not lost
            save_reply(conversation_id, "".join(content), "".join(reasoning) or None)

    return StreamingResponse(events(), media_type="application/x-ndjson")
