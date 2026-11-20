"use client";
import { useEffect, useMemo, useState } from "react";
import { Command } from "cmdk";
import { Popover } from "radix-ui";
import { ChevronDown, Eye, FileText, Star } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { Badge } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export interface PickerModel {
  id: string;
  name: string;
  provider: string;
  isFree: boolean;
  contextLength: number | null;
  inputModalities: string[];
  outputModalities: string[];
  supportedParams: string[];
  imageOptions: { aspectRatios: string[]; maxInputImages: number } | null;
  categories: string[];
  creditsPerMInput: string;
  creditsPerMOutput: string;
  variablePricing: boolean;
}

let cache: PickerModel[] | null = null;
export function useModels(filter: (m: PickerModel) => boolean = (m) => m.outputModalities.includes("text")) {
  const [models, setModels] = useState<PickerModel[] | null>(cache);
  useEffect(() => {
    if (cache) return;
    fetch("/api/models")
      .then((r) => r.json())
      .then((d: { models: PickerModel[] }) => {
        cache = d.models;
        setModels(d.models);
      })
      .catch(() => setModels([]));
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (models ? models.filter(filter) : null), [models]);
}

export function ModelPicker({ value, onChange, favorites, onToggleFavorite, filter, className }: {
  value: string;
  onChange: (id: string) => void;
  favorites?: string[];
  onToggleFavorite?: (id: string) => void;
  filter?: (m: PickerModel) => boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const models = useModels(filter);
  const [open, setOpen] = useState(false);
  const current = models?.find((m) => m.id === value);
  const favs = new Set(favorites ?? []);
  const groups = models ? [
    { label: t.chat.favorites, items: models.filter((m) => favs.has(m.id)) },
    { label: t.chat.allModels, items: models.filter((m) => !favs.has(m.id)) },
  ] : [];

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className={cn("inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:bg-elevated", className)}
        aria-label={`${t.chat.selectModel}: ${current?.name ?? value}`}
      >
        <span className="truncate">{current?.name ?? value}</span>
        <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} className="z-50 w-[min(28rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-border bg-elevated shadow-2xl">
          <Command loop label={t.chat.selectModel}>
            <Command.Input autoFocus placeholder={t.chat.searchModels} className="h-11 w-full border-b border-border bg-transparent px-3 text-sm outline-none" />
            <Command.List className="max-h-[55vh] overflow-y-auto p-1">
              <Command.Empty className="px-3 py-6 text-center text-sm text-muted">{models === null ? t.common.loading : t.common.empty}</Command.Empty>
              {groups.map((g) =>
                g.items.length ? (
                  <Command.Group key={g.label} heading={g.label} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted">
                    {g.items.map((m) => (
                      <Command.Item
                        key={m.id}
                        value={`${m.name} ${m.id}`}
                        onSelect={() => {
                          onChange(m.id);
                          setOpen(false);
                        }}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm aria-selected:bg-surface"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-medium">{m.name}</span>
                            {m.isFree && <Badge tone="success">{t.common.free}</Badge>}
                            {m.inputModalities.includes("image") && <Eye className="size-3.5 text-muted" aria-label="vision" />}
                            {m.inputModalities.includes("file") && <FileText className="size-3.5 text-muted" aria-label="files" />}
                          </div>
                          <div className="truncate text-xs text-muted">
                            {m.provider} · {m.contextLength ? `${Math.round(m.contextLength / 1000)}K` : "—"} ·{" "}
                            {m.isFree ? t.common.free : m.variablePricing ? t.models.variable : `${m.creditsPerMInput}/${m.creditsPerMOutput} ${t.common.creditsShort} per 1M`}
                          </div>
                        </div>
                        {onToggleFavorite && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleFavorite(m.id);
                            }}
                            aria-label={favs.has(m.id) ? t.models.unfavorite : t.models.favorite}
                            aria-pressed={favs.has(m.id)}
                            className="rounded p-1 text-muted hover:text-warning"
                          >
                            <Star className={cn("size-4", favs.has(m.id) && "fill-warning text-warning")} />
                          </button>
                        )}
                      </Command.Item>
                    ))}
                  </Command.Group>
                ) : null,
              )}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
