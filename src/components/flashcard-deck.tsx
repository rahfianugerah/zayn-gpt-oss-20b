"use client";

import { ChevronLeft, ChevronRight, RotateCcw, Shuffle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Flashcard } from "@/lib/flashcards";
import { cn } from "@/lib/utils";

/** A /flashcards reply as a deck: a card flips from question to answer, one card at a time. */
export function FlashcardDeck({ cards: original }: { cards: Flashcard[] }) {
  const [cards, setCards] = useState(original);
  const [index, setIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const card = cards[index];

  function show(nextCards: Flashcard[], nextIndex: number) {
    setCards(nextCards);
    setIndex(nextIndex);
    setIsFlipped(false);
  }

  const step = (by: number) => show(cards, (index + by + cards.length) % cards.length);

  function shuffle() {
    // Fisher-Yates, so every order is equally likely
    const next = [...cards];
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    show(next, 0);
  }

  return (
    <div
      className="w-full rounded-xl border p-4"
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") step(1);
        if (event.key === "ArrowLeft") step(-1);
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="bg-primary/10 text-primary rounded px-2 py-1 text-xs font-medium">Flashcards</div>
          <span className="text-muted-foreground text-sm">{cards.length} cards</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Shuffle Cards" title="Shuffle" onClick={shuffle}>
            <Shuffle />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Start Over"
            title="Start over"
            onClick={() => show(original, 0)}
          >
            <RotateCcw />
          </Button>
        </div>
      </div>

      {/* Progress through the deck, drawn with a transform rather than an animated width */}
      <div className="bg-muted mb-4 h-1 overflow-hidden rounded-full">
        <div
          className="bg-primary h-full origin-left transition-transform duration-300"
          style={{ transform: `scaleX(${(index + 1) / cards.length})` }}
        />
      </div>

      <button
        type="button"
        onClick={() => setIsFlipped((flipped) => !flipped)}
        className="perspective-distant focus-visible:outline-ring block h-64 w-full rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <div
          className={cn(
            "relative size-full transition-transform duration-500 transform-3d motion-reduce:transition-none",
            isFlipped && "rotate-y-180",
          )}
        >
          {/* The hidden face is hidden from screen readers too, so only one side is read out */}
          <div aria-hidden={isFlipped} className="bg-card absolute inset-0 flex flex-col rounded-lg border p-6 backface-hidden">
            <span className="text-muted-foreground text-xs font-medium">Question</span>
            <p className="m-auto overflow-y-auto text-center text-lg font-semibold">{card.front}</p>
            <span className="text-muted-foreground text-center text-xs">Click to reveal the answer</span>
          </div>
          <div
            aria-hidden={!isFlipped}
            className="bg-primary text-primary-foreground absolute inset-0 flex rotate-y-180 flex-col rounded-lg p-6 backface-hidden"
          >
            <span className="text-xs font-medium opacity-70">Answer</span>
            <p className="m-auto overflow-y-auto text-center text-base">{card.back}</p>
            <span className="text-center text-xs opacity-70">Click to see the question</span>
          </div>
        </div>
      </button>

      <div className="mt-4 flex items-center justify-between">
        <Button variant="outline" size="icon" className="rounded-full" aria-label="Previous Card" onClick={() => step(-1)}>
          <ChevronLeft />
        </Button>
        <span className="text-muted-foreground text-sm tabular-nums" aria-live="polite">
          {index + 1} / {cards.length}
        </span>
        <Button variant="outline" size="icon" className="rounded-full" aria-label="Next Card" onClick={() => step(1)}>
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
