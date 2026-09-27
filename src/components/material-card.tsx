"use client";

import { Download, Moon, Sun } from "lucide-react";
import { useState } from "react";
import type { Components } from "react-markdown";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import { cn } from "@/lib/utils";

// The owner's custom components for study material. Blue and purple are one step darker than the
// example they came from, so text clears 4.5:1 on white; the dark card switches to lighter ones.
const MATERIAL_COMPONENTS: Partial<Components> = {
  h3: ({ children }) => <h3 className="my-4 text-xl font-bold text-blue-600 dark:text-blue-400">{children}</h3>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-purple-600 underline hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => <blockquote className="my-4 border-l-4 border-green-500 pl-4 italic">{children}</blockquote>,
  li: ({ children }) => (
    <li className="my-1 flex items-start">
      <span className="mt-2.5 mr-2 inline-block size-2 shrink-0 rounded-full bg-orange-500" aria-hidden="true" />
      <span>{children}</span>
    </li>
  ),
};

// The dark card redefines the page tokens it uses, so the prose, badge, and buttons inside follow
const DARK_TOKENS =
  "dark bg-black text-white [--foreground:#ffffff] [--primary:#ffffff] [--muted-foreground:#d4d4d4] [--muted:#262626] [--border:#404040] [--card:#0a0a0a] [--card-foreground:#ffffff]";

function fileName(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug || "material"}.md`;
}

/** A /material reply: the Markdown in a card, with a light and dark toggle, copy, and download. */
export function MaterialCard({ content, isStreaming }: { content: string; isStreaming: boolean }) {
  const [isDark, setIsDark] = useState(false);
  const title = /^#{1,2}\s+(.+)$/m.exec(content)?.[1]?.trim() ?? "Study Material";
  const words = content.split(/\s+/).filter(Boolean).length;

  function download() {
    const url = URL.createObjectURL(new Blob([content], { type: "text/markdown" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName(title);
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={cn("w-full rounded-xl border p-6 transition-colors", isDark ? DARK_TOKENS : "bg-white text-black")}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="bg-primary/10 text-primary rounded px-2 py-1 text-xs font-medium">Material</div>
          <span className="text-muted-foreground text-sm">{isStreaming ? "Writing..." : `${words} words`}</span>
        </div>
        {!isStreaming && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={isDark ? "Light Mode" : "Dark Mode"}
              title={isDark ? "Light mode" : "Dark mode"}
              onClick={() => setIsDark((dark) => !dark)}
            >
              {isDark ? <Sun /> : <Moon />}
            </Button>
            <CopyButton text={content} label="Copy Material" size="icon" className="h-8 w-8" />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Download Markdown"
              title="Download as Markdown"
              onClick={download}
            >
              <Download />
            </Button>
          </div>
        )}
      </div>
      <Markdown components={MATERIAL_COMPONENTS} className="prose max-w-none">
        {content}
      </Markdown>
    </div>
  );
}
