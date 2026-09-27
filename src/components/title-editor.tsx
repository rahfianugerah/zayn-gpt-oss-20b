"use client";

import { Check, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type TitleEditorProps = {
  title: string;
  onSave: (title: string) => void;
  onCancel: () => void;
  className?: string;
};

/** An inline title field with save and cancel buttons. Enter or leaving it saves, Escape cancels. */
export function TitleEditor({ title, onSave, onCancel, className }: TitleEditorProps) {
  const [value, setValue] = useState(title);
  // The field unmounts right after a save or cancel and then fires blur, which must not act again
  const doneRef = useRef(false);
  const next = value.trim();
  const canSave = next.length > 0 && next !== title;

  function finish(save: boolean) {
    if (doneRef.current) return;
    doneRef.current = true;
    if (save && canSave) onSave(next);
    else onCancel();
  }

  // The buttons keep the focus in the field when pressed, so the field's blur does not save
  // before Cancel gets its click
  const keepFocus = (event: React.MouseEvent) => event.preventDefault();

  return (
    <div className={cn("animate-in fade-in-0 zoom-in-95 flex w-full min-w-0 items-center gap-1 text-sm duration-150", className)}>
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
        // No border, at the owner's request: the gray fill alone marks the title as being edited
        className="bg-muted w-full min-w-0 rounded-md px-2 py-1 outline-none"
      />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Save Title"
        title="Save (Enter)"
        disabled={!canSave}
        onMouseDown={keepFocus}
        onClick={() => finish(true)}
      >
        <Check className="text-green-700" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Cancel Rename"
        title="Cancel (Esc)"
        onMouseDown={keepFocus}
        onClick={() => finish(false)}
      >
        <X />
      </Button>
    </div>
  );
}
