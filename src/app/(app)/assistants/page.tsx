import type { Metadata } from "next";
import { AssistantsView } from "@/components/library/assistants-view";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Assistants" };

export default async function AssistantsPage() {
  const s = await getSettings();
  return <AssistantsView defaultModelId={s.defaultModelId} />;
}
