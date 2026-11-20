"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuTrigger } from "@/components/ui/menu";
import { useI18n } from "@/lib/i18n/client";
import { formatDate } from "@/lib/utils";

interface N {
  id: string;
  userId: string | null;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export function Notifications() {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<N[]>([]);
  const [unread, setUnread] = useState(0);
  const load = () =>
    fetch("/api/notifications")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { items: N[]; unread: number } | null) => {
        if (d) {
          setItems(d.items);
          setUnread(d.unread);
        }
      })
      .catch(() => {});
  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);
  const markRead = () => {
    const ids = items.filter((i) => i.userId && !i.readAt).map((i) => i.id);
    if (ids.length) fetch("/api/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) }).then(() => setUnread(0));
  };
  return (
    <Menu onOpenChange={(o) => o && markRead()}>
      <MenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`${t.nav.notifications}${unread ? ` (${unread})` : ""}`} className="relative">
          <Bell />
          {unread > 0 && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary" aria-hidden />}
        </Button>
      </MenuTrigger>
      <MenuContent className="w-80 p-0">
        <div className="border-b border-border px-3 py-2 text-sm font-medium">{t.nav.notifications}</div>
        <ul className="max-h-96 overflow-y-auto">
          {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">{t.common.empty}</li>}
          {items.map((n) => (
            <li key={n.id} className="border-b border-border px-3 py-2.5 last:border-0">
              <div className="text-sm font-medium">{n.title}</div>
              <p className="mt-0.5 line-clamp-3 text-xs text-muted">{n.body}</p>
              <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
                <span>{formatDate(n.createdAt, locale)}</span>
                {n.link?.startsWith("/") && <Link href={n.link} className="text-primary">{t.common.open}</Link>}
              </div>
            </li>
          ))}
        </ul>
      </MenuContent>
    </Menu>
  );
}
