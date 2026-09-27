export type Flashcard = { front: string; back: string };

/**
 * Read the deck out of a /flashcards reply. The model is asked for a bare JSON array but may still
 * wrap it in prose or a code fence, so the outermost [...] is parsed and any malformed card is
 * skipped. Anything that yields no card returns null, and the reply is shown as text instead.
 */
export function parseFlashcards(reply: string): Flashcard[] | null {
  const start = reply.indexOf("[");
  const end = reply.lastIndexOf("]");
  if (start === -1 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(reply.slice(start, end + 1));
    if (!Array.isArray(parsed)) return null;
    const cards = parsed
      .filter(
        (card): card is Flashcard =>
          typeof card?.front === "string" && typeof card?.back === "string" && !!card.front.trim() && !!card.back.trim(),
      )
      .map((card) => ({ front: card.front.trim(), back: card.back.trim() }));
    return cards.length > 0 ? cards : null;
  } catch {
    return null;
  }
}
