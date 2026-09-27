"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

type TitleEditorProps = {
  title: string;
  onSave: (title: string) => void;
  onCancel: () => void;
  className?: string;
};

/** An inline title field: Enter or leaving it saves, Escape cancels, a blank title is not saved. */
export function TitleEditor({ title, onSave, onCancel, className }: TitleEditorProps) {
  const [value, setValue] = useState(title);
  // The field unmounts right after Enter or Escape and then fires blur, which must not save again
  const doneRef = useRef(false);

  function finish(save: boolean) {
    if (doneRef.current) return;
    doneRef.current = true;
    const next = value.trim();
    if (save && next && next !== title) onSave(next);
    else onCancel();
  }

  return (
    <input
      autoFocus
      aria-label="Conversation Title"
      maxLength={120}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => event.target.select()}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === "Escape") {
          event.preventDefault();
          finish(event.key === "Enter");
        }
      }}
      className={cn(
        "border-ring bg-background w-full min-w-0 rounded-md border px-2 py-1 text-sm outline-none",
        className,
      )}
    />
  );
}
