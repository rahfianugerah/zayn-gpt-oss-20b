# PRD: Zayn

**Owner:** Naufal Rahfi Anugerah
**Date:** 2026-09-27
**Status:** Draft

## Problem

Running a coding model on the owner's own machine meant downloading several gigabytes, building it locally from the Modelfile, and keeping it loaded in memory while working. On the owner's hardware this is too heavy, so the copilot sat unused: every session started with a download or a model that competed with the editor for memory.

Every conversation was also lost on reload. An answer worth keeping had to be copied out by hand before closing the tab, and a question asked yesterday could not be picked up again today.

## Users

One person: the owner, using it daily as a personal coding assistant while writing and reviewing code.

## What Is Built

- Ask the copilot a coding question in the browser and read the reply as it is written.
- Dictate a question by voice instead of typing it, in a browser that supports speech input.
- Pick what kind of help is wanted before asking: a general answer, an explanation, a fix, docstrings, a refactor, a review, an optimization, tests, a translation, or a generated artifact.
- See the model's reasoning, collapsed by default, whenever the model provides it.
- Generate study material: describe the material needed, and read it back as a formatted document that can be copied or downloaded as Markdown.
- Test knowledge with flashcards: describe what to be tested on, and study a deck of cards that show a question and flip to its answer, in the way NotebookLM's flashcards work.
- Copy a reply, or any code block in it, with one action.
- Keep the conversation going: follow-up questions see the earlier turns.
- Come back to an earlier conversation from a sidebar, grouped by when it happened, and delete one that is no longer needed.
- Rename a conversation, from the sidebar or from its name above the chat, when the title taken from the first question does not say what it is about.
- Recognize the copilot by its name, Zayn, and its mascot, shown as the logo beside the name, beside every reply, and in the browser tab.
- Run the whole thing from a fresh clone without downloading or building a model. The model runs in the cloud and the owner supplies one access key.

## What Is Not Built

- **No local or offline model.** Running the model locally is the problem this change removes. The old local path is dropped rather than kept beside the cloud one.
- **No fine-tuned or custom model weights.** Nothing is trained.
- **No accounts or sign-in.** One person uses it on their own machine.
- **No sync between machines.** Conversations live in the database on the owner's machine and nowhere else.
- **No file or project upload.** Code is pasted into the message.
- **No rating, editing, or regenerating of a message.** A reply is kept as it was written.
- **No scored quizzes or spaced repetition.** Flashcards are for self-testing; nothing records which cards were known.
- **No deployment in this phase.** It runs on the owner's machine only.

## Success Measure

- From a fresh clone, the first reply arrives without any model download, with only the access key and the local database set up by hand.
- The first words of a reply appear within 3 seconds of pressing Send.
- A conversation reopened from the sidebar after a reload shows every earlier message.
- The owner uses it for a normal working day without needing to start a local model.

## Constraints

- The model is `gpt-oss:20b` on Ollama Cloud, as the owner decided, with Zayn's instructions from the Modelfile.
- The access key never reaches the browser.
- The access key and the database password are supplied by the owner by hand and are never read, printed, or committed by anyone else.
- Conversations are stored only in the PostgreSQL server on the owner's own machine, in a database named `chat`. Never a cloud or remote database.
- Running cost stays within what the owner is willing to pay per month for a personal tool.

## Data

- **Read:** the messages the owner types, including any pasted code.
- **Sent:** those messages, with the earlier turns of the same conversation, go to Ollama Cloud, which runs the model. They leave the owner's machine.
- **Voice:** a dictated question is turned into text by the browser's own speech service, which in Chrome and Edge sends the audio to Google or Microsoft. Nothing is recorded or stored by Zayn.
- **Written:** each conversation's title, messages, and any reasoning the model returned, in the local `chat` database. Deleting a conversation removes all of it.
- **Personal data:** none is required. The owner should not paste secrets or personal data into a message, because it is processed by a third party and kept in the local database.

## Open Questions

- Does the Ollama Cloud free usage limit cover daily use, or is a paid plan needed? Owner to decide after the first month of use.
