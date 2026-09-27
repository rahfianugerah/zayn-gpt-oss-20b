"use client"

import { cn } from "@/lib/utils"
import React, { useEffect, useState } from "react"
import { codeToHtml, type ThemeRegistration } from "shiki"

export type CodeBlockProps = {
  children?: React.ReactNode
  className?: string
} & React.HTMLProps<HTMLDivElement>

function CodeBlock({ children, className, ...props }: CodeBlockProps) {
  return (
    <div
      className={cn(
        "not-prose flex w-full flex-col overflow-clip border",
        "border-border bg-card text-card-foreground rounded-xl",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export type CodeBlockCodeProps = {
  code: string
  language?: string
  theme?: string | ThemeRegistration
  className?: string
} & React.HTMLProps<HTMLDivElement>

// Black and white highlighting: weight and gray carry the structure instead of hue
const MONO_THEME: ThemeRegistration = {
  name: "codepilot-mono",
  type: "light",
  colors: { "editor.background": "#ffffff", "editor.foreground": "#000000" },
  tokenColors: [
    {
      scope: ["comment", "punctuation.definition.comment"],
      settings: { foreground: "#767676", fontStyle: "italic" },
    },
    {
      scope: ["keyword", "storage", "storage.type", "storage.modifier"],
      settings: { foreground: "#000000", fontStyle: "bold" },
    },
    {
      scope: ["string", "constant.numeric", "constant.language"],
      settings: { foreground: "#4a4a4a" },
    },
  ],
}

function CodeBlockCode({
  code,
  language = "tsx",
  theme = MONO_THEME,
  className,
  ...props
}: CodeBlockCodeProps) {
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null)

  useEffect(() => {
    async function highlight() {
      if (!code) {
        setHighlightedHtml("<pre><code></code></pre>")
        return
      }

      // A model can tag a fence with any word, and shiki throws on a language it does not know
      const html = await codeToHtml(code, { lang: language, theme }).catch(
        () => codeToHtml(code, { lang: "text", theme })
      )
      setHighlightedHtml(html)
    }
    highlight()
  }, [code, language, theme])

  const classNames = cn(
    "w-full overflow-x-auto text-[13px] [&>pre]:px-4 [&>pre]:py-4",
    className
  )

  // SSR fallback: render plain code if not hydrated yet
  return highlightedHtml ? (
    <div
      className={classNames}
      dangerouslySetInnerHTML={{ __html: highlightedHtml }}
      {...props}
    />
  ) : (
    <div className={classNames} {...props}>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  )
}

export type CodeBlockGroupProps = React.HTMLAttributes<HTMLDivElement>

function CodeBlockGroup({
  children,
  className,
  ...props
}: CodeBlockGroupProps) {
  return (
    <div
      className={cn("flex items-center justify-between", className)}
      {...props}
    >
      {children}
    </div>
  )
}

export { CodeBlockGroup, CodeBlockCode, CodeBlock }
