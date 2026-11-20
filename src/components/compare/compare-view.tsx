"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Loader2, Plus, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Card, PageHeader } from "@/components/ui/misc";
import { Markdown } from "@/components/chat/markdown";
import { ModelPicker } from "@/components/chat/model-picker";
import { api, ApiError, readSSE } from "@/lib/api-client";
import { refreshBalance } from "@/hooks/use-balance";
import { useI18n } from "@/lib/i18n/client";
import { credits } from "@/lib/utils";

interface Slot {
  modelId: string;
  text: string;
  status: "idle" | "running" | "done" | "error";
  error?: string;
  chargedMicro?: string;
  latencyMs?: number;
  firstTokenMs?: number | null;
  tokens?: string;
}

export function CompareView({ defaults }: { defaults: string[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [slots, setSlots] = useState<Slot[]>(defaults.slice(0, 2).map((modelId) => ({ modelId, text: "", status: "idle" })));
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const patch = (i: number, p: Partial<Slot>) => setSlots((s) => s.map((x, j) => (j === i ? { ...x, ...p, text: p.text !== undefined ? p.text : x.text } : x)));

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setSlots((s) => s.map((x) => ({ modelId: x.modelId, text: "", status: "running" })));
    setRunning(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const res = await fetch("/api/compare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt, models: slots.map((s) => s.modelId) }), signal: ctrl.signal });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new ApiError(res.status, d.error ?? "ERROR");
      }
      await readSSE(res, (ev, raw) => {
        const d = raw as Record<string, unknown> & { i: number };
        if (ev === "delta") setSlots((s) => s.map((x, j) => (j === d.i ? { ...x, text: x.text + (d.t as string) } : x)));
        else if (ev === "done") patch(d.i, { status: "done", chargedMicro: String(d.chargedMicro), latencyMs: d.latencyMs as number, firstTokenMs: d.firstTokenMs as number | null, tokens: `${d.promptTokens}+${d.completionTokens}` });
        else if (ev === "error") patch(d.i, { status: "error", error: d.error as string });
      });
    } catch (err) {
      if (!ctrl.signal.aborted) toast.error(t.errors[err instanceof ApiError ? err.code : ""] ?? t.common.error);
      setSlots((s) => s.map((x) => (x.status === "running" ? { ...x, status: ctrl.signal.aborted ? "done" : "error" } : x)));
    } finally {
      setRunning(false);
      refreshBalance();
    }
  }

  async function continueChat(s: Slot) {
    try {
      const r = await api<{ chatId: string }>("/api/compare", { method: "PUT", body: { modelId: s.modelId, prompt, answer: s.text } });
      router.push(`/chat/${r.chatId}`);
    } catch (e) {
      toast.error(t.errors[e instanceof ApiError ? e.code : ""] ?? t.common.error);
    }
  }

  const fastest = slots.filter((s) => s.status === "done" && s.latencyMs).sort((a, b) => a.latencyMs! - b.latencyMs!)[0]?.modelId;

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6">
      <PageHeader title={t.compare.title} description={t.compare.sub} />
      <form onSubmit={run} className="mb-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {slots.map((s, i) => (
            <div key={i} className="flex items-center gap-1">
              <ModelPicker value={s.modelId} onChange={(id) => patch(i, { modelId: id })} />
              {slots.length > 2 && <Button variant="ghost" size="icon-sm" aria-label={t.common.delete} onClick={() => setSlots((x) => x.filter((_, j) => j !== i))} disabled={running}><X /></Button>}
            </div>
          ))}
          {slots.length < 4 && (
            <Button variant="outline" size="sm" disabled={running} onClick={() => setSlots((x) => [...x, { modelId: defaults[x.length] ?? defaults[0]!, text: "", status: "idle" }])}>
              <Plus /> {t.compare.addModel}
            </Button>
          )}
        </div>
        <label htmlFor="cmp-p" className="sr-only">{t.compare.prompt}</label>
        <Textarea id="cmp-p" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t.compare.prompt} />
        <div className="flex justify-end gap-2">
          {running ? (
            <Button variant="secondary" onClick={() => abort.current?.abort()}><Square /> {t.chat.stop}</Button>
          ) : (
            <Button type="submit" disabled={!prompt.trim() || new Set(slots.map((s) => s.modelId)).size !== slots.length}>{t.compare.run}</Button>
          )}
        </div>
      </form>

      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 320px), 1fr))` }}>
        {slots.map((s, i) => (
          <Card key={i} className="flex min-h-64 flex-col">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5 text-sm">
              <span className="truncate font-medium">{s.modelId}</span>
              {s.status === "running" && <Loader2 className="size-4 animate-spin text-faint" aria-label={t.common.loading} />}
            </div>
            <div className="flex-1 p-4" aria-live="polite">
              {s.status === "error" ? <p role="alert" className="text-sm text-danger">{t.errors[s.error ?? ""] ?? s.error}</p> : s.text ? <Markdown content={s.text} /> : <p className="text-sm text-faint">—</p>}
            </div>
            {s.status === "done" && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-border px-4 py-2.5">
                <span className="font-mono text-xs text-faint">
                  {t.compare.firstToken} {s.firstTokenMs != null ? `${(s.firstTokenMs / 1000).toFixed(2)}s` : "—"} · {t.compare.total} {((s.latencyMs ?? 0) / 1000).toFixed(2)}s · {s.tokens} tok ·{" "}
                  <span className={fastest === s.modelId ? "text-primary" : ""}>{credits(s.chargedMicro, 4)} cr</span>
                </span>
                {s.text && <Button size="sm" variant="ghost" onClick={() => continueChat(s)}>{t.compare.continue} <ArrowRight /></Button>}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
