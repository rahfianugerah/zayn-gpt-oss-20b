import { Suspense } from "react";
import { ChatApp } from "@/components/chat-app";

// The chat reads the URL on the client, which a static export only allows inside Suspense
export default function Page() {
  return (
    <Suspense>
      <ChatApp />
    </Suspense>
  );
}
