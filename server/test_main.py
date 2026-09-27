import json
import os
import uuid
from types import SimpleNamespace

import pytest

# Settings are read at import time. The key is a stand-in and the model client is replaced in
# every test that sends a message, so nothing here reaches Ollama Cloud. DATABASE_URL comes from
# the environment or .env, and each test deletes the conversations it creates.
os.environ["OLLAMA_API_KEY"] = "test-key"
os.environ["OLLAMA_MODEL"] = "test-model"

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


def send(conversation_id: str, content: str):
    return api.post(f"/api/v1/conversations/{conversation_id}/messages", json={"content": content})


def test_the_model_comes_from_the_environment_and_the_prompt_from_the_modelfile():
    assert main.MODEL == "test-model"
    assert "You are Zayn" in main.SYSTEM_PROMPT
    assert main.OPTIONS["temperature"] == 0.2
    assert main.OPTIONS["top_k"] == 40


def test_modelfile_parser_collects_repeated_stop_values():
    text = 'SYSTEM """\nHi\n"""\nPARAMETER stop "<a>"\nPARAMETER stop "<b>"\nPARAMETER num_ctx 8192\n'
    assert main.load_modelfile(text) == ("Hi", {"stop": ["<a>", "<b>"], "num_ctx": 8192})


def test_health():
    response = api.get("/health")
    assert response.status_code == 200
    assert response.json()["model"] == main.MODEL


def test_a_reply_is_streamed_and_saved_with_its_reasoning(monkeypatch, conversation_id):
    model = FakeModel([chunk(thinking="Plan"), chunk("Hel"), chunk("lo")])
    monkeypatch.setattr(main, "model_client", model)

    response = send(conversation_id, "/fix Fix this\nx = 1")
    assert response.status_code == 200
    events = [json.loads(line) for line in response.text.splitlines()]
    assert events == [{"reasoning": "Plan"}, {"content": "Hel"}, {"content": "lo"}]
    assert model.sent[-1]["content"] == f"{main.TASK_PROMPTS['fix']}\n\nFix this\nx = 1"

    saved = api.get(f"/api/v1/conversations/{conversation_id}").json()
    assert saved["title"] == "Fix this"
    assert [(m["role"], m["content"], m["reasoning"]) for m in saved["messages"]] == [
        ("user", "/fix Fix this\nx = 1", None),
        ("assistant", "Hello", "Plan"),
    ]

    send(conversation_id, "And now?")
    assert [m["role"] for m in model.sent] == ["system", "user", "assistant", "user"]
    assert model.sent[1]["content"] == "Fix this\nx = 1"
    assert model.sent[-1]["content"] == f"{main.TASK_PROMPTS['general']}\n\nAnd now?"


def test_a_slash_command_picks_the_task_and_an_unknown_one_stays_text():
    assert main.split_command("/review\ndef f(): pass") == ("review", "def f(): pass")
    assert main.split_command("/etc/hosts is empty") == ("general", "/etc/hosts is empty")
    assert main.split_command("/fixes please") == ("general", "/fixes please")


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


@pytest.mark.parametrize("content", ["   ", "/fix", "/review  \n"])
def test_a_message_with_no_question_is_rejected(conversation_id, content):
    response = send(conversation_id, content)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_FAILED"


def test_settings_refuse_a_remote_database():
    with pytest.raises(ValidationError):
        Settings(database_url="postgresql+psycopg://user:secret@db.example.com:5432/chat")


def test_settings_refuse_an_empty_model():
    with pytest.raises(ValidationError):
        Settings(ollama_model="")


def test_settings_refuse_the_placeholder_key():
    with pytest.raises(ValidationError):
        Settings(ollama_api_key="your_ollama_api_key_here")


def test_a_conversation_can_be_renamed(conversation_id):
    response = api.patch(f"/api/v1/conversations/{conversation_id}", json={"title": "  Pagination bug  "})
    assert response.status_code == 200
    assert response.json()["title"] == "Pagination bug"
    assert api.get(f"/api/v1/conversations/{conversation_id}").json()["title"] == "Pagination bug"


def test_a_title_set_before_the_first_question_is_kept(monkeypatch, conversation_id):
    monkeypatch.setattr(main, "model_client", FakeModel([chunk("Hi")]))
    api.patch(f"/api/v1/conversations/{conversation_id}", json={"title": "Mine"})
    send(conversation_id, "What is a generator?")
    assert api.get(f"/api/v1/conversations/{conversation_id}").json()["title"] == "Mine"


@pytest.mark.parametrize("title", ["   ", "x" * 121])
def test_a_blank_or_long_title_is_rejected(conversation_id, title):
    response = api.patch(f"/api/v1/conversations/{conversation_id}", json={"title": title})
    assert response.status_code == 422


def test_renaming_an_unknown_conversation_is_404():
    response = api.patch(f"/api/v1/conversations/{uuid.uuid4()}", json={"title": "Anything"})
    assert response.status_code == 404


@pytest.mark.parametrize("command", ["material", "flashcards"])
def test_the_study_commands_carry_their_instructions(monkeypatch, conversation_id, command):
    model = FakeModel([chunk("[]")])
    monkeypatch.setattr(main, "model_client", model)
    send(conversation_id, f"/{command} Python decorators")
    assert model.sent[-1]["content"] == f"{main.TASK_PROMPTS[command]}\n\nPython decorators"
