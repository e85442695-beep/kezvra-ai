"use client";
import { useState } from "react";
import { toast } from "sonner";
import { LifeBuoy, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Badge, Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/misc";
import { api, ApiError } from "@/lib/api-client";
import { useFetch } from "@/hooks/use-fetch";
import { useI18n } from "@/lib/i18n/client";
import { cn, formatDate } from "@/lib/utils";

interface Ticket { id: string; subject: string; status: "OPEN" | "PENDING" | "RESOLVED" | "CLOSED"; updatedAt: string; user?: { email: string }; messages: { id: string; body: string; isStaff: boolean; createdAt: string }[] }

/** Tickets for users; with `staff` it lists every ticket and allows status changes. */
export function SupportView({ staff = false }: { staff?: boolean }) {
  const { t, locale } = useI18n();
  const { data, loading, reload } = useFetch<{ tickets: Ticket[] }>(`/api/support${staff ? "?all=1" : ""}`);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState({ subject: "", body: "" });
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState("");
  const L = locale === "en"
    ? { title: "Support", newT: "New request", subject: "Subject", msg: "Message", reply: "Reply", st: { OPEN: "Open", PENDING: "Awaiting reply", RESOLVED: "Resolved", CLOSED: "Closed" }, staffLbl: "Support" }
    : { title: "Підтримка", newT: "Нове звернення", subject: "Тема", msg: "Повідомлення", reply: "Відповісти", st: { OPEN: "Відкрите", PENDING: "Очікує відповіді", RESOLVED: "Вирішене", CLOSED: "Закрите" }, staffLbl: "Підтримка" };
  const send = async (body: object) => {
    try {
      await api("/api/support", { method: "POST", body });
      reload();
      return true;
    } catch (e) {
      toast.error(e instanceof ApiError ? (t.errors[e.code] ?? e.code) : t.common.error);
      return false;
    }
  };
  const open = data?.tickets.find((x) => x.id === openId);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {!staff && <PageHeader title={L.title} actions={<Button onClick={() => setCreating(true)}><Plus /> {L.newT}</Button>} />}
      {creating && (
        <Card className="mb-6 p-5">
          <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); if (await send(form)) { setCreating(false); setForm({ subject: "", body: "" }); } }}>
            <Field label={L.subject}>{(p) => <Input {...p} required minLength={3} maxLength={150} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />}</Field>
            <Field label={L.msg}>{(p) => <Textarea {...p} required rows={5} maxLength={10000} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />}</Field>
            <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setCreating(false)}>{t.common.cancel}</Button><Button type="submit">{t.chat.send}</Button></div>
          </form>
        </Card>
      )}
      {loading && !data ? (
        <Skeleton className="h-40" />
      ) : !data?.tickets.length ? (
        <EmptyState icon={<LifeBuoy />} title={t.common.empty} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Card>
            <ul className="divide-y divide-border">
              {data.tickets.map((tk) => (
                <li key={tk.id}>
                  <button onClick={() => setOpenId(tk.id)} aria-current={tk.id === openId} className={cn("block w-full px-4 py-3 text-left hover:bg-elevated", tk.id === openId && "bg-elevated")}>
                    <div className="truncate text-sm">{tk.subject}</div>
                    <div className="mt-1 flex items-center justify-between gap-2 font-mono text-xs text-faint">
                      <span className="truncate">{tk.user?.email ?? formatDate(tk.updatedAt, locale, { dateStyle: "short" })}</span>
                      <Badge tone={tk.status === "OPEN" ? "warning" : tk.status === "RESOLVED" ? "success" : "default"}>{L.st[tk.status]}</Badge>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          {open ? (
            <Card className="flex flex-col p-5">
              <h2 className="font-medium">{open.subject}</h2>
              <ol className="mt-4 flex-1 space-y-3">
                {open.messages.map((m) => (
                  <li key={m.id} className={cn("max-w-[85%] rounded-xl px-4 py-2.5 text-sm", m.isStaff ? "bg-elevated" : "ml-auto border border-border")}>
                    <div className="mb-1 font-mono text-xs text-faint">{m.isStaff ? L.staffLbl : ""} {formatDate(m.createdAt, locale)}</div>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                  </li>
                ))}
              </ol>
              <form className="mt-4 space-y-2" onSubmit={async (e) => { e.preventDefault(); if (await send({ ticketId: open.id, body: reply, status: staff && status ? status : undefined })) setReply(""); }}>
                <label htmlFor="rp" className="sr-only">{L.reply}</label>
                <Textarea id="rp" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} required />
                <div className="flex justify-end gap-2">
                  {staff && (
                    <Select aria-label="Status" className="w-48" value={status} onChange={(e) => setStatus(e.target.value)}>
                      <option value="">—</option>
                      {(Object.keys(L.st) as (keyof typeof L.st)[]).map((s) => <option key={s} value={s}>{L.st[s]}</option>)}
                    </Select>
                  )}
                  <Button type="submit" disabled={!reply.trim()}>{L.reply}</Button>
                </div>
              </form>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
