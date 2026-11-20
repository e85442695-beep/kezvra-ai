import type { Metadata } from "next";
import { ImageStudio } from "@/components/images/image-studio";
import { getSettings, pricingConfig } from "@/lib/settings";
import { clampCharge, picoToMicroCredits } from "@/lib/pricing";
import { usdToPico } from "@/lib/money";
import { credits } from "@/lib/utils";
import { integrations } from "@/lib/env";

export const metadata: Metadata = { title: "Image Studio" };

export default async function ImagesPage() {
  const s = await getSettings();
  const cfg = pricingConfig(s);
  const reserve = clampCharge(picoToMicroCredits(usdToPico(s.imageReserveUsd), cfg), cfg);
  return <ImageStudio reserveCredits={credits(reserve)} storageReady={integrations.storage} />;
}
