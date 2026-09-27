# Zayn API

The API behind the Zayn website. It keeps conversations in the local PostgreSQL database and streams each reply from Ollama Cloud, **so the Ollama key never reaches the browser**.

## Table of Contents

1. [API Overview](#1-api-overview)
2. [Base Configuration](#2-base-configuration)
3. [Authentication and Authorization](#3-authentication-and-authorization)
4. [Request Standards](#4-request-standards)
5. [Response Standards](#5-response-standards)
6. [Endpoint Reference](#6-endpoint-reference)
7. [Error Handling](#7-error-handling)
8. [Pagination, Filtering, and Sorting](#8-pagination-filtering-and-sorting)
9. [Rate Limiting and Security](#9-rate-limiting-and-security)
10. [Testing and Versioning](#10-testing-and-versioning)
11. [Known Limitations](#known-limitations)

## 1. API Overview

One caller, the Zayn website on the same machine. It lists, opens, renames, and deletes saved conversations, and sends a message whose reply streams back while it is written. The model comes from `OLLAMA_MODEL` and the system prompt and sampling from `Modelfile`, never from the request.

## 2. Base Configuration

| Item | Value |
| :- | :- |
| Base URL | `http://127.0.0.1:8000` |
| Base path | `api/v1` |
| Protocol | HTTP, on the loopback interface only |
| Content type | `application/json`, and `application/x-ndjson` for a streamed reply |
| Character encoding | UTF-8 |
| Versioning method | In the path, `api/v1` |

**Every route is `api/v1/<route>`, and `/health` is the only route outside that prefix.** The OpenAPI page is at `api/v1/docs` and the schema at `api/v1/openapi.json`.

### General Request Flow

```text
Website > CORS > Router > Validation > PostgreSQL and Ollama Cloud > Response
```

## 3. Authentication and Authorization

### Authentication Method

<code style="color: red">Not Used</code>

There is one user on one machine, and the API listens on `127.0.0.1` only. This is recorded as a deviation in the README.

### Public and Protected Endpoints

| Endpoint | Access |
| :- | :- |
| `/health` | Public |
| Everything else | Public on the loopback interface |

## 4. Request Standards

### Request Headers

| Header | Required | Description |
| :- | :- | :- |
| `Content-Type` | Yes, on a body | `application/json` |

### Path Parameters

| Parameter | Type | Required | Description |
| :- | :- | :- | :- |
| `conversation_id` | UUID | Yes | The conversation, as returned when it was created |

### Query Parameters

| Parameter | Type | Required | Default | Description |
| :- | :- | :- | :- | :- |
| `limit` | Integer | No | `20` | Conversations per page, 1 to 100 |
| `offset` | Integer | No | `0` | Conversations to skip |

### Request Body Format

```json
{
  "content": "/fix Fix the off-by-one\ndef paginate(items, page, size): ..."
}
```

### Data Types

| Type | Format |
| :- | :- |
| String | UTF-8 |
| Number | JSON number, not a quoted string |
| Date and time | ISO 8601 with an explicit offset |
| Identifier | UUID for a conversation, integer for a message |

### Date and Time Format

```text
2026-09-27T14:30:00.123456+07:00
```

### Validation Rules

A body is checked by a typed model that **rejects an unexpected field**. `content` is at most 32,000 characters and must hold a question once any slash command is removed, so `/fix` alone is rejected. A validation failure returns `422`.

## 5. Response Standards

### Success Response

The resource is the body, with no envelope.

```json
{
  "id": "0b7c1e2a-4d1f-4f7e-9a53-2f0c8d1b6e44",
  "title": "Fix the off-by-one",
  "created_at": "2026-09-27T14:30:00.123456+07:00",
  "updated_at": "2026-09-27T14:31:12.004511+07:00"
}
```

### List Response

```json
{
  "items": [],
  "total": 0,
  "limit": 20,
  "offset": 0
}
```

### Error Response

```json
{
  "error": {
    "code": "CONVERSATION_NOT_FOUND",
    "message": "Conversation does not exist",
    "detail": null
  }
}
```

### Standard Status Codes

| Status | Name | Usage |
| :- | :- | :- |
| `200` | OK | Successful read or rename, or a reply stream that has started |
| `201` | Created | Conversation created |
| `204` | No Content | Conversation deleted |
| `404` | Not Found | The conversation does not exist, or the route does not |
| `422` | Unprocessable Entity | Validation failure |
| `502` | Bad Gateway | Ollama Cloud refused or failed the request |

### Null and Empty Values

A missing value is `null`, never an empty string. `reasoning` is `null` on every user message and on a reply from a model that returns none. A conversation with no messages has `"messages": []`.

### Sensitive Data

No response carries the Ollama key, the database URL, or a stack trace.

## 6. Endpoint Reference

| Method | Path | Purpose | Auth |
| :- | :- | :- | :- |
| `GET` | `/health` | Liveness check, and the model in use | No |
| `GET` | `api/v1/conversations` | List conversations, latest first | No |
| `POST` | `api/v1/conversations` | Create an empty conversation | No |
| `GET` | `api/v1/conversations/{conversation_id}` | Read a conversation and its messages | No |
| `PATCH` | `api/v1/conversations/{conversation_id}` | Rename a conversation | No |
| `DELETE` | `api/v1/conversations/{conversation_id}` | Delete a conversation and its messages | No |
| `POST` | `api/v1/conversations/{conversation_id}/messages` | Send a message and stream the reply | No |

### Health

#### `GET /health`

Reports that the API is up and which model `OLLAMA_MODEL` names.

```json
{ "status": "ok", "model": "gpt-oss:20b" }
```

### Conversations

#### `PATCH api/v1/conversations/{conversation_id}`

Renames a conversation and returns it. The title is trimmed; a conversation renamed before its first question keeps that title instead of taking one from the question.

| Field | Type | Required | Validation | Description |
| :- | :- | :- | :- | :- |
| `title` | string | Yes | 1 to 120 characters after trimming | The new name |

```bash
curl -X PATCH "http://127.0.0.1:8000/api/v1/conversations/0b7c1e2a-4d1f-4f7e-9a53-2f0c8d1b6e44" \
  -H "Content-Type: application/json" \
  -d '{ "title": "Pagination bug" }'
```

Error responses: `422` `VALIDATION_FAILED` for a blank or over-long title, and `404` `CONVERSATION_NOT_FOUND`.

#### `POST api/v1/conversations/{conversation_id}/messages`

Saves the question, sends it with the conversation's earlier turns to Ollama Cloud, and streams the reply. The reply is saved when the stream ends, or when the caller disconnects, keeping whatever had arrived.

| Item | Value |
| :- | :- |
| Authentication | Not required |
| Required role | Not applicable |
| Idempotent | No |

Request body:

| Field | Type | Required | Validation | Description |
| :- | :- | :- | :- | :- |
| `content` | string | Yes | At most 32,000 characters, not blank after the command | The message as typed. A leading `/general`, `/explain`, `/fix`, `/docstring`, `/refactor`, `/review`, `/optimize`, `/testgen`, `/translate`, or `/generate` chooses the task. Any other leading word is plain text |

Example request:

```bash
curl -N -X POST "http://127.0.0.1:8000/api/v1/conversations/0b7c1e2a-4d1f-4f7e-9a53-2f0c8d1b6e44/messages" \
  -H "Content-Type: application/json" \
  -d '{ "content": "/explain What does a Python generator do?" }'
```

Success response, `200`, one JSON object per line:

```text
{"reasoning": "The user wants a short explanation..."}
{"content": "A generator is a function that"}
{"content": " yields values one at a time..."}
```

| Field | Type | Description |
| :- | :- | :- |
| `reasoning` | string | A piece of the model's thinking, for a model that returns it |
| `content` | string | A piece of the answer |
| `error` | object | `{"code": "STREAM_INTERRUPTED", "message": ...}`, sent once if the stream breaks after it started |

Error responses:

| Status | Code | When |
| :- | :- | :- |
| `422` | `VALIDATION_FAILED` | `content` is missing, too long, blank, or only a command |
| `404` | `CONVERSATION_NOT_FOUND` | The conversation does not exist |
| `502` | `MODEL_UNAVAILABLE` | Ollama Cloud refused or failed before the first piece; `detail.upstream_status` carries its status, such as `401` for a wrong key |

Notes:

**Nothing is saved when the request fails with `502`**, so the same question can be sent again. The conversation's title is set from the first question, without its command, cut at 80 characters.

## 7. Error Handling

### Error Categories

| Category | Status | Description |
| :- | :- | :- |
| Validation | `422` | Invalid input |
| Not found | `404` | The conversation or the route does not exist |
| Upstream | `502` | Ollama Cloud could not answer |

### Error Code Convention

`[RESOURCE]_[CONDITION]`, in screaming snake case, stable once published.

```text
VALIDATION_FAILED
CONVERSATION_NOT_FOUND
MODEL_UNAVAILABLE
STREAM_INTERRUPTED
HTTP_ERROR
```

`HTTP_ERROR` covers a route or method that does not exist.

### Validation Error Example

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The request could not be processed",
    "detail": [
      { "type": "value_error", "loc": ["body", "content"], "msg": "Value error, the message is empty" }
    ]
  }
}
```

### Retry Guidance

| Status | Retry |
| :- | :- |
| `502` | Yes, after a moment; nothing was saved |
| `4xx` | No; the request is wrong and will stay wrong |

## 8. Pagination, Filtering, and Sorting

### Pagination

Only `GET api/v1/conversations` returns a list, and it is paginated.

| Parameter | Default | Maximum |
| :- | :- | :- |
| `limit` | 20 | 100 |
| `offset` | 0 | none |

### Filtering

<code style="color: red">Not Used</code>

### Sorting

Fixed: latest activity first, by `updated_at`.

## 9. Rate Limiting and Security

### Rate Limit

<code style="color: red">Not Used</code>

Ollama Cloud's own usage limit is the ceiling, and a request past it returns `502`.

### Security Controls

| Control | Implementation |
| :- | :- |
| Transport | Loopback only when started with `--host 127.0.0.1`, as the README shows |
| Input validation | Typed model at the boundary, unexpected fields rejected |
| Injection | ORM queries only |
| Secrets | Never in a response, a log, or an error; settings errors hide their inputs |
| Database | Refuses to start unless `DATABASE_URL` points at this machine |
| Audit | Every deleted conversation is logged with its id |

### CORS

| Item | Value |
| :- | :- |
| Allowed origins | `CORS_ORIGINS`, by default `http://localhost:3000` and `http://127.0.0.1:3000` |
| Allowed methods | `GET`, `POST`, `PATCH`, `DELETE` |
| Credentials | `false` |

### Request Size Limits

| Item | Limit |
| :- | :- |
| Message content | 32,000 characters |

## 10. Testing and Versioning

### Testing

| Item | Value |
| :- | :- |
| Tools | pytest with FastAPI's test client |
| Automated tests | `server/test_main.py` |
| Test environment | The local `chat` database; the model client is replaced, so Ollama Cloud is never called |

```bash
pytest server
```

### Version History

| Version | Released | Notes |
| :- | :- | :- |
| `v1` | 2026-09-27 | Conversations, streamed replies, and slash commands |

### Deprecation Policy

None yet. There is one caller, released together with the API.

### Breaking Changes

**A breaking change ships as `api/v2`, mounted alongside `v1`.**

## Known Limitations

- **Every earlier turn is resent with each message.** A long conversation eventually passes the Modelfile's `num_ctx` of 8192 tokens, and the model then loses the oldest turns or the request fails.
- **A reply cannot be resumed.** If the caller disconnects, the partial reply is saved and the stream is not restarted.
- **The list is capped at 100 per page and has no search.** Page through it with `offset`.
