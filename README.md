# Codepilot

![Python](https://img.shields.io/badge/Python-3.13-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.141-009688?logo=fastapi&logoColor=white)
![Next](https://img.shields.io/badge/Next-16-000000?logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-4169E1?logo=postgresql&logoColor=white)
![Ollama](https://img.shields.io/badge/Ollama-Cloud-000000?logo=ollama&logoColor=white)
![Status](https://img.shields.io/badge/Status-Active-2EA043)
![License](https://img.shields.io/badge/License-MIT-750014)

A coding copilot in the browser, answered by a model on Ollama Cloud, with every conversation saved in PostgreSQL on this machine. **No model is downloaded or run locally.**

It exists because running Qwen2.5-Coder-7B through Ollama on the owner's laptop was too heavy to keep loaded while working, so the copilot went unused. The product intent is in [PRD.md](PRD.md) and the endpoints are in [API.md](API.md).

## Table of Contents

1. [Setup](#setup)
2. [Usage](#usage)
3. [Configuration](#configuration)
4. [Data](#data)
5. [Project Structure](#project-structure)
6. [Development](#development)
7. [Known Limitations](#known-limitations)
8. [Deviations From the Standards](#deviations-from-the-standards)
9. [License](#license)

## Setup

On the owner's machine the `chat` database is created and migrated and `npm install` has run, so only steps 1 and 2 remain. A fresh clone runs every step.

**1. Backend environment.** The `ai-project` conda environment, with Python 3.13.

```bash
conda activate ai-project
pip install -r requirements.txt
```

**Run every backend command below inside the activated `ai-project` environment.** Outside it, `pip` installs into a different interpreter and PowerShell answers `The term 'uvicorn' is not recognized`.

**2. Configuration.** Copy the template and fill it in by hand.

```bash
cp .env.example .env
```

Set `OLLAMA_API_KEY` to a key from ollama.com under Settings > Keys, pick the model in `OLLAMA_MODEL`, and put the local PostgreSQL password into `DATABASE_URL`. **The server refuses to start while `OLLAMA_API_KEY` still holds its placeholder, while `OLLAMA_MODEL` is unset, or while `DATABASE_URL` points anywhere but `127.0.0.1`, `localhost`, or `::1`.** That is deliberate: the model is chosen per machine and never falls back to one written in the code, and conversations may only live in the PostgreSQL server on this machine.

**3. Database.** Create the `chat` database on the local server, then build the tables.

```bash
psql -h 127.0.0.1 -U postgres -c "CREATE DATABASE chat"
alembic -c server/alembic.ini upgrade head
```

**The migration reads the same settings as the server, so step 2 has to come first.** With `OLLAMA_API_KEY` unset, it stops with `Field required` before touching the database.

**4. Frontend.**

```bash
npm install
```

## Usage

Start the API, then the website, each in its own terminal from the repository root.

```bash
conda activate ai-project
uvicorn main:app --app-dir server --host 127.0.0.1 --port 8000 --reload
```

```bash
npm run dev
```

Open `http://localhost:3000` and ask a question. The reply streams in, the model's reasoning sits behind **Show Reasoning** when the model returns one, and the conversation appears in the sidebar.

Start a message with a slash command to choose what kind of help you want. Type `/` in the box, or press the `/` button, to pick one from the menu.

| Command | Does |
| :- | :- |
| `/general` | Answers the question directly. The default when no command is given |
| `/explain` | Explains what the code does and where it can break |
| `/fix` | Returns the fixed code only |
| `/docstring` | Adds docstrings and type hints |
| `/refactor` | Restructures without changing the public API |
| `/review` | Reviews for correctness, security, and tests |
| `/optimize` | Makes it faster and simpler with the same behavior |
| `/testgen` | Writes tests for edge cases and error paths |
| `/translate` | Translates to another language |
| `/generate` | Generates exactly the format asked for |

An unknown command, such as `/etc/hosts`, is sent as plain text.

Rename a conversation by clicking its name above the chat, or from the menu beside it in the sidebar. Enter saves and Escape cancels.

## Configuration

Every variable the project reads. Names only; see `.env.example`.

| Variable | Required | Description |
| :- | :- | :- |
| `OLLAMA_API_KEY` | Yes | The Ollama Cloud key the API sends with every model request. Never reaches the browser |
| `OLLAMA_MODEL` | Yes | The model Ollama Cloud runs, such as `gpt-oss:20b` or `kimi-k2.7-code`. No default |
| `DATABASE_URL` | Yes | The local PostgreSQL connection, `postgresql+psycopg://...@127.0.0.1:5432/chat` |
| `CORS_ORIGINS` | No | Comma-separated browser origins allowed to call the API. Defaults to the website on port 3000 |
| `NEXT_PUBLIC_COPILOT_URL` | No | The API origin the website calls, built into the page. Defaults to `http://127.0.0.1:8000` |

**The model is chosen in `.env`; the system prompt and sampling live in `Modelfile`.** To switch model, set `OLLAMA_MODEL` to another model Ollama Cloud serves and restart the API; the list is at `https://ollama.com/search?c=cloud`. The API reads `SYSTEM` and every `PARAMETER` from the Modelfile at startup and sends them with each request.

## Data

**Conversations are stored in PostgreSQL on this machine and are never committed.**

| Item | Location | Notes |
| :- | :- | :- |
| Conversations and messages | Local PostgreSQL, database `chat` | Not in git. Deleting a conversation in the sidebar removes its messages too |
| Secrets | `.env` | Gitignored. Only `.env.example` is committed |
| Python environment | The `ai-project` conda environment | Outside the repository. Managed with conda by the owner |
| Frontend build | `.next/`, `out/` | Gitignored. Produced by `npm run dev` and `npm run build` |

Every message and the earlier turns of its conversation are sent to Ollama Cloud. Do not paste secrets or personal data into the chat.

## Project Structure

```text
Modelfile                 the system prompt and sampling, read by the API
server/
  main.py                 routes, slash commands, and the Ollama Cloud stream
  config.py               settings, with the local-only database check
  db.py                   the conversations and messages tables
  migrations/             Alembic migrations
  test_main.py            the smoke test
src/
  app/                    the one page, its layout, and the black and white theme
  components/             the chat, the sidebar, and the copy button
  components/ui/          shadcn and prompt-kit components, owned and edited here
  lib/                    the API client, the product name, and the command list
```

## Development

```bash
pytest server        # in ai-project; needs the local chat database, and each test deletes what it creates
npm run lint
npm run build        # static site in out/
```

The branch shape is trunk: `main` only. The browser tab shows the product name alone on every view, since the app is one screen.

## Known Limitations

- **Long conversations run into the model's context window.** Every earlier turn is sent again with each question, and `num_ctx` in the Modelfile is 8192 tokens. Past that, the model loses the oldest turns or the request fails. Start a new chat for a new topic.
- **The sidebar lists the latest 100 conversations.** Older ones stay in the database but are not shown.
- **A stopped reply keeps what had arrived.** Pressing stop saves the partial answer, and a reply stopped before any text arrived saves nothing.
- **Reasoning appears only for a model that returns it.** `gpt-oss:20b` does; a model without thinking shows no Show Reasoning block.
- **Ollama Cloud usage limits apply.** A request past the limit, or with a wrong key, fails with a "model could not answer" banner, and the question goes back into the box.
- **There is no sign-in.** Anyone who can reach port 8000 can read and delete conversations and spend the Ollama quota. The API is bound to `127.0.0.1` for that reason.
- **The tests use the real local database.** They create and delete their own conversations and leave the rest alone.

## Deviations From the Standards

1. **Next instead of React on Vite.** `stacks.rules.md` sets React 19 on Vite as the frontend. This uses Next 16 because the owner chose it. It is exported as static files, so it still ships as files with no Node server. The cost accepted: Next's build and conventions on top of React.
2. **lucide icons instead of Tabler.** `uix.component.md` and `stacks.rules.md` set Tabler as the one icon set. The prompt-kit and shadcn components the owner chose are built on lucide, so lucide is the one set used throughout. The cost accepted: glyph names differ from the other projects.
3. **prompt-kit's shapes instead of the two-radius scale.** `uix.component.md` and `button.component.md` set 8px and 16px radii and a border-only field focus. This keeps prompt-kit's round buttons, rounded input, and focus rings, because the owner asked for that look. The colors and type still follow the standard.
4. **No TanStack Query or axios.** `stacks.rules.md` starts every frontend on both. This app makes four small requests and one stream, and axios cannot read a stream in the browser. The cost accepted: no request cache.
5. **The model is on Ollama Cloud, not Claude.** `stacks.rules.md` sets Claude through the `anthropic` SDK. The owner chose Ollama Cloud for an open model. The cost accepted: a third party processes every message.
6. **One repository for the API and the website.** `repository.rules.md` requires separate `-backend` and `-frontend` repositories. This is a local tool with no deployment, so it stays together until it deploys. The cost accepted: split it before the first deployment.
7. **The API connects as the `postgres` superuser.** `database.rules.md` asks for a least-privilege user. This follows the owner's local setup, and the startup check keeps it on this machine. The cost accepted: a bug in the API has full rights on the local server.
8. **No authentication.** `security.rules.md` and `auth.rules.md` allow only the health route to be public. There is one user on one machine, and the API listens on `127.0.0.1` only.
9. **One `requirements.txt`, with no `pyproject.toml`.** `stacks.rules.md` declares the Python version in `pyproject.toml` and keeps test tools apart from runtime packages. The owner keeps one requirements file per project, so pytest and its test client sit beside the runtime packages. The cost accepted: the Python version is stated here rather than enforced, and a production install would carry the test tools.
10. **Scrollbars are hidden everywhere.** `scrollbar.component.md` keeps scrollbars visible, above all under content wider than its box. The owner asked for none. Scrolling still works by wheel, touch, and keyboard, and the chat keeps its scroll-to-latest button. The cost accepted: a code block wider than the reply gives no sign that it scrolls sideways; use Shift with the wheel, or a trackpad.

## License

MIT. See [LICENSE](LICENSE).
