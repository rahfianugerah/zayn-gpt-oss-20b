"use client";

import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
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
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import type { ConversationSummary } from "@/lib/api";
import { PRODUCT_NAME } from "@/lib/product";

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
  onDelete: (id: string) => void;
};

export function ChatSidebar({ conversations, activeId, onSelect, onNewChat, onDelete }: ChatSidebarProps) {
  const { isMobile, setOpenMobile } = useSidebar();
  const [pendingDelete, setPendingDelete] = useState<ConversationSummary | null>(null);
  const groups = PERIODS.map((period) => ({
    period,
    items: conversations.filter((conversation) => periodOf(conversation.updated_at) === period),
  })).filter((group) => group.items.length > 0);

  // On a phone the sidebar is a drawer over the chat, so it closes once a choice is made
  function choose(action: () => void) {
    action();
    if (isMobile) setOpenMobile(false);
  }

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-4">
        <Link
          href="/"
          className="text-base font-semibold tracking-tight"
          onClick={(event) => {
            event.preventDefault();
            choose(onNewChat);
          }}
        >
          {PRODUCT_NAME}
        </Link>
      </SidebarHeader>
      <SidebarContent className="pt-2">
        <div className="px-4">
          <Button variant="outline" className="mb-4 flex w-full items-center gap-2" onClick={() => choose(onNewChat)}>
            <Plus className="size-4" />
            <span>New Chat</span>
          </Button>
        </div>
        {groups.length === 0 && <p className="text-muted-foreground px-4 text-sm">No conversations yet.</p>}
        {groups.map((group) => (
          <SidebarGroup key={group.period}>
            <SidebarGroupLabel>{group.period}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((conversation) => (
                <SidebarMenuItem key={conversation.id}>
                  <SidebarMenuButton
                    isActive={conversation.id === activeId}
                    onClick={() => choose(() => onSelect(conversation.id))}
                  >
                    <span>{conversation.title}</span>
                  </SidebarMenuButton>
                  <SidebarMenuAction
                    showOnHover
                    aria-label={`Delete ${conversation.title}`}
                    onClick={() => setPendingDelete(conversation)}
                  >
                    <Trash2 />
                  </SidebarMenuAction>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
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
