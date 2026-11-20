import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/layout/providers";
import { getLocale } from "@/lib/i18n/server";
import { env } from "@/lib/env";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin", "cyrillic"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(env.APP_URL),
  title: { default: "Kezvra AI — усі найкращі AI-моделі на одній платформі", template: "%s · Kezvra AI" },
  description: "Чати, код, документи та генерація зображень. Сотні AI-моделей в одному інтерфейсі з прозорою оплатою за використання.",
  applicationName: "Kezvra AI",
  openGraph: { type: "website", siteName: "Kezvra AI", images: ["/og.png"], locale: "uk_UA", alternateLocale: ["en_US"] },
  twitter: { card: "summary_large_image" },
  icons: { icon: "/icon.svg" },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#09090F" },
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang={locale} suppressHydrationWarning className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        <Providers locale={locale} nonce={nonce}>{children}</Providers>
      </body>
    </html>
  );
}
