import type { Metadata } from "next";
import { KeysView } from "@/components/developers/keys-view";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "API keys" };

export default function DevelopersPage() {
  return <KeysView baseUrl={env.APP_URL} />;
}
