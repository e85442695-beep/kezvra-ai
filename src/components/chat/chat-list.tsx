"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, Copy, Download, Folder, FolderPlus, MoreHorizontal, Pencil, Pin, PinOff, Search, Share2, Trash2, ArchiveRestore } from "lucide-react";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuSub, MenuSubContent, MenuSubTrigger, MenuTrigger } from "@/components/ui/menu";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { api } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { ShareDialog } from "./share-dialog";

export interface ChatItem {
  id: string;
  title: string;
  modelId: string;
  pinned: boolean;
  archived: boolean;
  folderId: string | null;
  group: "pinned" | "today" | "yesterday" | "week" | "month" | "older";
  shareEnabled: boolean;
}
export interface FolderItem {
  id: string;
  name: string;
}

export function ChatList({ chats, folders, activeId, loading, archived, onArchivedChange, reload }: {
  chats: ChatItem[];
  folders: FolderItem[];
  activeId?: string;
  loading: boolean;
  archived: boolean;
  onArchivedChange: (v: boolean) => void;
  reload: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<ChatItem | null>(null);
  const [sharing, setSharing] = useState<ChatItem | null>(null);
  const [newFolder, setNewFolder] = useState(false);
  const [name, setName] = useState("");

  const patch = async (id: string, data: Record<string, unknown>) => {
    await api(`/api/chats/${id}`, { method: "PATCH", body: data });
    reload();
  };

  const filtered = chats.filter((c) => (!folder || c.folderId === folder) && (!q || c.title.toLowerCase().includes(q.toLowerCase())));
  const order = ["pinned", "today", "yesterday", "week", "month", "older"] as const;
  const labels: Record<(typeof order)[number], string> = { pinned: t.chat.pinned, today: t.chat.today, yesterday: t.chat.yesterday, week: t.chat.week, month: t.chat.month, older: t.chat.older };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <label htmlFor="chat-q" className="sr-only">{t.chat.searchChats}</label>
          <Input id="chat-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.chat.searchChats} className="h-9 pl-8" />
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button onClick={() => setFolder(null)} aria-pressed={!folder} className={cn("rounded-md px-2 py-1 text-xs", !folder ? "bg-elevated text-text" : "text-muted hover:text-text")}>{t.models.all}</button>
          {folders.map((f) => (
            <button key={f.id} onClick={() => setFolder(f.id)} aria-pressed={folder === f.id} className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs", folder === f.id ? "bg-elevated text-text" : "text-muted hover:text-text")}>
              <Folder className="size-3" aria-hidden /> {f.name}
            </button>
          ))}
          <button onClick={() => setNewFolder(true)} className="rounded-md p-1 text-muted hover:text-text" aria-label={t.chat.newFolder}><FolderPlus className="size-3.5" /></button>
          <button onClick={() => onArchivedChange(!archived)} aria-pressed={archived} className={cn("ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs", archived ? "bg-elevated text-text" : "text-muted hover:text-text")}>
            <Archive className="size-3" aria-hidden /> {t.chat.archived}
          </button>
        </div>
      </div>

      <nav aria-label={t.nav.chat} className="flex-1 overflow-y-auto px-2 pb-4">
        {loading && <div className="space-y-2 px-1">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-8" />)}</div>}
        {!loading && filtered.length === 0 && <p className="px-3 py-8 text-center text-xs text-muted">{t.common.empty}</p>}
        {order.map((g) => {
          const items = filtered.filter((c) => c.group === g);
          if (!items.length) return null;
          return (
            <section key={g} className="mb-3">
              <h3 className="px-3 pb-1 pt-2 text-xs text-faint">{labels[g]}</h3>
              <ul>
                {items.map((c) => (
                  <li key={c.id} className="group relative">
                    <Link
                      href={`/chat/${c.id}`}
                      aria-current={c.id === activeId ? "page" : undefined}
                      className={cn("block truncate rounded-lg py-2 pl-3 pr-9 text-sm", c.id === activeId ? "bg-elevated text-text" : "text-muted hover:bg-elevated/60 hover:text-text")}
                    >
                      {c.title}
                    </Link>
                    <Menu>
                      <MenuTrigger asChild>
                        <button className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted opacity-0 hover:bg-surface hover:text-text focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100" aria-label={`${c.title}: menu`}>
                          <MoreHorizontal className="size-4" />
                        </button>
                      </MenuTrigger>
                      <MenuContent>
                        <MenuItem onSelect={() => { setName(c.title); setRenaming(c); }}><Pencil /> {t.chat.rename}</MenuItem>
                        <MenuItem onSelect={() => patch(c.id, { pinned: !c.pinned })}>{c.pinned ? <PinOff /> : <Pin />} {c.pinned ? t.chat.unpin : t.chat.pin}</MenuItem>
                        <MenuSub>
                          <MenuSubTrigger><Folder className="size-4 text-muted" /> {t.chat.moveTo}</MenuSubTrigger>
                          <MenuSubContent>
                            <MenuItem onSelect={() => patch(c.id, { folderId: null })}>{t.chat.noFolder}</MenuItem>
                            {folders.map((f) => <MenuItem key={f.id} onSelect={() => patch(c.id, { folderId: f.id })}>{f.name}</MenuItem>)}
                          </MenuSubContent>
                        </MenuSub>
                        <MenuItem onSelect={() => setSharing(c)}><Share2 /> {t.chat.share}</MenuItem>
                        <MenuItem
                          onSelect={async () => {
                            const r = await api<{ chat: { id: string } }>(`/api/chats/${c.id}/clone`, { method: "POST" });
                            reload();
                            router.push(`/chat/${r.chat.id}`);
                          }}
                        >
                          <Copy /> {t.chat.clone}
                        </MenuItem>
                        <MenuItem onSelect={() => (window.location.href = `/api/chats/${c.id}/export?format=md`)}><Download /> {t.chat.exportMd}</MenuItem>
                        <MenuItem onSelect={() => (window.location.href = `/api/chats/${c.id}/export?format=json`)}><Download /> {t.chat.exportJson}</MenuItem>
                        <MenuItem onSelect={() => patch(c.id, { archived: !c.archived })}>{c.archived ? <ArchiveRestore /> : <Archive />} {c.archived ? t.chat.unarchive : t.chat.archive}</MenuItem>
                        <MenuSeparator />
                        <MenuItem
                          danger
                          onSelect={async () => {
                            if (!confirm(t.chat.deleteConfirm)) return;
                            await api(`/api/chats/${c.id}`, { method: "DELETE" });
                            reload();
                            if (c.id === activeId) router.push("/chat");
                          }}
                        >
                          <Trash2 /> {t.common.delete}
                        </MenuItem>
                      </MenuContent>
                    </Menu>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </nav>

      <Dialog open={Boolean(renaming)} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent title={t.chat.rename}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (renaming && name.trim()) await patch(renaming.id, { title: name.trim() });
              setRenaming(null);
            }}
            className="space-y-4"
          >
            <label htmlFor="rn" className="sr-only">{t.chat.rename}</label>
            <Input id="rn" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoFocus />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setRenaming(null)}>{t.common.cancel}</Button>
              <Button type="submit">{t.common.save}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={newFolder} onOpenChange={setNewFolder}>
        <DialogContent title={t.chat.newFolder}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const n = (e.currentTarget.elements.namedItem("fname") as HTMLInputElement).value.trim();
              if (!n) return;
              try {
                await api("/api/folders", { method: "POST", body: { name: n } });
                reload();
                setNewFolder(false);
              } catch {
                toast.error(t.common.error);
              }
            }}
            className="space-y-4"
          >
            <label htmlFor="fname" className="sr-only">{t.chat.newFolder}</label>
            <Input id="fname" name="fname" maxLength={80} autoFocus />
            <div className="flex justify-end"><Button type="submit">{t.common.save}</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      {sharing && <ShareDialog chatId={sharing.id} enabled={sharing.shareEnabled} onClose={() => { setSharing(null); reload(); }} />}
    </div>
  );
}
