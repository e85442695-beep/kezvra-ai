"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bot, MessageSquare, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/misc";
import { ModelPicker } from "@/components/chat/model-picker";
import { api, ApiError } from "@/lib/api-client";
import { useFetch } from "@/hooks/use-fetch";
import { useI18n } from "@/lib/i18n/client";

interface A { id: string; name: string; description: string | null; systemPrompt: string; modelId: string; temperature: string | null }
const empty = { id: "", name: "", description: "", systemPrompt: "", modelId: "", temperature: "" };

export function AssistantsView({ defaultModelId }: { defaultModelId: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { data, loading, reload } = useFetch<{ assistants: A[] }>("/api/assistants");
  const [edit, setEdit] = useState<typeof empty | null>(null);
  const L = locale === "en" ? { desc: "Description", start: "Start chat", sub: "Reusable personas: a system prompt, a model and settings." } : { desc: "Опис", start: "Почати чат", sub: "Готові ролі: системний промпт, модель і параметри." };
  const err = (e: unknown) => toast.error(t.errors[e instanceof ApiError ? e.code : ""] ?? t.common.error);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    try {
      await api("/api/assistants", { method: "POST", body: { id: edit.id || undefined, name: edit.name, description: edit.description || undefined, systemPrompt: edit.systemPrompt, modelId: edit.modelId || defaultModelId, temperature: edit.temperature ? Number(edit.temperature) : null } });
      setEdit(null);
      reload();
    } catch (e2) {
      err(e2);
    }
  }
  async function start(a: A) {
    try {
      const r = await api<{ chat: { id: string } }>("/api/chats", { method: "POST", body: { assistantId: a.id, title: a.name } });
      router.push(`/chat/${r.chat.id}`);
    } catch (e) {
      err(e);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <PageHeader title={t.nav.assistants} description={L.sub} actions={<Button onClick={() => setEdit({ ...empty, modelId: defaultModelId })}><Plus /> {t.common.new}</Button>} />
      {loading && !data ? (
        <Skeleton className="h-40" />
      ) : !data?.assistants.length ? (
        <EmptyState icon={<Bot />} title={t.common.empty} action={<Button onClick={() => setEdit({ ...empty, modelId: defaultModelId })}><Plus /> {t.common.new}</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.assistants.map((a) => (
            <Card key={a.id} className="flex flex-col p-5">
              <h2 className="font-medium">{a.name}</h2>
              <p className="mt-1 line-clamp-2 text-sm text-muted">{a.description || a.systemPrompt}</p>
              <p className="mt-3 truncate font-mono text-xs text-faint">{a.modelId}</p>
              <div className="mt-4 flex gap-1">
                <Button size="sm" onClick={() => start(a)}><MessageSquare /> {L.start}</Button>
                <Button size="icon-sm" variant="ghost" aria-label={t.chat.edit} onClick={() => setEdit({ id: a.id, name: a.name, description: a.description ?? "", systemPrompt: a.systemPrompt, modelId: a.modelId, temperature: a.temperature ?? "" })}><Pencil /></Button>
                <Button size="icon-sm" variant="ghost" aria-label={t.common.delete} onClick={() => confirm(`${t.common.delete}?`) && api("/api/assistants", { method: "DELETE", body: { id: a.id } }).then(reload).catch(err)}><Trash2 /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={Boolean(edit)} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent title={edit?.id ? t.chat.edit : t.common.new} className="max-w-xl">
          {edit && (
            <form onSubmit={save} className="space-y-4">
              <Field label={t.auth.name}>{(p) => <Input {...p} required maxLength={80} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />}</Field>
              <Field label={L.desc}>{(p) => <Input {...p} maxLength={500} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />}</Field>
              <Field label={t.chat.systemPrompt}>{(p) => <Textarea {...p} required rows={6} maxLength={20000} value={edit.systemPrompt} onChange={(e) => setEdit({ ...edit, systemPrompt: e.target.value })} />}</Field>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5"><span className="block text-sm font-medium">{t.images.model}</span><ModelPicker value={edit.modelId || defaultModelId} onChange={(id) => setEdit({ ...edit, modelId: id })} /></div>
                <div className="w-32"><Field label={t.chat.temperature}>{(p) => <Input {...p} type="number" min={0} max={2} step={0.1} value={edit.temperature} onChange={(e) => setEdit({ ...edit, temperature: e.target.value })} />}</Field></div>
              </div>
              <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setEdit(null)}>{t.common.cancel}</Button><Button type="submit">{t.common.save}</Button></div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
