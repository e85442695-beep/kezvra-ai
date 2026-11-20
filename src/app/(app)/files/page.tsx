import type { Metadata } from "next";
import { FilesManager } from "@/components/files/files-manager";
import { env, integrations } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { requirePageUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Files" };

export default async function FilesPage() {
  const [user, s] = await Promise.all([requirePageUser(), getSettings()]);
  return <FilesManager maxMb={env.MAX_UPLOAD_MB} defaultModelId={user.defaultModelId ?? s.defaultModelId} storageReady={integrations.storage} />;
}
