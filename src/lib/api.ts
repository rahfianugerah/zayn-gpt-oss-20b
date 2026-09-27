import { PRODUCT_NAME } from "@/lib/product";

export const API_URL = process.env.NEXT_PUBLIC_COPILOT_URL ?? "http://127.0.0.1:8000";

export type ChatMessage = {
  id: number | string;
  role: "user" | "assistant";
  content: string;
  reasoning: string | null;
};

export type ConversationSummary = { id: string; title: string; updated_at: string };

type ReplyEvent = { reasoning?: string; content?: string; error?: { message: string } };

async function errorMessage(response: Response): Promise<string> {
  try {
    return (await response.json()).error.message;
  } catch {
    return `The server answered with status ${response.status}`;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}/${path}`, init);
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.status === 204 ? (undefined as T) : response.json();
}

export const getModel = () => request<{ model: string }>("health").then((health) => health.model);

// ponytail: the sidebar shows the latest 100 conversations; page through the rest if that ever fills
export const listConversations = () =>
  request<{ items: ConversationSummary[] }>("api/v1/conversations?limit=100").then((page) => page.items);

export type SearchResult = { query: string; items: ConversationSummary[]; match: "exact" | "prefix" | "fuzzy" | null };

// The server runs the search ladder; match says which stage answered, and "fuzzy" means close matches
export const searchConversations = (query: string) =>
  request<{ items: ConversationSummary[]; match: SearchResult["match"] }>(
    `api/v1/conversations?limit=100&q=${encodeURIComponent(query)}`,
  ).then((page): SearchResult => ({ query, ...page }));

export const createConversation = () =>
  request<ConversationSummary>("api/v1/conversations", { method: "POST" });

export const getConversation = (id: string) =>
  request<{ title: string; messages: ChatMessage[] }>(`api/v1/conversations/${id}`);

export const renameConversation = (id: string, title: string) =>
  request<ConversationSummary>(`api/v1/conversations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });

export const deleteConversation = (id: string) =>
  request<void>(`api/v1/conversations/${id}`, { method: "DELETE" });

/** Yield the reply's NDJSON events as they arrive: reasoning, answer text, or an error. */
export async function* streamReply(
  conversationId: string,
  content: string,
  signal: AbortSignal,
): AsyncGenerator<ReplyEvent> {
  const response = await fetch(`${API_URL}/api/v1/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
    signal,
  });
  if (!response.ok || !response.body) throw new Error(await errorMessage(response));

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line) yield JSON.parse(line);
  }
}

/** Turn a failed request into a sentence for the error banner. */
export function describeError(error: unknown): string {
  if (error instanceof TypeError) return `Cannot reach the ${PRODUCT_NAME} server at ${API_URL}. Is it running?`;
  return error instanceof Error ? error.message : String(error);
}
