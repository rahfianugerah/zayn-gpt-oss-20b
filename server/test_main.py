import os
from types import SimpleNamespace
from typing import ClassVar

import pytest

# Settings are read at import time, so a stand-in token is set first. Nothing here calls the network.
os.environ["HF_TOKEN"] = "test-token"

import main
from fastapi.testclient import TestClient
from huggingface_hub.errors import InferenceTimeoutError
from pydantic import ValidationError

api = TestClient(main.app)


def piece(text: str) -> SimpleNamespace:
    return SimpleNamespace(
        choices=[SimpleNamespace(delta=SimpleNamespace(content=text))]
    )


class FakeClient:
    sent: ClassVar[list[dict[str, str]]] = []

    def __init__(self, **_):
        pass

    def chat_completion(self, messages, **_):
        FakeClient.sent = messages
        return iter([piece("Hel"), piece("lo")])

    def close(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *_):
        pass


class DownClient(FakeClient):
    def chat_completion(self, messages, **_):
        raise InferenceTimeoutError("timed out")


def test_health():
    response = api.get("/health")
    assert response.status_code == 200
    assert response.json()["model"] == main.settings.model_id


def test_streams_the_reply_with_the_task_instruction(monkeypatch):
    monkeypatch.setattr(main, "InferenceClient", FakeClient)
    body = {
        "task": "fix",
        "messages": [
            {"role": "user", "content": "a"},
            {"role": "assistant", "content": "b"},
            {"role": "user", "content": "c"},
        ],
    }
    response = api.post("/api/v1/completions", json=body)
    assert response.status_code == 200
    assert response.text == "Hello"
    assert [m["role"] for m in FakeClient.sent] == [
        "system",
        "user",
        "assistant",
        "user",
    ]
    assert FakeClient.sent[-1]["content"] == f"{main.TASK_PROMPTS['fix']}\n\nc"


def test_rejects_a_conversation_ending_with_the_assistant():
    response = api.post(
        "/api/v1/completions",
        json={"messages": [{"role": "assistant", "content": "hi"}]},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_FAILED"


def test_reports_an_upstream_failure_as_502(monkeypatch):
    monkeypatch.setattr(main, "InferenceClient", DownClient)
    response = api.post(
        "/api/v1/completions", json={"messages": [{"role": "user", "content": "hi"}]}
    )
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "MODEL_UNAVAILABLE"


def test_refuses_to_start_on_the_placeholder_token():
    with pytest.raises(ValidationError):
        main.Settings(hf_token=main.TOKEN_PLACEHOLDER)
