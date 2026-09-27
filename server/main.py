import logging
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from huggingface_hub import InferenceClient
from huggingface_hub.errors import HfHubHTTPError, InferenceTimeoutError
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    SecretStr,
    field_validator,
    model_validator,
)
from pydantic_settings import BaseSettings, SettingsConfigDict
from starlette.exceptions import HTTPException

ROOT = Path(__file__).resolve().parent.parent
TOKEN_PLACEHOLDER = "your_hf_token_here"

logger = logging.getLogger("codepilot")


class Settings(BaseSettings):
    # The same .env also holds the frontend's PUBLIC_ variables, so unknown keys are ignored
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")

    hf_token: SecretStr
    model_id: str = "Qwen/Qwen2.5-Coder-7B-Instruct"
    cors_origins: str = "http://localhost:4321,http://127.0.0.1:4321"

    @field_validator("hf_token")
    @classmethod
    def reject_placeholder(cls, value: SecretStr) -> SecretStr:
        if value.get_secret_value().strip() in ("", TOKEN_PLACEHOLDER):
            raise ValueError(
                "HF_TOKEN is empty or still holds the placeholder from .env.example"
            )
        return value


settings = Settings()

# What the old Modelfile baked into the local model, now sent with every request. The provider
# applies Qwen's own chat template, so the Modelfile TEMPLATE block has no equivalent here.
SYSTEM_PROMPT = (
    "You are Codepilot, a genius, smart, faster coding copilot. "
    "You produce correct, secure, and runnable code with minimal verbosity. "
    "When a task is underspecified, ask focused clarifying questions before solving. "
    "When code is provided, read it first, reason about intent, then produce the final answer. "
    "For fixes, return only the fixed code unless explicitly asked for an explanation. "
    "For refactors, preserve public APIs and tests. "
    "For docstrings, add accurate types and concise, helpful descriptions. "
    "Prefer standard libraries and stable patterns. "
    "Avoid speculative dependencies. "
    "If the user requests formats, honor them exactly: 'diff' means a unified patch; "
    "'json' means strict JSON; 'code only' means only code. "
    "Never include private chain-of-thought; provide results and, if asked, brief bullet-point reasoning. "
    "Detect and prevent data leakage and unsafe patterns. "
    "Default to POSIX-compatible examples. "
    "Always be deterministic and reproducible where possible."
)
# top_k and repeat_penalty from the Modelfile are Ollama-only and have no OpenAI-compatible field
SAMPLING = {"temperature": 0.2, "top_p": 0.9, "max_tokens": 4096}

Task = Literal[
    "general",
    "explain",
    "fix",
    "docstring",
    "refactor",
    "review",
    "optimize",
    "testgen",
    "translate",
    "generate",
]

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
}


class Message(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=32_000)


class CompletionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task: Task = "general"
    messages: list[Message] = Field(min_length=1, max_length=50)

    @model_validator(mode="after")
    def ends_with_user(self) -> "CompletionRequest":
        if self.messages[-1].role != "user":
            raise ValueError("the last message must come from the user")
        return self


def build_messages(request: CompletionRequest) -> list[dict[str, str]]:
    """Prepend the system prompt and put the task instruction in front of the latest question."""
    *history, latest = request.messages
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        *({"role": m.role, "content": m.content} for m in history),
        {
            "role": "user",
            "content": f"{TASK_PROMPTS[request.task]}\n\n{latest.content}",
        },
    ]


def error_response(
    status: int, code: str, message: str, detail: object = None
) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message, "detail": detail}},
    )


app = FastAPI(
    title="Codepilot",
    docs_url="/api/v1/docs",
    openapi_url="/api/v1/openapi.json",
    redoc_url=None,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",")],
    allow_methods=["GET", "POST"],
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


@app.exception_handler(HTTPException)
async def http_failed(_: Request, exc: HTTPException) -> JSONResponse:
    return error_response(exc.status_code, "HTTP_ERROR", str(exc.detail))


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": settings.model_id}


@app.post("/api/v1/completions", response_class=StreamingResponse)
def create_completion(request: CompletionRequest):
    """Stream the model's reply as plain text chunks."""
    client = InferenceClient(api_key=settings.hf_token.get_secret_value(), timeout=300)
    try:
        # The request is sent here, so an upstream failure is still reported with a real status
        stream = client.chat_completion(
            build_messages(request), model=settings.model_id, stream=True, **SAMPLING
        )
    except (HfHubHTTPError, InferenceTimeoutError) as error:
        client.close()
        upstream_status = getattr(getattr(error, "response", None), "status_code", None)
        logger.warning(
            "Model request failed with upstream status %s: %s", upstream_status, error
        )
        return error_response(
            502,
            "MODEL_UNAVAILABLE",
            "The model could not answer. Try again shortly",
            {"upstream_status": upstream_status},
        )

    def pieces():
        with client:
            try:
                for chunk in stream:
                    if chunk.choices and chunk.choices[0].delta.content:
                        yield chunk.choices[0].delta.content
            except Exception:
                # Headers are already sent, so the failure can only be reported inside the text
                logger.exception("Model stream was interrupted")
                yield "\n\n[Error] The reply was interrupted. Try again."

    return StreamingResponse(pieces(), media_type="text/plain; charset=utf-8")
