"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/menu";
import { api } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";

export function ShareDialog({ chatId, enabled: initial, onClose }: { chatId: string; enabled: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState(initial);
  const [days, setDays] = useState("");
  const [rotate, setRotate] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const r = await api<{ url: string | null }>(`/api/chats/${chatId}/share`, { method: "POST", body: { enabled, rotate, expiresInDays: days ? Number(days) : null } });
      setUrl(r.url);
      toast.success(t.common.saved);
    } catch {
      toast.error(t.common.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t.chat.shareTitle}>
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-4 text-sm">
            {t.chat.shareEnable}
            <Switch label={t.chat.shareEnable} checked={enabled} onCheckedChange={setEnabled} />
          </label>
          <div className="space-y-1.5">
            <label htmlFor="sd" className="text-sm">{t.chat.shareExpiry}</label>
            <Input id="sd" type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={rotate} onChange={(e) => setRotate(e.target.checked)} className="size-4" /> {t.chat.shareRotate}
          </label>
          {url && (
            <div className="flex gap-2">
              <Input readOnly value={url} aria-label="URL" onFocus={(e) => e.currentTarget.select()} />
              <Button variant="secondary" size="icon" aria-label={t.common.copy} onClick={() => { navigator.clipboard.writeText(url); toast.success(t.common.copied); }}><Copy /></Button>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>{t.common.close}</Button>
            <Button onClick={save} disabled={busy}>{t.common.save}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
