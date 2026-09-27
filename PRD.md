# PRD: Codepilot

**Owner:** Naufal Rahfi Anugerah
**Date:** 2026-09-27
**Status:** Draft

## Problem

Codepilot answered coding questions by running Qwen2.5-Coder-7B-Instruct on the owner's own machine. That meant downloading a 4.7 GB model, building it locally from the Modelfile, and keeping it loaded in memory while working. On the owner's hardware this is too heavy, so the copilot sat unused: every session started with a download or a model that competed with the editor for memory.

The interface also shipped a full server-rendered framework and a mascot image for what is one chat screen, so the page was slower to load than the work it supports.

## Users

One person: the owner, using it daily as a personal coding assistant while writing and reviewing code.

## What Is Built

- Ask the copilot a coding question in the browser and read the reply as it is written.
- Pick what kind of help is wanted before asking: a general answer, an explanation, a fix, docstrings, a refactor, a review, an optimization, tests, a translation, or a generated artifact.
- Copy any code block in a reply with one action.
- Keep the conversation going: follow-up questions see the earlier turns.
- Run the whole thing from a fresh clone without downloading or building a model. The model runs in the cloud and the owner supplies one access key.

## What Is Not Built

- **No local or offline mode.** Running the model locally is the problem this change removes. The old local path is dropped rather than kept beside the cloud one.
- **No fine-tuned or custom model weights.** The copilot is the published Qwen2.5-Coder-7B-Instruct model plus Codepilot's instructions. Nothing is trained.
- **No accounts or sign-in.** One person uses it on their own machine.
- **No saved conversations.** A reload starts a new conversation.
- **No file or project upload.** Code is pasted into the message.
- **No deployment in this phase.** It runs on the owner's machine only.
- **No mascot or logo.** The old mascot is removed and the new one is not ready. The product name carries the brand until it is.

## Success Measure

- From a fresh clone, the first reply arrives without any model download, with only the access key set by hand.
- The chat page ships under 100 KB of JavaScript, measured from the production build.
- The owner uses it for a normal working day without needing to start a local model.

## Constraints

- The model is Qwen2.5-Coder-7B-Instruct, the model this project is named for.
- The access key never reaches the browser.
- The access key is supplied by the owner by hand and is never read, printed, or committed by anyone else.
- Running cost stays within what the owner is willing to pay per month for a personal tool.

## Data

- **Read:** the messages the owner types, including any pasted code.
- **Sent:** those messages go to Hugging Face and the inference provider it routes the request to, which run the model. They leave the owner's machine.
- **Written:** nothing. Codepilot stores no conversation, on disk or anywhere else.
- **Personal data:** none is required. The owner should not paste secrets or personal data into a message, because it is processed by a third party.

## Open Questions

- Should a Codepilot build of the model also be published on Hugging Face, so it can be pulled by name? Owner to decide. It does not change how the copilot runs.
- Does the free monthly inference credit cover daily use, or is a paid plan needed? Owner to decide after the first month of use.
- The new mascot, and where it appears. Owner to decide.
