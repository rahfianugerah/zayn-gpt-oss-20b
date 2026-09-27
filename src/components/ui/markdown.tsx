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
  const match = className.match(/language-(\w+)/)
  return match ? match[1] : "plaintext"
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

    return (
      <CodeBlock className="my-4">
        <CodeBlockGroup className="border-border border-b py-2 pr-2 pl-4">
          <div className="bg-primary/10 text-primary rounded px-2 py-1 text-xs font-medium">
            {language}
          </div>
          <CopyButton text={text} label="Copy Code" size="icon" className="h-8 w-8" />
        </CodeBlockGroup>
        <CodeBlockCode code={text} language={language} />
      </CodeBlock>
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
  components = INITIAL_COMPONENTS,
}: MarkdownProps) {
  const generatedId = useId()
  const blockId = id ?? generatedId
  const blocks = useMemo(() => parseMarkdownIntoBlocks(children), [children])

  return (
    <div className={className}>
      {blocks.map((block, index) => (
        <MemoizedMarkdownBlock
          key={`${blockId}-block-${index}`}
          content={block}
          components={components}
        />
      ))}
    </div>
  )
}

const Markdown = memo(MarkdownComponent)
Markdown.displayName = "Markdown"

export { Markdown }
