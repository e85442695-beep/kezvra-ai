import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Markdown } from "@/components/chat/markdown";
import { Logo } from "@/components/layout/logo";
import { buttonVariants } from "@/components/ui/button";
import { getDict } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Shared chat", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Read-only public view. Access requires an enabled, unexpired, unguessable token; the system prompt is never shown. */
export default async function SharedChat({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) notFound();
  const chat = await db.chat.findUnique({ where: { shareToken: token }, select: { title: true, modelId: true, shareEnabled: true, shareExpires: true, createdAt: true, id: true } });
  if (!chat || !chat.shareEnabled || (chat.shareExpires && chat.shareExpires < new Date())) notFound();
  const messages = await db.chatMessage.findMany({ where: { chatId: chat.id, superseded: false, role: { in: ["user", "assistant"] }, status: { in: ["COMPLETE", "STOPPED"] } }, orderBy: { createdAt: "asc" }, select: { id: true, role: true, content: true, modelId: true } });
  const { t } = await getDict();
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Logo />
          <Link href="/register" className={buttonVariants({ size: "sm" })}>{t.landing.ctaStart}</Link>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-medium">{chat.title}</h1>
        <p className="mt-1 font-mono text-xs text-faint">{chat.modelId}</p>
        <ol className="mt-8 space-y-6">
          {messages.map((m) => (
            <li key={m.id}>
              {m.role === "user" ? (
                <div className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-xl bg-elevated px-4 py-2.5 text-sm">{m.content}</div>
              ) : (
                <div>
                  <div className="mb-1 font-mono text-xs text-faint">{m.modelId}</div>
                  <Markdown content={m.content} />
                </div>
              )}
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
