import { cn } from "@/lib/utils"
import { marked } from "marked"
import { memo, useId, useMemo } from "react"
import ReactMarkdown, { Components } from "react-markdown"
import remarkBreaks from "remark-breaks"
import remarkGfm from "remark-gfm"
import { CopyButton } from "@/components/copy-button"
import { CodeBlock, CodeBlockCode, CodeBlockGroup } from "./code-block"

export type MarkdownProps = {
  children: string
  id?: string
  className?: string
  components?: Partial<Components>
}

function parseMarkdownIntoBlocks(markdown: string): string[] {
  const tokens = marked.lexer(markdown)
  return tokens.map((token) => token.raw)
}

function extractLanguage(className?: string): string {
  if (!className) return "plaintext"
  // Wider than \w, so c++, c#, and objective-c keep their whole name
  const match = className.match(/language-([\w+#-]+)/)
  return match ? match[1].toLowerCase() : "plaintext"
}

// The name a reader knows for the tag a model writes after the fence
const LANGUAGE_NAMES: Record<string, string> = {
  bash: "Shell",
  c: "C",
  "c#": "C#",
  "c++": "C++",
  cpp: "C++",
  cs: "C#",
  csharp: "C#",
  css: "CSS",
  diff: "Diff",
  dockerfile: "Dockerfile",
  go: "Go",
  html: "HTML",
  java: "Java",
  javascript: "JavaScript",
  js: "JavaScript",
  json: "JSON",
  jsx: "JSX",
  kotlin: "Kotlin",
  markdown: "Markdown",
  md: "Markdown",
  php: "PHP",
  plaintext: "Text",
  powershell: "PowerShell",
  ps1: "PowerShell",
  py: "Python",
  python: "Python",
  rb: "Ruby",
  ruby: "Ruby",
  rs: "Rust",
  rust: "Rust",
  sh: "Shell",
  shell: "Shell",
  sql: "SQL",
  swift: "Swift",
  text: "Text",
  toml: "TOML",
  ts: "TypeScript",
  tsx: "TSX",
  typescript: "TypeScript",
  yaml: "YAML",
  yml: "YAML",
  zsh: "Shell",
}

function languageName(language: string): string {
  return LANGUAGE_NAMES[language] ?? language.charAt(0).toUpperCase() + language.slice(1)
}

// A fenced block is always a <pre> around a <code>, so it is handled at the <pre>. Deciding at the
// <code> by line count, as the original did, turned a one-line fenced block into inline code.
const INITIAL_COMPONENTS: Partial<Components> = {
  code: function CodeComponent({ className, children }) {
    return (
      <code
        className={cn("bg-muted rounded-sm px-1 font-mono text-sm", className)}
      >
        {children}
      </code>
    )
  },
  pre: function PreComponent({ node }) {
    const code = node?.children[0]
    if (code?.type !== "element") return null
    const language = extractLanguage(
      (code.properties.className as string[] | undefined)?.join(" ")
    )
    const text = code.children
      .map((child) => (child.type === "text" ? child.value : ""))
      .join("")
      .replace(/\n$/, "")

    const lines = text.split("\n").length

    return (
      <CodeBlock className="my-4">
        <CodeBlockGroup className="border-border border-b px-4 py-2">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 text-primary rounded px-2 py-1 text-xs font-medium">
              {languageName(language)}
            </div>
            <span className="text-muted-foreground text-sm">
              {lines} {lines === 1 ? "line" : "lines"}
            </span>
          </div>
          <CopyButton text={text} label="Copy Code" size="icon" className="h-8 w-8" />
        </CodeBlockGroup>
        {/* On a phone a long line wraps instead of running off the screen, since hidden
            scrollbars would give no sign that it scrolls sideways */}
        <CodeBlockCode
          code={text}
          language={language}
          className="max-sm:[&_pre]:whitespace-pre-wrap max-sm:[&_pre]:[overflow-wrap:anywhere]"
        />
      </CodeBlock>
    )
  },
  // A table wider than the reply scrolls inside its own box instead of pushing the reply wider
  table: function TableComponent({ children }) {
    return (
      <div className="my-4 w-full overflow-x-auto">
        <table className="my-0 w-full">{children}</table>
      </div>
    )
  },
}

const MemoizedMarkdownBlock = memo(
  function MarkdownBlock({
    content,
    components = INITIAL_COMPONENTS,
  }: {
    content: string
    components?: Partial<Components>
  }) {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    )
  },
  function propsAreEqual(prevProps, nextProps) {
    return prevProps.content === nextProps.content
  }
)

MemoizedMarkdownBlock.displayName = "MemoizedMarkdownBlock"

function MarkdownComponent({
  children,
  id,
  className,
  components,
}: MarkdownProps) {
  const generatedId = useId()
  const blockId = id ?? generatedId
  const blocks = useMemo(() => parseMarkdownIntoBlocks(children), [children])
  // Custom components add to the defaults rather than replacing them, so a caller that styles
  // headings or lists keeps the highlighted code blocks
  const merged = useMemo(() => ({ ...INITIAL_COMPONENTS, ...components }), [components])

  // A long link, identifier, or word breaks where it must, so nothing runs past a narrow screen
  return (
    <div className={cn("[overflow-wrap:anywhere]", className)}>
      {blocks.map((block, index) => (
        <MemoizedMarkdownBlock
          key={`${blockId}-block-${index}`}
          content={block}
          components={merged}
        />
      ))}
    </div>
  )
}

const Markdown = memo(MarkdownComponent)
Markdown.displayName = "Markdown"

export { Markdown }
