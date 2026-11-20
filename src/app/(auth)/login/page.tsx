import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/forms";
import { integrations } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in", robots: { index: true } };

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm google={integrations.google} />
    </Suspense>
  );
}
