"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Dialog as D } from "radix-ui";
import { useTheme } from "next-themes";
import { FileText, LayoutGrid, MessageSquare, Moon, Plus, Search, Sun, BookMarked } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";

interface Results {
  chats: { id: string; title: string }[];
  messages: { id: string; chatId: string; title: string; snippet: string }[];
  models: { id: string; name: string }[];
  prompts: { id: string; title: string }[];
}

/** Global Ctrl+K menu: navigation, actions and full-text search across chats, models, prompts. */
export function CommandMenu({ open, onOpenChange, isAdmin }: { open: boolean; onOpenChange: (o: boolean) => void; isAdmin: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Results | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setRes(null);
      return;
    }
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: Results | null) => d && setRes(d))
        .catch(() => {});
    }, 180);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [q]);

  const go = (href: string) => {
    onOpenChange(false);
    setQ("");
    router.push(href);
  };

  const item = "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm aria-selected:bg-surface [&_svg]:size-4 [&_svg]:text-muted";
  const nav: [string, string][] = [
    ["/chat", t.nav.chat], ["/compare", t.nav.compare], ["/images", t.nav.images], ["/files", t.nav.files], ["/models", t.nav.models],
    ["/assistants", t.nav.assistants], ["/prompts", t.nav.prompts], ["/billing", t.nav.billing], ["/referrals", t.nav.referrals],
    ["/developers", t.nav.developers], ["/settings", t.nav.settings], ["/support", t.nav.support], ["/help", t.nav.help],
    ...(isAdmin ? ([["/admin", t.nav.admin]] as [string, string][]) : []),
  ];

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <D.Content className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-elevated shadow-2xl">
          <D.Title className="sr-only">{t.nav.command}</D.Title>
          <D.Description className="sr-only">{t.common.search}</D.Description>
          <Command shouldFilter={!res} loop label={t.nav.command}>
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="size-4 text-muted" aria-hidden />
              <Command.Input value={q} onValueChange={setQ} placeholder={`${t.common.search}…`} className="h-12 flex-1 bg-transparent text-sm outline-none" />
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-6 text-center text-sm text-muted">{t.common.empty}</Command.Empty>
              {res && (
                <>
                  {res.chats.length > 0 && (
                    <Command.Group heading={t.nav.chat} className="text-xs text-muted [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5">
                      {res.chats.map((c) => <Command.Item key={c.id} value={`chat-${c.id}`} onSelect={() => go(`/chat/${c.id}`)} className={item}><MessageSquare /> {c.title}</Command.Item>)}
                    </Command.Group>
                  )}
                  {res.messages.length > 0 && (
                    <Command.Group heading="Messages" className="text-xs text-muted [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5">
                      {res.messages.map((m) => (
                        <Command.Item key={m.id} value={`msg-${m.id}`} onSelect={() => go(`/chat/${m.chatId}`)} className={item}>
                          <FileText />
                          <span className="min-w-0">
                            <span className="block truncate text-text">{m.title}</span>
                            <span className="block truncate text-xs" dangerouslySetInnerHTML={{ __html: sanitizeSnippet(m.snippet) }} />
                          </span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  )}
                  {res.models.length > 0 && (
                    <Command.Group heading={t.nav.models} className="text-xs text-muted [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5">
                      {res.models.map((m) => <Command.Item key={m.id} value={`model-${m.id}`} onSelect={() => go(`/chat?new=1&model=${encodeURIComponent(m.id)}`)} className={item}><LayoutGrid /> {m.name}</Command.Item>)}
                    </Command.Group>
                  )}
                  {res.prompts.length > 0 && (
                    <Command.Group heading={t.nav.prompts} className="text-xs text-muted [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5">
                      {res.prompts.map((p) => <Command.Item key={p.id} value={`prompt-${p.id}`} onSelect={() => go(`/prompts?id=${p.id}`)} className={item}><BookMarked /> {p.title}</Command.Item>)}
                    </Command.Group>
                  )}
                </>
              )}
              {!res && (
                <>
                  <Command.Group heading="Actions" className="text-xs text-muted [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5">
                    <Command.Item onSelect={() => go("/chat?new=1")} className={item}><Plus /> {t.chat.newChat} <kbd className="ml-auto text-[10px]">Ctrl ⇧ O</kbd></Command.Item>
                    <Command.Item
                      onSelect={() => {
                        setTheme(resolvedTheme === "dark" ? "light" : "dark");
                        onOpenChange(false);
                      }}
                      className={item}
                    >
                      {resolvedTheme === "dark" ? <Sun /> : <Moon />} {t.settings.theme}
                    </Command.Item>
                  </Command.Group>
                  <Command.Group heading="Navigation" className="text-xs text-muted [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5">
                    {nav.map(([href, label]) => <Command.Item key={href} onSelect={() => go(href)} className={item}>{label}</Command.Item>)}
                  </Command.Group>
                </>
              )}
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** ts_headline returns <b>…</b>; escape everything, then restore only <b> tags. */
function sanitizeSnippet(s: string) {
  const esc = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc.replace(/&lt;b&gt;/g, "<b>").replace(/&lt;\/b&gt;/g, "</b>");
}
