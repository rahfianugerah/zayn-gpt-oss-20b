"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type CopyButtonProps = { text: string; label?: string } & React.ComponentProps<typeof Button>;

/** An icon button that copies text and shows a check mark for a moment. */
export function CopyButton({ text, label = "Copy", ...props }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={copied ? "Copied" : label}
      {...props}
      onClick={(event) => {
        props.onClick?.(event);
        void copy();
      }}
    >
      {/* green-700 rather than green-500, which is too faint on white to read as a state */}
      {copied ? <Check className="text-green-700" /> : <Copy />}
    </Button>
  );
}
