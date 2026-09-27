import assert from "node:assert/strict";
import { test } from "node:test";
import { parseFlashcards } from "./flashcards.ts";

test("reads a bare array", () => {
  assert.deepEqual(parseFlashcards('[{"front": "2 + 2", "back": "4"}]'), [{ front: "2 + 2", back: "4" }]);
});

test("reads an array wrapped in prose and a code fence", () => {
  const reply = 'Here you go:\n```json\n[{"front": " Q ", "back": " A "}]\n```';
  assert.deepEqual(parseFlashcards(reply), [{ front: "Q", back: "A" }]);
});

test("skips malformed cards and keeps the rest", () => {
  const reply = '[{"front": "Q"}, {"front": "", "back": "A"}, {"front": "Q2", "back": "A2"}, 3]';
  assert.deepEqual(parseFlashcards(reply), [{ front: "Q2", back: "A2" }]);
});

test("returns null for anything that is not a deck", () => {
  for (const reply of ["", "no cards here", "[]", "[1, 2]", '{"front": "Q", "back": "A"}', "[{broken"]) {
    assert.equal(parseFlashcards(reply), null, reply);
  }
});
