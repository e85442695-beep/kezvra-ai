"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Loader2, MessageSquare, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Badge, Card, EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui/misc";
import { Markdown } from "@/components/chat/markdown";
import { ModelPicker } from "@/components/chat/model-picker";
import { api, ApiError } from "@/lib/api-client";
import { useFetch } from "@/hooks/use-fetch";
import { refreshBalance } from "@/hooks/use-balance";
import { useI18n } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n";
import { ACCEPT_ATTR } from "@/lib/files/types";
import { bytes, cn, credits, formatDate } from "@/lib/utils";

interface F { id: string; name: string; mime: string; sizeBytes: number; status: "UPLOADED" | "PROCESSING" | "READY" | "FAILED"; error: string | null; textLength: number; pageCount: number | null; summary: string | null; createdAt: string }

export function FilesManager({ maxMb, defaultModelId, storageReady }: { maxMb: number; defaultModelId: string; storageReady: boolean }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const list = useFetch<{ files: F[] }>("/api/files");
  const [selected, setSelected] = useState<string[]>([]);
  const [uploading, setUploading] = useState(0);
  const [drag, setDrag] = useState(false);
  const [question, setQuestion] = useState("");
  const [modelId, setModelId] = useState(defaultModelId);
  const [result, setResult] = useState<{ text: string; charged: string } | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ name: string; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const processing = list.data?.files.some((f) => f.status === "PROCESSING" || f.status === "UPLOADED");
  useEffect(() => {
    if (!processing) return;
    const id = setInterval(list.reload, 2500);
    return () => clearInterval(id);
  }, [processing, list.reload]);

  const err = (e: unknown) => toast.error(t.errors[e instanceof ApiError ? e.code : ""] ?? t.common.error);

  async function upload(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      if (file.size > maxMb * 1024 * 1024) {
        toast.error(`${file.name}: ${t.errors.FILE_TOO_LARGE}`);
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const fd = new FormData();
        fd.append("file", file);
        await api("/api/files", { method: "POST", body: fd });
      } catch (e) {
        err(e);
      } finally {
        setUploading((n) => n - 1);
        list.reload();
      }
    }
  }

  async function analyze(action: "summary" | "ask" | "compare" | "extract") {
    setRunning(action);
    setResult(null);
    try {
      const r = await api<{ text: string; chargedMicro: string }>("/api/files/analyze", { method: "POST", body: { fileIds: selected, action, question: action === "ask" ? question : undefined, modelId } });
      setResult({ text: r.text, charged: r.chargedMicro });
      refreshBalance();
      if (action === "summary") list.reload();
    } catch (e) {
      err(e);
    } finally {
      setRunning(null);
    }
  }

  async function useInChat() {
    try {
      const r = await api<{ chat: { id: string } }>("/api/chats", { method: "POST", body: { modelId } });
      sessionStorage.setItem(`kz-attach-${r.chat.id}`, JSON.stringify(selected));
      router.push(`/chat/${r.chat.id}`);
    } catch (e) {
      err(e);
    }
  }

  const readyIds = new Set(list.data?.files.filter((f) => f.status === "READY").map((f) => f.id));
  const sel = selected.filter((id) => readyIds.has(id));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <PageHeader
        title={t.files.title}
        description={fmt(t.files.sub, { mb: maxMb })}
        actions={
          <>
            <input ref={inputRef} type="file" multiple accept={ACCEPT_ATTR} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { if (e.target.files) upload(e.target.files); e.target.value = ""; }} />
            <Button onClick={() => inputRef.current?.click()} disabled={!storageReady}>{uploading > 0 ? <Loader2 className="animate-spin" /> : <Upload />} {t.files.upload}</Button>
          </>
        }
      />
      {!storageReady && <div className="mb-6"><ErrorState title={t.errors.STORAGE_NOT_CONFIGURED ?? t.common.error} /></div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); if (storageReady) upload(e.dataTransfer.files); }}
          className={cn("rounded-xl transition-colors", drag && "outline-2 outline-dashed outline-ring")}
        >
          {list.loading && !list.data ? (
            <div className="space-y-2">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : !list.data?.files.length ? (
            <EmptyState icon={<FileText />} title={t.files.drop} description={fmt(t.files.sub, { mb: maxMb })} />
          ) : (
            <Card>
              <ul className="divide-y divide-border">
                {list.data.files.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label={f.name}
                      className="size-4 accent-[var(--text)]"
                      disabled={f.status !== "READY"}
                      checked={selected.includes(f.id)}
                      onChange={(e) => setSelected((s) => (e.target.checked ? [...s, f.id].slice(-5) : s.filter((x) => x !== f.id)))}
                    />
                    <FileText className="size-4 shrink-0 text-faint" strokeWidth={1.5} aria-hidden />
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() => f.status === "READY" && api<{ file: { preview: string } }>(`/api/files/${f.id}`).then((r) => setPreview({ name: f.name, text: r.file.preview }))}
                    >
                      <span className="block truncate text-sm">{f.name}</span>
                      <span className="block font-mono text-xs text-faint">
                        {bytes(f.sizeBytes)}{f.pageCount ? ` · ${f.pageCount} p.` : ""} · {formatDate(f.createdAt, locale, { dateStyle: "short" })}
                      </span>
                    </button>
                    {f.status === "READY" ? <Badge tone="success">{t.files.ready}</Badge> : f.status === "FAILED" ? <Badge tone="danger" title={f.error ?? ""}>{t.files.failed}</Badge> : <Badge><Loader2 className="size-3 animate-spin" aria-hidden /> {t.files.processing}</Badge>}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${t.common.delete} ${f.name}`}
                      onClick={async () => {
                        if (!confirm(t.files.deleteConfirm)) return;
                        await api(`/api/files/${f.id}`, { method: "DELETE" }).catch(err);
                        setSelected((s) => s.filter((x) => x !== f.id));
                        list.reload();
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <Card className="h-fit space-y-4 p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">{fmt(t.files.selected, { n: sel.length })}</span>
            <ModelPicker value={modelId} onChange={setModelId} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" disabled={sel.length !== 1 || Boolean(running)} onClick={() => analyze("summary")}>{running === "summary" && <Loader2 className="animate-spin" />} {t.files.summary}</Button>
            <Button variant="secondary" disabled={sel.length === 0 || Boolean(running)} onClick={() => analyze("extract")}>{running === "extract" && <Loader2 className="animate-spin" />} {t.files.extract}</Button>
            <Button variant="secondary" disabled={sel.length < 2 || Boolean(running)} onClick={() => analyze("compare")}>{running === "compare" && <Loader2 className="animate-spin" />} {t.files.compare}</Button>
            <Button variant="secondary" disabled={sel.length === 0} onClick={useInChat}><MessageSquare /> {t.files.useInChat}</Button>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); analyze("ask"); }} className="space-y-2">
            <label htmlFor="fq" className="sr-only">{t.files.question}</label>
            <Textarea id="fq" rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={t.files.question} />
            <Button type="submit" className="w-full" disabled={sel.length === 0 || !question.trim() || Boolean(running)}>{running === "ask" && <Loader2 className="animate-spin" />} {t.files.ask}</Button>
          </form>
          {result && (
            <div className="border-t border-border pt-4" aria-live="polite">
              <Markdown content={result.text} />
              <p className="mt-3 font-mono text-xs text-faint">{t.chat.cost}: {credits(result.charged, 4)} {t.common.creditsShort}</p>
            </div>
          )}
        </Card>
      </div>

      {preview && (
        <Card className="mt-6 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium">{t.files.preview}: {preview.name}</h2>
            <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>{t.common.close}</Button>
          </div>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap font-mono text-xs text-muted">{preview.text || "—"}</pre>
        </Card>
      )}
    </div>
  );
}
