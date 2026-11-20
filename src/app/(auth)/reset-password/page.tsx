import { Suspense } from "react";
import type { Metadata } from "next";
import { ResetForm } from "@/components/auth/forms";

export const metadata: Metadata = { title: "New password", robots: { index: false } };

export default function ResetPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
