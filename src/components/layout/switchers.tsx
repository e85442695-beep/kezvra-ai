"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Languages, Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { setLocaleCookie, useI18n } from "@/lib/i18n/client";

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const Icon = !mounted ? Monitor : theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`${t.settings.theme}: ${mounted ? t.common.theme[(theme as "light") ?? "system"] : ""}`}>
          <Icon />
        </Button>
      </MenuTrigger>
      <MenuContent>
        <MenuItem onSelect={() => setTheme("light")}><Sun /> {t.common.theme.light}</MenuItem>
        <MenuItem onSelect={() => setTheme("dark")}><Moon /> {t.common.theme.dark}</MenuItem>
        <MenuItem onSelect={() => setTheme("system")}><Monitor /> {t.common.theme.system}</MenuItem>
      </MenuContent>
    </Menu>
  );
}

export function LocaleSwitcher() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const change = (l: "uk" | "en") => {
    setLocaleCookie(l);
    fetch("/api/account/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ locale: l }) }).catch(() => {});
    router.refresh();
  };
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={t.settings.language}>
          <Languages /> {locale.toUpperCase()}
        </Button>
      </MenuTrigger>
      <MenuContent>
        <MenuItem onSelect={() => change("uk")}>Українська</MenuItem>
        <MenuItem onSelect={() => change("en")}>English</MenuItem>
      </MenuContent>
    </Menu>
  );
}
