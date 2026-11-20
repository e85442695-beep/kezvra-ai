"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Bot, Check, Copy, FileText, Loader2, Paperclip, PanelLeft, Pencil, RefreshCw, SlidersHorizontal, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Tip } from "@/components/ui/menu";
import { ChatList, type ChatItem, type FolderItem } from "./chat-list";
import { Markdown } from "./markdown";
import { ModelPicker, useModels } from "./model-picker";
import { api, ApiError, readSSE } from "@/lib/api-client";
import { refreshBalance } from "@/hooks/use-balance";
import { useI18n } from "@/lib/i18n/client";
import { ACCEPT_ATTR } from "@/lib/files/types";
import { cn, credits } from "@/lib/utils";

interface Attachment { fileId: string; name: string; mime: string }
interface Msg {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  modelId?: string | null;
  status: "PENDING" | "STREAMING" | "COMPLETE" | "STOPPED" | "ERROR";
  error?: string | null;
  attachments?: Attachment[] | null;
  aiRequest?: { chargedMicro: string; promptTokens: number; completionTokens: number } | null;
}
interface ChatMeta { id: string; title: string; modelId: string; systemPrompt: string | null; temperature: string | null; maxTokens: number | null }

export function ChatWorkspace({ chatId, defaultModelId, favorites: initialFavs }: { chatId?: string; defaultModelId: string; favorites: string[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [archived, setArchived] = useState(false);
  const [showList, setShowList] = useState(false);

  const [chat, setChat] = useState<ChatMeta | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(Boolean(chatId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modelId, setModelId] = useState(sp.get("model") ?? defaultModelId);
  const [favorites, setFavorites] = useState(initialFavs);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<(Attachment & { status: "uploading" | "processing" | "ready" | "error" })[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [params, setParams] = useState<{ open: boolean; systemPrompt: string; temperature: string; maxTokens: string }>({ open: false, systemPrompt: "", temperature: "", maxTokens: "" });
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const models = useModels();
  const model = models?.find((m) => m.id === modelId);

  const loadList = useCallback(async () => {
    try {
      const d = await api<{ chats: ChatItem[]; folders: FolderItem[] }>(`/api/chats${archived ? "?archived=1" : ""}`);
      setChats(d.chats);
      setFolders(d.folders);
    } finally {
      setListLoading(false);
    }
  }, [archived]);
  useEffect(() => void loadList(), [loadList]);

  useEffect(() => {
    if (!chatId) {
      setChat(null);
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    api<{ chat: ChatMeta; messages: Msg[] }>(`/api/chats/${chatId}`)
      .then((d) => {
        setChat(d.chat);
        setMessages(d.messages);
        setModelId(d.chat.modelId);
        setParams((p) => ({ ...p, systemPrompt: d.chat.systemPrompt ?? "", temperature: d.chat.temperature ?? "", maxTokens: d.chat.maxTokens ? String(d.chat.maxTokens) : "" }));
      })
      .catch((e) => setLoadError(e instanceof ApiError ? e.code : "ERROR"))
      .finally(() => setLoading(false));
  }, [chatId]);

  // Files handed over from /files ("Use in chat")
  useEffect(() => {
    if (!chatId) return;
    const key = `kz-attach-${chatId}`;
    const raw = sessionStorage.getItem(key);
    if (!raw) return;
    sessionStorage.removeItem(key);
    const ids = JSON.parse(raw) as string[];
    Promise.all(ids.map((id) => api<{ file: { id: string; name: string; mime: string; status: string } }>(`/api/files/${id}`).catch(() => null))).then((rows) =>
      setAttachments(rows.filter((r): r is NonNullable<typeof r> => Boolean(r && r.file.status === "READY")).map((r) => ({ fileId: r.file.id, name: r.file.name, mime: r.file.mime, status: "ready" as const }))),
    );
  }, [chatId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: streaming ? "auto" : "smooth" });
  }, [messages, streaming]);

  // "/" focuses the composer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes(el.tagName) && !el.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const errMsg = (code: string) => t.errors[code] ?? t.common.error;

  const toggleFavorite = async (id: string) => {
    const next = favorites.includes(id) ? favorites.filter((f) => f !== id) : [...favorites, id];
    setFavorites(next);
    api("/api/account/profile", { method: "PATCH", body: { favoriteModelIds: next } }).catch(() => {});
  };

  const changeModel = (id: string) => {
    setModelId(id);
    if (chat) api(`/api/chats/${chat.id}`, { method: "PATCH", body: { modelId: id } }).catch((e) => toast.error(errMsg(e.code)));
  };

  async function uploadFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files).slice(0, 10)) {
      const tmp = `tmp-${crypto.randomUUID()}`;
      setAttachments((a) => [...a, { fileId: tmp, name: file.name, mime: file.type, status: "uploading" }]);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const r = await api<{ file: { id: string; mime: string } }>("/api/files", { method: "POST", body: fd });
        setAttachments((a) => a.map((x) => (x.fileId === tmp ? { ...x, fileId: r.file.id, mime: r.file.mime, status: "processing" } : x)));
        // poll until processed
        for (let i = 0; i < 80; i++) {
          await new Promise((res) => setTimeout(res, 1500));
          const s = await api<{ file: { status: string } }>(`/api/files/${r.file.id}`);
          if (s.file.status === "READY" || s.file.status === "FAILED") {
            setAttachments((a) => a.map((x) => (x.fileId === r.file.id ? { ...x, status: s.file.status === "READY" ? "ready" : "error" } : x)));
            break;
          }
        }
      } catch (e) {
        toast.error(errMsg(e instanceof ApiError ? e.code : "ERROR"));
        setAttachments((a) => a.filter((x) => x.fileId !== tmp));
      }
    }
  }

  async function send(opts: { regenerateId?: string; editId?: string; content?: string } = {}) {
    const content = opts.content ?? input;
    const ready = attachments.filter((a) => a.status === "ready");
    if (!opts.regenerateId && !content.trim() && ready.length === 0) return;
    if (attachments.some((a) => a.status === "uploading" || a.status === "processing")) {
      toast.message(t.errors.FILE_NOT_READY);
      return;
    }
    let id = chat?.id;
    try {
      if (!id) {
        const r = await api<{ chat: ChatMeta }>("/api/chats", {
          method: "POST",
          body: { modelId, systemPrompt: params.systemPrompt || undefined, temperature: params.temperature ? Number(params.temperature) : undefined, maxTokens: params.maxTokens ? Number(params.maxTokens) : undefined },
        });
        id = r.chat.id;
        setChat(r.chat);
        window.history.replaceState(null, "", `/chat/${id}`);
      }
    } catch (e) {
      toast.error(errMsg(e instanceof ApiError ? e.code : "ERROR"));
      return;
    }

    const optimisticUser: Msg | null = opts.regenerateId ? null : { id: `tmp-u-${Date.now()}`, role: "user", content, status: "COMPLETE", attachments: ready.map(({ fileId, name, mime }) => ({ fileId, name, mime })) };
    const asstTmp = `tmp-a-${Date.now()}`;
    setMessages((prev) => {
      let base = prev;
      if (opts.regenerateId) base = prev.slice(0, prev.findIndex((m) => m.id === opts.regenerateId));
      if (opts.editId) base = prev.slice(0, prev.findIndex((m) => m.id === opts.editId));
      return [...base, ...(optimisticUser ? [optimisticUser] : []), { id: asstTmp, role: "assistant", content: "", modelId, status: "STREAMING" }];
    });
    setInput("");
    setAttachments([]);
    setEditing(null);
    setStreaming(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch(`/api/chats/${id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content, attachments: ready.map((a) => a.fileId), regenerateId: opts.regenerateId, editId: opts.editId, modelId, clientRequestId: crypto.randomUUID() }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new ApiError(res.status, d.error ?? "ERROR");
      }
      let asstId = asstTmp;
      await readSSE(res, (event, data) => {
        const d = data as Record<string, unknown>;
        if (event === "start") {
          asstId = d.assistantMessageId as string;
          const uid = d.userMessageId as string;
          setMessages((p) => p.map((m) => (m.id === asstTmp ? { ...m, id: asstId } : optimisticUser && m.id === optimisticUser.id ? { ...m, id: uid } : m)));
          if (d.title) setChats((c) => c);
        } else if (event === "delta") {
          setMessages((p) => p.map((m) => (m.id === asstId ? { ...m, content: m.content + (d.t as string) } : m)));
        } else if (event === "done") {
          setMessages((p) => p.map((m) => (m.id === asstId ? { ...m, status: d.stopped ? "STOPPED" : "COMPLETE", aiRequest: { chargedMicro: String(d.chargedMicro), promptTokens: d.promptTokens as number, completionTokens: d.completionTokens as number } } : m)));
        } else if (event === "error") {
          setMessages((p) => p.map((m) => (m.id === asstId ? { ...m, status: "ERROR", error: d.error as string } : m)));
          toast.error(errMsg(d.error as string));
        }
      });
    } catch (e) {
      if (ctrl.signal.aborted) {
        setMessages((p) => p.map((m) => (m.status === "STREAMING" ? { ...m, status: "STOPPED" } : m)));
      } else {
        const code = e instanceof ApiError ? e.code : "ERROR";
        setMessages((p) => p.map((m) => (m.status === "STREAMING" ? { ...m, status: "ERROR", error: code } : m)));
        toast.error(errMsg(code));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      refreshBalance();
      loadList();
      // re-sync ids/statuses after stop (server persists the final state)
      if (ctrl.signal.aborted && id) setTimeout(() => api<{ messages: Msg[] }>(`/api/chats/${id}`).then((d) => setMessages(d.messages)).catch(() => {}), 1200);
    }
  }

  const stop = () => abortRef.current?.abort();
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");

  const saveParams = async () => {
    const data = { systemPrompt: params.systemPrompt || null, temperature: params.temperature ? Number(params.temperature) : null, maxTokens: params.maxTokens ? Number(params.maxTokens) : null };
    if (chat) {
      try {
        await api(`/api/chats/${chat.id}`, { method: "PATCH", body: data });
      } catch (e) {
        toast.error(errMsg(e instanceof ApiError ? e.code : "ERROR"));
        return;
      }
    }
    setParams((p) => ({ ...p, open: false }));
  };

  return (
    <div className="flex h-full">
      {/* chat list: column on xl, drawer below */}
      <div className={cn("w-72 shrink-0 border-r border-border bg-bg", showList ? "fixed inset-y-0 left-0 z-40 block shadow-2xl xl:static xl:shadow-none" : "hidden xl:block")}>
        <ChatList chats={chats} folders={folders} activeId={chat?.id} loading={listLoading} archived={archived} onArchivedChange={setArchived} reload={loadList} />
      </div>
      {showList && <div className="fixed inset-0 z-30 bg-black/50 xl:hidden" onClick={() => setShowList(false)} aria-hidden />}

      <section className="flex min-w-0 flex-1 flex-col" aria-label={chat?.title ?? t.chat.newChat}>
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Button variant="ghost" size="icon-sm" className="xl:hidden" onClick={() => setShowList((s) => !s)} aria-label={t.nav.chat} aria-expanded={showList}><PanelLeft /></Button>
          <ModelPicker value={modelId} onChange={changeModel} favorites={favorites} onToggleFavorite={toggleFavorite} />
          <Tip label={t.chat.params}>
            <Button variant="ghost" size="icon-sm" onClick={() => setParams((p) => ({ ...p, open: true }))} aria-label={t.chat.params}><SlidersHorizontal /></Button>
          </Tip>
          <h1 className="ml-2 hidden truncate text-sm text-muted md:block">{chat?.title}</h1>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-6">
            {loading && <div className="flex justify-center py-20"><Loader2 className="size-6 animate-spin text-muted" aria-label={t.common.loading} /></div>}
            {loadError && <p role="alert" className="py-20 text-center text-sm text-danger">{errMsg(loadError)}</p>}
            {!loading && !loadError && messages.length === 0 && (
              <div className="py-24 text-center">
                <div className="mx-auto grid size-12 place-items-center rounded-xl border border-border"><Bot className="size-5 text-faint" strokeWidth={1.5} aria-hidden /></div>
                <h2 className="mt-4 text-xl font-medium">{t.chat.emptyTitle}</h2>
                <p className="mt-1 text-sm text-muted">{t.chat.emptySub}</p>
              </div>
            )}
            <ol className="space-y-6" aria-live="polite" aria-busy={streaming}>
              <AnimatePresence initial={false}>
                {messages.map((m) => (
                  <motion.li key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
                    {m.role === "user" ? (
                      <div className="group flex flex-col items-end gap-1">
                        {editing === m.id ? (
                          <EditBox initial={m.content} onCancel={() => setEditing(null)} onSave={(c) => send({ editId: m.id, content: c })} />
                        ) : (
                          <>
                            <div className="max-w-[85%] whitespace-pre-wrap rounded-xl bg-elevated px-4 py-2.5 text-sm">{m.content}</div>
                            {m.attachments && m.attachments.length > 0 && (
                              <div className="flex flex-wrap justify-end gap-1">{m.attachments.map((a) => <span key={a.fileId} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs text-muted"><FileText className="size-3" aria-hidden /> {a.name}</span>)}</div>
                            )}
                            {!streaming && !m.id.startsWith("tmp") && (
                              <div className="flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                                <CopyBtn text={m.content} />
                                <Tip label={t.chat.edit}><Button variant="ghost" size="icon-sm" onClick={() => setEditing(m.id)} aria-label={t.chat.edit}><Pencil /></Button></Tip>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="group flex gap-3">
                        <div className="grid size-7 shrink-0 place-items-center rounded-full border border-border"><Bot className="size-4 text-faint" strokeWidth={1.5} aria-hidden /></div>
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 text-xs text-muted">{models?.find((x) => x.id === m.modelId)?.name ?? m.modelId}</div>
                          {m.content ? <Markdown content={m.content} /> : m.status === "STREAMING" ? <span className="inline-block h-4 w-2 animate-pulse rounded-sm bg-text" aria-label={t.common.loading} /> : null}
                          {m.status === "ERROR" && <p role="alert" className="mt-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{errMsg(m.error ?? "ERROR")}</p>}
                          {m.status === "STOPPED" && <p className="mt-2 text-xs text-muted">{t.chat.stopped}</p>}
                          {m.status !== "STREAMING" && (
                            <div className="mt-2 flex items-center gap-1 text-xs text-muted">
                              {m.content && <CopyBtn text={m.content} />}
                              {lastAssistant?.id === m.id && !streaming && !m.id.startsWith("tmp") && (
                                <Tip label={t.chat.regenerate}><Button variant="ghost" size="icon-sm" onClick={() => send({ regenerateId: m.id })} aria-label={t.chat.regenerate}><RefreshCw /></Button></Tip>
                              )}
                              {m.aiRequest && (
                                <span className="ml-2 font-mono tabular-nums text-faint">
                                  {t.chat.cost}: {credits(m.aiRequest.chargedMicro, 4)} {t.common.creditsShort} · {m.aiRequest.promptTokens}+{m.aiRequest.completionTokens} {t.chat.tokens}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>
            <div ref={bottomRef} />
          </div>
        </div>

        {/* composer */}
        <div className="border-t border-border bg-bg px-3 pb-3 pt-2">
          <form
            className="mx-auto max-w-3xl rounded-2xl border border-border bg-surface p-2 transition-colors focus-within:border-[color-mix(in_oklab,var(--text)_24%,transparent)]"
            onSubmit={(e) => {
              e.preventDefault();
              if (!streaming) send();
            }}
          >
            {attachments.length > 0 && (
              <ul className="mb-2 flex flex-wrap gap-2 px-1">
                {attachments.map((a) => (
                  <li key={a.fileId} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2 py-1 text-xs">
                    {a.status === "uploading" || a.status === "processing" ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <FileText className="size-3" aria-hidden />}
                    <span className={cn("max-w-40 truncate", a.status === "error" && "text-danger")}>{a.name}</span>
                    <button type="button" onClick={() => setAttachments((x) => x.filter((y) => y.fileId !== a.fileId))} aria-label={`${t.common.delete} ${a.name}`} className="text-muted hover:text-text"><X className="size-3" /></button>
                  </li>
                ))}
              </ul>
            )}
            <label htmlFor="composer" className="sr-only">{t.chat.placeholder}</label>
            <textarea
              id="composer"
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.currentTarget.style.height = "auto";
                e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 240)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  if (!streaming) send();
                }
              }}
              placeholder={t.chat.placeholder}
              className="block max-h-60 w-full resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted"
            />
            <div className="mt-1 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <input ref={fileRef} type="file" multiple accept={ACCEPT_ATTR} className="sr-only" tabIndex={-1} onChange={(e) => { uploadFiles(e.target.files); e.target.value = ""; }} aria-hidden />
                <Tip label={t.chat.attach}>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => fileRef.current?.click()} aria-label={t.chat.attach}><Paperclip /></Button>
                </Tip>
                {model && !model.inputModalities.includes("image") && attachments.some((a) => a.mime.startsWith("image/")) && <span className="text-xs text-warning">{t.errors.MODEL_NO_VISION}</span>}
              </div>
              {streaming ? (
                <Button type="button" size="icon-sm" variant="secondary" onClick={stop} aria-label={t.chat.stop}><Square /></Button>
              ) : (
                <Button type="submit" size="icon-sm" disabled={!input.trim() && !attachments.some((a) => a.status === "ready")} aria-label={t.chat.send}><ArrowUp /></Button>
              )}
            </div>
          </form>
          <p className="mx-auto mt-1.5 max-w-3xl text-center text-[11px] text-muted">Enter — {t.chat.send} · Shift+Enter — ↵ · / — focus · Ctrl+K — {t.nav.command}</p>
        </div>
      </section>

      <Dialog open={params.open} onOpenChange={(o) => setParams((p) => ({ ...p, open: o }))}>
        <DialogContent title={t.chat.params}>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="sp" className="text-sm font-medium">{t.chat.systemPrompt}</label>
              <Textarea id="sp" rows={5} maxLength={20000} value={params.systemPrompt} onChange={(e) => setParams((p) => ({ ...p, systemPrompt: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="temp" className="text-sm font-medium">{t.chat.temperature}</label>
                <Input id="temp" type="number" min={0} max={2} step={0.1} disabled={model ? !model.supportedParams.includes("temperature") : false} value={params.temperature} onChange={(e) => setParams((p) => ({ ...p, temperature: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="mt" className="text-sm font-medium">{t.chat.maxTokens}</label>
                <Input id="mt" type="number" min={16} max={200000} disabled={model ? !model.supportedParams.includes("max_tokens") : false} value={params.maxTokens} onChange={(e) => setParams((p) => ({ ...p, maxTokens: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setParams((p) => ({ ...p, open: false }))}>{t.common.cancel}</Button>
              <Button onClick={saveParams}>{t.common.save}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

  function EditBox({ initial, onSave, onCancel }: { initial: string; onSave: (c: string) => void; onCancel: () => void }) {
    const [v, setV] = useState(initial);
    return (
      <div className="w-full max-w-[85%] space-y-2">
        <label htmlFor="edit-msg" className="sr-only">{t.chat.edit}</label>
        <Textarea id="edit-msg" autoFocus value={v} onChange={(e) => setV(e.target.value)} rows={3} />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={onCancel}>{t.common.cancel}</Button>
          <Button size="sm" onClick={() => v.trim() && onSave(v)}>{t.chat.send}</Button>
        </div>
      </div>
    );
  }
}

function CopyBtn({ text }: { text: string }) {
  const { t } = useI18n();
  const [ok, setOk] = useState(false);
  return (
    <Tip label={t.common.copy}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t.common.copy}
        onClick={() => {
          navigator.clipboard.writeText(text);
          setOk(true);
          setTimeout(() => setOk(false), 1200);
        }}
      >
        {ok ? <Check /> : <Copy />}
      </Button>
    </Tip>
  );
}
