import json
import os
import uuid
from types import SimpleNamespace

import pytest

# Settings are read at import time. The key is a stand-in and the model client is replaced in
# every test that sends a message, so nothing here reaches Ollama Cloud. DATABASE_URL comes from
# the environment or .env, and each test deletes the conversations it creates.
os.environ["OLLAMA_API_KEY"] = "test-key"

import main
from config import Settings
from fastapi.testclient import TestClient
from ollama import ResponseError
from pydantic import ValidationError

api = TestClient(main.app)


def chunk(content: str = "", thinking: str | None = None) -> SimpleNamespace:
    return SimpleNamespace(message=SimpleNamespace(content=content, thinking=thinking))


class FakeModel:
    """Stands in for the Ollama client, failing lazily on the first chunk as the real one does."""

    def __init__(self, chunks=(), error: Exception | None = None):
        self.chunks, self.error, self.sent = chunks, error, []

    def chat(self, messages, **_):
        self.sent = messages

        def stream():
            if self.error:
                raise self.error
            yield from self.chunks

        return stream()


@pytest.fixture
def conversation_id():
    response = api.post("/api/v1/conversations")
    assert response.status_code == 201
    yield response.json()["id"]
    api.delete(f"/api/v1/conversations/{response.json()['id']}")


def send(conversation_id: str, content: str, task: str = "general"):
    return api.post(
        f"/api/v1/conversations/{conversation_id}/messages",
        json={"task": task, "content": content},
    )


def test_modelfile_drives_the_request():
    assert "You are Codepilot" in main.SYSTEM_PROMPT
    assert main.OPTIONS["temperature"] == 0.2
    assert main.OPTIONS["top_k"] == 40


def test_modelfile_parser_collects_repeated_stop_values():
    text = 'FROM m\nSYSTEM """\nHi\n"""\nPARAMETER stop "<a>"\nPARAMETER stop "<b>"\nPARAMETER num_ctx 8192\n'
    assert main.load_modelfile(text) == ("m", "Hi", {"stop": ["<a>", "<b>"], "num_ctx": 8192})


def test_health():
    response = api.get("/health")
    assert response.status_code == 200
    assert response.json()["model"] == main.MODEL


def test_a_reply_is_streamed_and_saved_with_its_reasoning(monkeypatch, conversation_id):
    model = FakeModel([chunk(thinking="Plan"), chunk("Hel"), chunk("lo")])
    monkeypatch.setattr(main, "model_client", model)

    response = send(conversation_id, "Fix this\nx = 1", task="fix")
    assert response.status_code == 200
    events = [json.loads(line) for line in response.text.splitlines()]
    assert events == [{"reasoning": "Plan"}, {"content": "Hel"}, {"content": "lo"}]
    assert model.sent[-1]["content"] == f"{main.TASK_PROMPTS['fix']}\n\nFix this\nx = 1"

    saved = api.get(f"/api/v1/conversations/{conversation_id}").json()
    assert saved["title"] == "Fix this"
    assert [(m["role"], m["content"], m["reasoning"]) for m in saved["messages"]] == [
        ("user", "Fix this\nx = 1", None),
        ("assistant", "Hello", "Plan"),
    ]

    send(conversation_id, "And now?")
    assert [m["role"] for m in model.sent] == ["system", "user", "assistant", "user"]


def test_a_failed_model_call_saves_nothing(monkeypatch, conversation_id):
    monkeypatch.setattr(main, "model_client", FakeModel(error=ResponseError("unauthorized", 401)))

    response = send(conversation_id, "Hello")
    assert response.status_code == 502
    assert response.json()["error"]["detail"] == {"upstream_status": 401}
    assert api.get(f"/api/v1/conversations/{conversation_id}").json()["messages"] == []


def test_the_list_is_paginated_with_the_latest_first(conversation_id):
    page = api.get("/api/v1/conversations?limit=1").json()
    assert page["limit"] == 1
    assert page["total"] >= 1
    assert [item["id"] for item in page["items"]] == [conversation_id]


def test_an_unknown_conversation_is_404():
    missing = f"/api/v1/conversations/{uuid.uuid4()}"
    assert api.get(missing).json()["error"]["code"] == "CONVERSATION_NOT_FOUND"
    assert api.delete(missing).status_code == 404


def test_a_blank_message_is_rejected(conversation_id):
    response = send(conversation_id, "   ")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_FAILED"


def test_settings_refuse_a_remote_database():
    with pytest.raises(ValidationError):
        Settings(database_url="postgresql+psycopg://user:secret@db.example.com:5432/chat")


def test_settings_refuse_the_placeholder_key():
    with pytest.raises(ValidationError):
        Settings(ollama_api_key="your_ollama_api_key_here")
