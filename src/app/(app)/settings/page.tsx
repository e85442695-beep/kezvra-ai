import type { Metadata } from "next";
import { SettingsView } from "@/components/settings/settings-view";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const s = await getSettings();
  return <SettingsView tab="profile" defaultModelId={s.defaultModelId} />;
}
