"use client";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, ImageIcon, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/input";
import { Badge, Card, EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui/misc";
import { useModels, type PickerModel } from "@/components/chat/model-picker";
import { api, ApiError } from "@/lib/api-client";
import { useFetch } from "@/hooks/use-fetch";
import { refreshBalance } from "@/hooks/use-balance";
import { useI18n } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n";
import { credits, formatDate } from "@/lib/utils";

interface Gen {
  id: string;
  modelId: string;
  prompt: string;
  aspectRatio: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  error: string | null;
  imageCount: number;
  createdAt: string;
  aiRequest: { chargedMicro: string } | null;
}
interface FileRow { id: string; name: string; mime: string; status: string }

const isImageModel = (m: PickerModel) => m.outputModalities.includes("image");

export function ImageStudio({ reserveCredits, storageReady }: { reserveCredits: string; storageReady: boolean }) {
  const { t, locale } = useI18n();
  const models = useModels(isImageModel);
  const gallery = useFetch<{ items: Gen[] }>("/api/images");
  const files = useFetch<{ files: FileRow[] }>("/api/files");
  const [modelId, setModelId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [ratio, setRatio] = useState("1:1");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [urls, setUrls] = useState<Record<string, string[]>>({});

  const model = models?.find((m) => m.id === modelId) ?? models?.[0];
  useEffect(() => {
    if (!modelId && models?.[0]) setModelId(models[0].id);
  }, [models, modelId]);
  const ratios = model?.imageOptions?.aspectRatios?.length ? model.imageOptions.aspectRatios : ["1:1"];
  useEffect(() => {
    if (!ratios.includes(ratio)) setRatio(ratios[0]!);
  }, [ratios, ratio]);
  const img2img = Boolean(model?.inputModalities.includes("image") && (model.imageOptions?.maxInputImages ?? 0) > 0);
  const imageFiles = useMemo(() => files.data?.files.filter((f) => f.mime.startsWith("image/") && f.status === "READY") ?? [], [files.data]);

  // poll active jobs
  const active = gallery.data?.items.some((g) => g.status === "QUEUED" || g.status === "RUNNING");
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      gallery.reload();
      refreshBalance();
    }, 3000);
    return () => clearInterval(id);
  }, [active, gallery]);

  // fetch signed URLs for finished images
  useEffect(() => {
    for (const g of gallery.data?.items ?? []) {
      if (g.status === "SUCCEEDED" && !urls[g.id]) {
        api<{ generation: { urls: string[] } }>(`/api/images/${g.id}`).then((r) => setUrls((u) => ({ ...u, [g.id]: r.generation.urls }))).catch(() => {});
      }
    }
  }, [gallery.data, urls]);

  const err = (e: unknown) => toast.error(t.errors[e instanceof ApiError ? e.code : ""] ?? (e instanceof ApiError ? e.code : t.common.error));

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (!model) return;
    setBusy(true);
    try {
      await api("/api/images", { method: "POST", body: { modelId: model.id, prompt, aspectRatio: ratio, sourceFileId: img2img && source ? source : undefined } });
      setPrompt("");
      gallery.reload();
    } catch (e2) {
      err(e2);
    } finally {
      setBusy(false);
    }
  }

  const statusLabel = { QUEUED: t.images.queued, RUNNING: t.images.running, SUCCEEDED: t.images.succeeded, FAILED: t.images.failed } as const;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <PageHeader title={t.images.title} description={fmt(t.images.reserveNote, { amount: reserveCredits })} />
      {!storageReady && <ErrorState title={t.errors.STORAGE_NOT_CONFIGURED ?? t.common.error} />}

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card className="h-fit p-5">
          {models === null ? (
            <div className="space-y-3"><Skeleton className="h-10" /><Skeleton className="h-28" /><Skeleton className="h-10" /></div>
          ) : models.length === 0 ? (
            <p className="text-sm text-muted">{t.images.noModels}</p>
          ) : (
            <form onSubmit={generate} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="im-model" className="text-sm font-medium">{t.images.model}</label>
                <Select id="im-model" value={model?.id ?? ""} onChange={(e) => setModelId(e.target.value)}>
                  {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </Select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="im-prompt" className="text-sm font-medium">Prompt</label>
                <Textarea id="im-prompt" rows={5} maxLength={4000} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t.images.prompt} required minLength={3} />
              </div>
              <fieldset className="space-y-1.5">
                <legend className="text-sm font-medium">{t.images.ratio}</legend>
                <div className="flex flex-wrap gap-1.5">
                  {ratios.map((r: string) => (
                    <label key={r} className="cursor-pointer">
                      <input type="radio" name="ratio" value={r} checked={ratio === r} onChange={() => setRatio(r)} className="peer sr-only" />
                      <span className="block rounded-md border border-border px-2.5 py-1 font-mono text-xs text-muted peer-checked:bg-elevated peer-checked:text-text peer-focus-visible:outline-2 peer-focus-visible:outline-ring">{r}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="space-y-1.5">
                <label htmlFor="im-src" className="text-sm font-medium">{t.images.source}</label>
                <Select id="im-src" value={source} onChange={(e) => setSource(e.target.value)} disabled={!img2img}>
                  <option value="">{t.images.sourceNone}</option>
                  {imageFiles.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </Select>
                {!img2img && <p className="text-xs text-faint">{t.images.sourceUnsupported}</p>}
              </div>
              <Button type="submit" className="w-full" disabled={busy || !storageReady || prompt.trim().length < 3}>
                {busy && <Loader2 className="animate-spin" />} {t.images.generate}
              </Button>
            </form>
          )}
        </Card>

        <section aria-labelledby="gal-h">
          <h2 id="gal-h" className="mb-3 text-sm text-muted">{t.images.gallery}</h2>
          {gallery.loading && !gallery.data ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="aspect-square" />)}</div>
          ) : gallery.error ? (
            <ErrorState title={t.common.error} action={<Button variant="secondary" onClick={gallery.reload}>{t.common.retry}</Button>} />
          ) : !gallery.data?.items.length ? (
            <EmptyState icon={<ImageIcon />} title={t.common.empty} />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {gallery.data.items.map((g) => (
                <li key={g.id}>
                  <Card className="overflow-hidden">
                    <div className="relative grid aspect-square place-items-center bg-elevated">
                      {g.status === "SUCCEEDED" && urls[g.id]?.[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={urls[g.id]![0]} alt={g.prompt} className="size-full object-cover" />
                      ) : g.status === "FAILED" ? (
                        <p className="px-4 text-center text-xs text-danger">{t.errors[g.error ?? ""] ?? g.error}</p>
                      ) : (
                        <Loader2 className="size-5 animate-spin text-faint" aria-label={statusLabel[g.status]} />
                      )}
                    </div>
                    <div className="space-y-2 p-3">
                      <p className="line-clamp-2 text-sm">{g.prompt}</p>
                      <div className="flex items-center justify-between gap-2 font-mono text-xs text-faint">
                        <span className="truncate">{g.modelId} · {g.aspectRatio}</span>
                        <Badge tone={g.status === "SUCCEEDED" ? "success" : g.status === "FAILED" ? "danger" : "default"}>{statusLabel[g.status]}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs text-faint">
                          {g.aiRequest ? `${credits(g.aiRequest.chargedMicro, 4)} ${t.common.creditsShort}` : ""} · {formatDate(g.createdAt, locale, { dateStyle: "short", timeStyle: "short" })}
                        </span>
                        <div className="flex gap-1">
                          {g.status === "SUCCEEDED" && (
                            <Button size="icon-sm" variant="ghost" aria-label={t.common.download} onClick={async () => {
                              const r = await api<{ generation: { urls: string[] } }>(`/api/images/${g.id}?download=1`);
                              if (r.generation.urls[0]) window.location.href = r.generation.urls[0];
                            }}><Download /></Button>
                          )}
                          <Button size="icon-sm" variant="ghost" aria-label={t.images.again} onClick={() => api(`/api/images/${g.id}`, { method: "POST" }).then(gallery.reload).catch(err)}><RefreshCw /></Button>
                          <Button size="icon-sm" variant="ghost" aria-label={t.common.delete} onClick={() => api(`/api/images/${g.id}`, { method: "DELETE" }).then(gallery.reload).catch(err)}><Trash2 /></Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
