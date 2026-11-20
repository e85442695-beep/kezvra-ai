import { Suspense } from "react";
import type { Metadata } from "next";
import { ChatWorkspace } from "@/components/chat/chat-workspace";
import { requirePageUser } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Chat", robots: { index: false } };

export default async function ChatPage({ params }: { params: Promise<{ id?: string[] }> }) {
  const [user, s, { id }] = await Promise.all([requirePageUser(), getSettings(), params]);
  const chatId = id?.[0];
  return (
    <Suspense>
      <ChatWorkspace key={chatId ?? "new"} chatId={chatId} defaultModelId={user.defaultModelId ?? s.defaultModelId} favorites={user.favoriteModelIds} />
    </Suspense>
  );
}
