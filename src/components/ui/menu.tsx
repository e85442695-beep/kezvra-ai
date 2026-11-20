"use client";
import { DropdownMenu as M, Tooltip as T, Switch as S, Tabs as Tb } from "radix-ui";
import { cn } from "@/lib/utils";

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;
export const MenuSub = M.Sub;

export function MenuContent({ children, align = "end", className }: { children: React.ReactNode; align?: "start" | "end" | "center"; className?: string }) {
  return (
    <M.Portal>
      <M.Content align={align} sideOffset={6} className={cn("z-50 min-w-48 rounded-lg border border-border bg-elevated p-1 shadow-xl", className)}>
        {children}
      </M.Content>
    </M.Portal>
  );
}

const itemCls =
  "flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-surface data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-muted";

export function MenuItem({ className, danger, ...p }: React.ComponentProps<typeof M.Item> & { danger?: boolean }) {
  return <M.Item className={cn(itemCls, danger && "text-danger [&_svg]:text-danger", className)} {...p} />;
}
export const MenuSeparator = () => <M.Separator className="my-1 h-px bg-border" />;
export const MenuLabel = ({ children }: { children: React.ReactNode }) => <M.Label className="px-2 py-1 text-xs text-muted">{children}</M.Label>;
export function MenuSubTrigger({ children }: { children: React.ReactNode }) {
  return <M.SubTrigger className={itemCls}>{children}</M.SubTrigger>;
}
export function MenuSubContent({ children }: { children: React.ReactNode }) {
  return (
    <M.Portal>
      <M.SubContent sideOffset={4} className="z-50 min-w-44 rounded-lg border border-border bg-elevated p-1 shadow-xl">
        {children}
      </M.SubContent>
    </M.Portal>
  );
}

export function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <T.Provider delayDuration={300}>
      <T.Root>
        <T.Trigger asChild>{children}</T.Trigger>
        <T.Portal>
          <T.Content sideOffset={6} className="z-50 rounded-md bg-text px-2 py-1 text-xs text-bg shadow">
            {label}
          </T.Content>
        </T.Portal>
      </T.Root>
    </T.Provider>
  );
}

export function Switch({ label, ...p }: React.ComponentProps<typeof S.Root> & { label: string }) {
  return (
    <S.Root aria-label={label} className="relative h-6 w-10 shrink-0 rounded-full bg-elevated border border-border transition-colors data-[state=checked]:bg-btn" {...p}>
      <S.Thumb className="block size-[18px] translate-x-0.5 rounded-full bg-text shadow-sm transition-transform data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-btn-fg" />
    </S.Root>
  );
}

export const Tabs = Tb.Root;
export const TabsContent = Tb.Content;
export function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <Tb.List className={cn("inline-flex flex-wrap gap-1 rounded-lg border border-border bg-surface p-1", className)}>{children}</Tb.List>;
}
export function TabsTrigger({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <Tb.Trigger
      value={value}
      className="rounded-md px-3 py-1.5 text-sm text-muted transition-colors data-[state=active]:bg-elevated data-[state=active]:text-text data-[state=active]:shadow-sm"
    >
      {children}
    </Tb.Trigger>
  );
}
