"use client";

import { ArrowUp, Loader2, Pencil, Slash, Square, User } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChatSidebar } from "@/components/chat-sidebar";
import { CopyButton } from "@/components/copy-button";
import { TitleEditor } from "@/components/title-editor";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ChatContainerContent, ChatContainerRoot } from "@/components/ui/chat-container";
import { Message, MessageAction, MessageActions, MessageContent } from "@/components/ui/message";
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/ui/prompt-input";
import { PromptSuggestion } from "@/components/ui/prompt-suggestion";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ui/reasoning";
import { ScrollButton } from "@/components/ui/scroll-button";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { SystemMessage } from "@/components/ui/system-message";
import {
  type ChatMessage,
  type ConversationSummary,
  createConversation,
  deleteConversation,
  renameConversation,
  describeError,
  getConversation,
  getModel,
  listConversations,
  streamReply,
} from "@/lib/api";
import { COMMANDS, PRODUCT_NAME, SUGGESTIONS, splitCommand } from "@/lib/product";
import { cn } from "@/lib/utils";

type Chat = { id: string | null; title: string; messages: ChatMessage[] };

const NEW_CHAT: Chat = { id: null, title: "New Chat", messages: [] };
const PROMPT_ID = "prompt-input";

export function ChatApp() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [chat, setChat] = useState<Chat>(NEW_CHAT);
  // A conversation named in the URL starts out loading, so a reload never flashes the empty state
  const [openingId, setOpeningId] = useState<string | null>(() => params.get("c"));
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [menuForced, setMenuForced] = useState(false);
  const [dismissedAt, setDismissedAt] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const latestOpenRef = useRef<string | null>(null);

  // The slash menu opens while the box holds only a command being typed, or from the / button
  const query = /^\/(\w*)$/.exec(prompt)?.[1];
  const matches =
    prompt === dismissedAt
      ? []
      : menuForced
        ? COMMANDS
        : query === undefined
          ? []
          : COMMANDS.filter((command) => command.name.startsWith(query.toLowerCase()));
  const activeIndex = Math.min(highlight, matches.length - 1);
  const question = splitCommand(prompt)[1];

  // The URL holds the open conversation, so a reload comes back to it
  function writeUrl(id: string | null) {
    router.replace(id ? `${pathname}?c=${id}` : pathname, { scroll: false });
  }

  async function refreshConversations() {
    try {
      const items = await listConversations();
      setConversations(items);
    } catch (err) {
      setError(describeError(err));
    }
  }

  function openConversation(id: string) {
    controllerRef.current?.abort();
    latestOpenRef.current = id;
    setOpeningId(id);
    setError(null);
    void loadConversation(id);
  }

  async function loadConversation(id: string) {
    try {
      const { title, messages } = await getConversation(id);
      if (latestOpenRef.current === id) setChat({ id, title, messages });
    } catch (err) {
      if (latestOpenRef.current !== id) return;
      setError(describeError(err));
      setChat(NEW_CHAT);
      writeUrl(null);
    } finally {
      if (latestOpenRef.current === id) setOpeningId(null);
    }
  }

  function selectConversation(id: string) {
    writeUrl(id);
    openConversation(id);
  }

  function newChat() {
    controllerRef.current?.abort();
    latestOpenRef.current = null;
    setOpeningId(null);
    setChat(NEW_CHAT);
    setError(null);
    writeUrl(null);
  }

  async function renameChat(id: string, title: string) {
    // Shown at once in the sidebar and the header, and put back if the server refuses it
    const before = conversations.find((conversation) => conversation.id === id)?.title ?? chat.title;
    const show = (next: string) => {
      setConversations((list) => list.map((c) => (c.id === id ? { ...c, title: next } : c)));
      setChat((current) => (current.id === id ? { ...current, title: next } : current));
    };
    show(title);
    try {
      await renameConversation(id, title);
    } catch (err) {
      show(before);
      setError(describeError(err));
    }
  }

  async function removeConversation(id: string) {
    try {
      await deleteConversation(id);
      if (chat.id === id) newChat();
      await refreshConversations();
    } catch (err) {
      setError(describeError(err));
    }
  }

  useEffect(() => {
    const showError = (err: unknown) => setError(describeError(err));
    getModel().then(setModel, showError);
    listConversations().then(setConversations, showError);
    if (openingId) {
      latestOpenRef.current = openingId;
      void loadConversation(openingId);
    }
    // Runs once, for the URL the page was opened with; later changes come from this component
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changePrompt(value: string) {
    setPrompt(value);
    setHighlight(0);
    if (!value.startsWith("/")) setMenuForced(false);
  }

  function applySuggestion(prompt: string) {
    changePrompt(prompt);
    // After the box has the new text, put the cursor at its end, ready for the code to be pasted
    requestAnimationFrame(() => {
      const box = document.getElementById(PROMPT_ID) as HTMLTextAreaElement | null;
      box?.focus();
      box?.setSelectionRange(prompt.length, prompt.length);
    });
  }

  function pickCommand(name: string) {
    // Typing /fi and picking replaces the partial command; picking from the / button keeps the text
    const rest = query === undefined ? splitCommand(prompt)[1] : "";
    setPrompt(`/${name} ${rest}`);
    setMenuForced(false);
    setHighlight(0);
    document.getElementById(PROMPT_ID)?.focus();
  }

  function onPromptKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (matches.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlight((activeIndex + step + matches.length) % matches.length);
    } else if (event.key === "Tab") {
      event.preventDefault();
      pickCommand(matches[activeIndex].name);
    } else if (event.key === "Escape") {
      setDismissedAt(prompt);
      setMenuForced(false);
    }
  }

  function updateReply(id: string, change: (reply: ChatMessage) => ChatMessage) {
    setChat((current) => ({
      ...current,
      messages: current.messages.map((message) => (message.id === id ? change(message) : message)),
    }));
  }

  async function send() {
    // Enter inside the open menu picks the highlighted command instead of sending
    if (matches.length > 0) return pickCommand(matches[activeIndex].name);
    if (!question.trim() || isLoading) return;

    const content = prompt;
    const controller = new AbortController();
    controllerRef.current = controller;
    // Only unique within the list is needed; saved messages carry numeric ids from the server
    const questionId = `local-${chat.messages.length}`;
    const replyId = `local-${chat.messages.length + 1}`;
    let answered = false;

    setPrompt("");
    setError(null);
    setIsLoading(true);
    setChat((current) => ({
      ...current,
      messages: [
        ...current.messages,
        { id: questionId, role: "user", content, reasoning: null },
        { id: replyId, role: "assistant", content: "", reasoning: null },
      ],
    }));

    try {
      let id = chat.id;
      if (!id) {
        const created = (await createConversation()).id;
        id = created;
        setChat((current) => ({ ...current, id: created }));
        writeUrl(created);
      }
      for await (const event of streamReply(id, content, controller.signal)) {
        if (event.error) throw new Error(event.error.message);
        if (event.content) answered = true;
        updateReply(replyId, (reply) => ({
          ...reply,
          content: reply.content + (event.content ?? ""),
          reasoning: event.reasoning ? (reply.reasoning ?? "") + event.reasoning : reply.reasoning,
        }));
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(describeError(err));
        if (!answered) {
          // The server saved nothing, so the question goes back into the box to try again
          setChat((current) => ({
            ...current,
            messages: current.messages.filter((message) => message.id !== questionId),
          }));
          setPrompt(content);
        }
      }
    } finally {
      // A reply stopped before any text arrived leaves no empty bubble behind
      setChat((current) => ({
        ...current,
        messages: current.messages.filter((message) => message.id !== replyId || message.content),
      }));
      setIsLoading(false);
      controllerRef.current = null;
      void refreshConversations();
    }
  }

  const lastIndex = chat.messages.length - 1;

  return (
    <SidebarProvider>
      <ChatSidebar
        conversations={conversations}
        activeId={chat.id}
        onSelect={selectConversation}
        onNewChat={newChat}
        onRename={renameChat}
        onDelete={removeConversation}
      />
      <SidebarInset>
        <div className="flex h-dvh flex-col overflow-hidden">
          <header className="bg-background z-10 flex h-16 w-full shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <h1 className="min-w-0 flex-1 text-base font-semibold">
              {isEditingTitle && chat.id ? (
                <TitleEditor
                  title={chat.title}
                  className="max-w-md text-base font-semibold"
                  onSave={(title) => {
                    setIsEditingTitle(false);
                    if (chat.id) void renameChat(chat.id, title);
                  }}
                  onCancel={() => setIsEditingTitle(false)}
                />
              ) : chat.id ? (
                <button
                  type="button"
                  title="Rename conversation"
                  onClick={() => setIsEditingTitle(true)}
                  className="group hover:bg-muted flex max-w-full items-center gap-2 rounded-md px-2 py-1"
                >
                  <span key={chat.title} className="animate-in fade-in-0 truncate duration-500">
                    {chat.title}
                  </span>
                  <Pencil className="text-muted-foreground size-3.5 shrink-0 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />
                </button>
              ) : (
                <span className="truncate px-2">{chat.title}</span>
              )}
            </h1>
          </header>

          {/* Only the chat container scrolls. This box clips, so it can never become a second
              scroller that the wheel falls through to at the end of the conversation. */}
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <ChatContainerRoot className="h-full">
              <ChatContainerContent className="space-y-0 px-5 py-12">
                {openingId ? (
                  <p role="status" className="text-muted-foreground flex items-center justify-center gap-2 text-sm">
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Loading conversation...
                  </p>
                ) : chat.messages.length === 0 ? (
                  <div className="mx-auto flex max-w-3xl flex-col items-center gap-2 pt-[18vh] text-center">
                    <h2 className="text-2xl font-bold">How can I help you today?</h2>
                    <p className="text-muted-foreground text-sm">
                      {model ? `Running ${model} on Ollama Cloud. ` : ""}Type / for commands.
                    </p>
                    <div className="mt-6 flex max-w-2xl flex-wrap justify-center gap-2">
                      {SUGGESTIONS.map((suggestion) => (
                        <PromptSuggestion key={suggestion.label} onClick={() => applySuggestion(suggestion.prompt)}>
                          {suggestion.label}
                        </PromptSuggestion>
                      ))}
                    </div>
                  </div>
                ) : (
                  chat.messages.map((message, index) => (
                    <ChatBubble
                      key={message.id}
                      message={message}
                      isLast={index === lastIndex}
                      isStreaming={isLoading && index === lastIndex}
                    />
                  ))
                )}
              </ChatContainerContent>
              {/* The strip lets clicks through to the messages under it; only the pill catches them */}
              <div className="pointer-events-none absolute bottom-4 left-1/2 flex w-full max-w-3xl -translate-x-1/2 justify-center px-5">
                <ScrollButton className="shadow-sm" />
              </div>
            </ChatContainerRoot>
          </div>

          <div className="bg-background z-10 shrink-0 px-3 pb-3 md:px-5 md:pb-5">
            <div className="relative mx-auto max-w-3xl">
              {error && (
                <SystemMessage
                  variant="error"
                  fill
                  className="mb-3"
                  cta={{ label: "Dismiss", onClick: () => setError(null) }}
                >
                  {error}
                </SystemMessage>
              )}

              {matches.length > 0 && (
                <ul
                  id="command-menu"
                  role="listbox"
                  aria-label="Commands"
                  className="bg-popover absolute bottom-full left-0 z-20 mb-2 w-full max-w-sm rounded-xl border p-1 shadow-md"
                >
                  {matches.map((command, index) => (
                    <li
                      key={command.name}
                      id={`command-${command.name}`}
                      role="option"
                      aria-selected={index === activeIndex}
                      className={cn(
                        "flex cursor-pointer flex-col rounded-lg px-3 py-2",
                        index === activeIndex && "bg-accent",
                      )}
                      onMouseEnter={() => setHighlight(index)}
                      // Picking with the mouse keeps the focus in the box
                      onMouseDown={(event) => {
                        event.preventDefault();
                        pickCommand(command.name);
                      }}
                    >
                      <span className="font-mono text-sm font-medium">/{command.name}</span>
                      <span className="text-muted-foreground text-xs">{command.description}</span>
                    </li>
                  ))}
                </ul>
              )}

              <PromptInput
                isLoading={isLoading}
                value={prompt}
                onValueChange={changePrompt}
                onSubmit={send}
                className="border-input bg-popover relative z-10 w-full rounded-3xl border p-0 pt-1 shadow-xs"
              >
                <div className="flex flex-col">
                  <PromptInputTextarea
                    id={PROMPT_ID}
                    aria-label="Message"
                    aria-expanded={matches.length > 0}
                    aria-controls="command-menu"
                    aria-activedescendant={matches.length > 0 ? `command-${matches[activeIndex].name}` : undefined}
                    placeholder={`Ask ${PRODUCT_NAME}, or type / for commands`}
                    onKeyDown={onPromptKeyDown}
                    className="min-h-11 pt-3 pl-4 text-base leading-[1.3] sm:text-base md:text-base"
                  />
                  <PromptInputActions className="mt-5 flex w-full items-center justify-between gap-2 px-3 pb-3">
                    <PromptInputAction tooltip="Commands">
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label="Commands"
                        className="size-9 rounded-full"
                        onClick={() => {
                          setMenuForced(true);
                          setDismissedAt(null);
                          document.getElementById(PROMPT_ID)?.focus();
                        }}
                      >
                        <Slash size={18} />
                      </Button>
                    </PromptInputAction>
                    <PromptInputAction tooltip={isLoading ? "Stop generation" : "Send message"}>
                      <Button
                        size="icon"
                        aria-label={isLoading ? "Stop generation" : "Send message"}
                        disabled={!isLoading && !question.trim()}
                        onClick={isLoading ? () => controllerRef.current?.abort() : send}
                        className="size-9 rounded-full"
                      >
                        {isLoading ? <Square className="size-4 fill-current" /> : <ArrowUp size={18} />}
                      </Button>
                    </PromptInputAction>
                  </PromptInputActions>
                </div>
              </PromptInput>
              <p className="text-muted-foreground mt-2 text-center text-xs">
                {PRODUCT_NAME} can make mistakes. Check code before running it.
              </p>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function ChatBubble({
  message,
  isLast,
  isStreaming,
}: {
  message: ChatMessage;
  isLast: boolean;
  isStreaming: boolean;
}) {
  const isAssistant = message.role === "assistant";
  const [command, text] = splitCommand(message.content);

  return (
    <Message
      className={cn(
        // relative keeps the screen reader labels inside the scrolling list, not measured against
        // the box around it, where they stretched it to the full conversation height
        "relative mx-auto flex w-full max-w-3xl flex-col gap-2 px-0 py-3 md:px-6",
        isAssistant ? "items-start" : "items-end",
      )}
    >
      <div className={cn("flex w-full gap-3", isAssistant ? "flex-row" : "flex-row-reverse")}>
        <Avatar className="mt-0.5 size-7" aria-hidden="true">
          <AvatarFallback
            className={cn("text-xs font-semibold", isAssistant && "bg-primary text-primary-foreground")}
          >
            {isAssistant ? PRODUCT_NAME[0] : <User className="size-4" />}
          </AvatarFallback>
        </Avatar>

        {isAssistant ? (
          <div className="group flex min-w-0 flex-1 flex-col gap-1">
            <span className="sr-only">{PRODUCT_NAME} said:</span>
            {message.reasoning && (
              <Reasoning isStreaming={isStreaming && !message.content}>
                <ReasoningTrigger className="text-muted-foreground text-sm">Show Reasoning</ReasoningTrigger>
                {/* The rule sits on the inner block, so nothing shows once the outer one collapses */}
                <ReasoningContent markdown contentClassName="border-l-border ml-2 border-l-2 px-2 pb-1">
                  {message.reasoning}
                </ReasoningContent>
              </Reasoning>
            )}
            {isStreaming && !message.content && !message.reasoning ? (
              <p role="status" className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Thinking...
              </p>
            ) : (
              message.content && (
                <MessageContent markdown className="text-foreground prose flex-1 rounded-lg bg-transparent p-0">
                  {message.content}
                </MessageContent>
              )
            )}
            {!isStreaming && message.content && (
              <MessageActions
                className={cn(
                  "-ml-2.5 flex gap-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100",
                  isLast && "opacity-100",
                )}
              >
                <MessageAction tooltip="Copy" delayDuration={100}>
                  <CopyButton text={message.content} label="Copy Reply" className="rounded-full" />
                </MessageAction>
              </MessageActions>
            )}
          </div>
        ) : (
          <div className="group flex max-w-[85%] flex-col items-end gap-1 sm:max-w-[75%]">
            <span className="sr-only">You said:</span>
            <MessageContent className="bg-muted text-primary rounded-3xl px-5 py-2.5 whitespace-pre-wrap">
              {command && (
                <span className="bg-background mr-2 rounded-md border px-1.5 py-0.5 font-mono text-xs">
                  /{command}
                </span>
              )}
              {text}
            </MessageContent>
            <MessageActions className="flex gap-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
              <MessageAction tooltip="Copy" delayDuration={100}>
                <CopyButton text={message.content} label="Copy Message" className="rounded-full" />
              </MessageAction>
            </MessageActions>
          </div>
        )}
      </div>
    </Message>
  );
}
