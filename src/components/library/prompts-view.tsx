"use client";
import { useState } from "react";
import { toast } from "sonner";
import { BookMarked, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/misc";
import { api, ApiError } from "@/lib/api-client";
import { useFetch } from "@/hooks/use-fetch";
import { useI18n } from "@/lib/i18n/client";

interface P { id: string; title: string; content: string; category: string | null }
const empty = { id: "", title: "", content: "", category: "" };

export function PromptsView() {
  const { t, locale } = useI18n();
  const { data, loading, reload } = useFetch<{ mine: P[]; templates: P[] }>("/api/prompts");
  const [edit, setEdit] = useState<typeof empty | null>(null);
  const L = locale === "en" ? { mine: "My prompts", tpl: "Templates", cat: "Category", sub: "Save prompts you reuse. {{placeholders}} mark the parts to fill in." } : { mine: "Мої промпти", tpl: "Шаблони", cat: "Категорія", sub: "Зберігайте промпти, які використовуєте часто. {{змінні}} позначають місця для заповнення." };
  const copy = (s: string) => { navigator.clipboard.writeText(s); toast.success(t.common.copied); };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    try {
      await api("/api/prompts", { method: "POST", body: { id: edit.id || undefined, title: edit.title, content: edit.content, category: edit.category || undefined } });
      setEdit(null);
      reload();
    } catch (e2) {
      toast.error(e2 instanceof ApiError ? e2.code : t.common.error);
    }
  }

  const Row = ({ p, own }: { p: P; own: boolean }) => (
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{p.title}</div>
        <p className="mt-0.5 line-clamp-2 font-mono text-xs text-faint">{p.content}</p>
      </div>
      <Button size="icon-sm" variant="ghost" aria-label={`${t.common.copy} ${p.title}`} onClick={() => copy(p.content)}><Copy /></Button>
      {own ? (
        <>
          <Button size="icon-sm" variant="ghost" aria-label={t.chat.edit} onClick={() => setEdit({ id: p.id, title: p.title, content: p.content, category: p.category ?? "" })}><Pencil /></Button>
          <Button size="icon-sm" variant="ghost" aria-label={t.common.delete} onClick={() => api("/api/prompts", { method: "DELETE", body: { id: p.id } }).then(reload)}><Trash2 /></Button>
        </>
      ) : (
        <Button size="icon-sm" variant="ghost" aria-label={`${t.common.save} ${p.title}`} onClick={() => setEdit({ id: "", title: p.title, content: p.content, category: p.category ?? "" })}><Plus /></Button>
      )}
    </li>
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <PageHeader title={t.nav.prompts} description={L.sub} actions={<Button onClick={() => setEdit(empty)}><Plus /> {t.common.new}</Button>} />
      {loading && !data ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="space-y-8">
          <section aria-labelledby="pm-h">
            <h2 id="pm-h" className="mb-3 text-lg font-medium">{L.mine}</h2>
            {data?.mine.length ? <Card><ul className="divide-y divide-border">{data.mine.map((p) => <Row key={p.id} p={p} own />)}</ul></Card> : <EmptyState icon={<BookMarked />} title={t.common.empty} />}
          </section>
          <section aria-labelledby="pt-h">
            <h2 id="pt-h" className="mb-3 text-lg font-medium">{L.tpl}</h2>
            <Card><ul className="divide-y divide-border">{data?.templates.map((p) => <Row key={p.id} p={p} own={false} />)}</ul></Card>
          </section>
        </div>
      )}
      <Dialog open={Boolean(edit)} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent title={edit?.id ? t.chat.edit : t.common.new} className="max-w-xl">
          {edit && (
            <form onSubmit={save} className="space-y-4">
              <Field label={t.auth.name}>{(p) => <Input {...p} required maxLength={120} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />}</Field>
              <Field label={L.cat}>{(p) => <Input {...p} maxLength={40} value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} />}</Field>
              <Field label="Prompt">{(p) => <Textarea {...p} required rows={8} maxLength={20000} value={edit.content} onChange={(e) => setEdit({ ...edit, content: e.target.value })} />}</Field>
              <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setEdit(null)}>{t.common.cancel}</Button><Button type="submit">{t.common.save}</Button></div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
