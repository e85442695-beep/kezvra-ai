import type { Metadata } from "next";
import { SettingsView } from "@/components/settings/settings-view";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Security" };

export default async function SecurityPage() {
  const s = await getSettings();
  return <SettingsView tab="security" defaultModelId={s.defaultModelId} />;
}
