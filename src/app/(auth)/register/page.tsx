import { Suspense } from "react";
import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth/forms";
import { integrations } from "@/lib/env";

export const metadata: Metadata = { title: "Sign up" };

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm google={integrations.google} />
    </Suspense>
  );
}
