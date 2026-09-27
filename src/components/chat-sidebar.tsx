"use client";

import { Loader2, MoreHorizontal, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TitleEditor } from "@/components/title-editor";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { type ConversationSummary, type SearchResult, searchConversations } from "@/lib/api";
import { LOGO_SRC, PRODUCT_NAME } from "@/lib/product";

const PERIODS = ["Today", "Yesterday", "Previous 7 Days", "Older"] as const;

function periodOf(updatedAt: string): (typeof PERIODS)[number] {
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const days = Math.ceil((startOfToday - new Date(updatedAt).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return days <= 7 ? "Previous 7 Days" : "Older";
}

type ChatSidebarProps = {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
};

export function ChatSidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onRename,
  onDelete,
}: ChatSidebarProps) {
  const { isMobile, setOpenMobile } = useSidebar();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ConversationSummary | null>(null);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [searchFailed, setSearchFailed] = useState(false);

  // Under two characters nothing is searched and the full list shows, as the server also does
  const searched = query.trim();
  const isSearching = searched.length >= 2;
  // A result for an older query is not shown, so the list never disagrees with the box
  const current = result?.query === searched ? result : null;

  // Waits for a pause in typing, and runs again when the list changes, so a rename or a delete shows
  useEffect(() => {
    if (!isSearching) return;
    let ignore = false;
    const timer = setTimeout(() => {
      searchConversations(searched).then(
        (next) => {
          if (!ignore) {
            setResult(next);
            setSearchFailed(false);
          }
        },
        () => {
          if (!ignore) setSearchFailed(true);
        },
      );
    }, 250);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [searched, isSearching, conversations]);

  const groups = PERIODS.map((period) => ({
    period,
    items: conversations.filter((conversation) => periodOf(conversation.updated_at) === period),
  })).filter((group) => group.items.length > 0);

  // On a phone the sidebar is a drawer over the chat, so it closes once a choice is made
  function choose(action: () => void) {
    action();
    if (isMobile) setOpenMobile(false);
  }

  const item = (conversation: ConversationSummary) => (
    <ConversationItem
      key={conversation.id}
      conversation={conversation}
      isActive={conversation.id === activeId}
      isEditing={editingId === conversation.id}
      onSelect={() => choose(() => onSelect(conversation.id))}
      onStartEdit={() => setEditingId(conversation.id)}
      onRename={(title) => {
        setEditingId(null);
        onRename(conversation.id, title);
      }}
      onCancelEdit={() => setEditingId(null)}
      onAskDelete={() => setPendingDelete(conversation)}
    />
  );

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-4">
        <Link
          href="/"
          className="flex items-center gap-2 text-base font-semibold tracking-tight"
          onClick={(event) => {
            event.preventDefault();
            choose(onNewChat);
          }}
        >
          {/* Decorative: the name beside it already says which app this is */}
          <Avatar className="size-7" aria-hidden="true">
            <AvatarImage src={LOGO_SRC} alt="" />
            <AvatarFallback className="text-xs">{PRODUCT_NAME[0]}</AvatarFallback>
          </Avatar>
          {PRODUCT_NAME}
        </Link>
      </SidebarHeader>
      <SidebarContent className="pt-2">
        <div className="flex flex-col gap-2 px-4 pb-2">
          <Button variant="outline" className="flex w-full items-center gap-2" onClick={() => choose(onNewChat)}>
            <Plus className="size-4" />
            <span>New Chat</span>
          </Button>
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <SidebarInput
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.key === "Escape" && setQuery("")}
              placeholder="Search chats"
              aria-label="Search Chats"
              className="h-9 pr-8 pl-8 [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Clear Search"
                className="absolute top-1/2 right-1.5 -translate-y-1/2"
                onClick={() => setQuery("")}
              >
                <X />
              </Button>
            )}
          </div>
        </div>

        {isSearching ? (
          searchFailed ? (
            <p className="text-destructive px-4 text-sm">Search failed. Is the {PRODUCT_NAME} server running?</p>
          ) : !current ? (
            <p role="status" className="text-muted-foreground flex items-center gap-2 px-4 text-sm">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Searching...
            </p>
          ) : current.items.length === 0 ? (
            <p className="text-muted-foreground px-4 text-sm">No chats match &quot;{searched}&quot;.</p>
          ) : (
            <SidebarGroup>
              <SidebarGroupLabel>{current.match === "fuzzy" ? "Close Matches" : "Results"}</SidebarGroupLabel>
              {/* A close match may not contain the words typed, so the list says why it is here */}
              {current.match === "fuzzy" && (
                <p className="text-muted-foreground px-2 pb-1 text-xs">
                  No title starts with &quot;{searched}&quot;. These chats have the same or similar words in
                  their title or messages.
                </p>
              )}
              <SidebarMenu>{current.items.map(item)}</SidebarMenu>
            </SidebarGroup>
          )
        ) : (
          <>
            {groups.length === 0 && <p className="text-muted-foreground px-4 text-sm">No conversations yet.</p>}
            {groups.map((group) => (
              <SidebarGroup key={group.period}>
                <SidebarGroupLabel>{group.period}</SidebarGroupLabel>
                <SidebarMenu>{group.items.map(item)}</SidebarMenu>
              </SidebarGroup>
            ))}
          </>
        )}
      </SidebarContent>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{pendingDelete?.title}&quot; and all of its messages will be removed from this machine. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => pendingDelete && onDelete(pendingDelete.id)}>
              Delete Conversation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sidebar>
  );
}

type ConversationItemProps = {
  conversation: ConversationSummary;
  isActive: boolean;
  isEditing: boolean;
  onSelect: () => void;
  onStartEdit: () => void;
  onRename: (title: string) => void;
  onCancelEdit: () => void;
  onAskDelete: () => void;
};

/** One conversation row, shared by the dated groups and the search results. */
function ConversationItem({
  conversation,
  isActive,
  isEditing,
  onSelect,
  onStartEdit,
  onRename,
  onCancelEdit,
  onAskDelete,
}: ConversationItemProps) {
  return (
    <SidebarMenuItem>
      {isEditing ? (
        <TitleEditor title={conversation.title} onSave={onRename} onCancel={onCancelEdit} />
      ) : (
        <>
          <SidebarMenuButton isActive={isActive} onClick={onSelect} onDoubleClick={onStartEdit}>
            {/* Keyed by the title, so a new name fades in as the sign it was saved */}
            <span key={conversation.title} className="animate-in fade-in-0 truncate duration-500">
              {conversation.title}
            </span>
          </SidebarMenuButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuAction showOnHover aria-label={`Options for ${conversation.title}`}>
                <MoreHorizontal />
              </SidebarMenuAction>
            </DropdownMenuTrigger>
            {/* Focus goes to the rename field, not back to this trigger, once the menu closes */}
            <DropdownMenuContent side="right" align="start" onCloseAutoFocus={(event) => event.preventDefault()}>
              <DropdownMenuItem onSelect={onStartEdit}>
                <Pencil />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={onAskDelete}>
                <Trash2 />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </SidebarMenuItem>
  );
}
