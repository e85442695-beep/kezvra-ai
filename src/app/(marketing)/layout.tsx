import { MarketingFooter, MarketingHeader } from "@/components/layout/marketing";
import { CookieConsent } from "@/components/layout/cookie-consent";
import { getDict } from "@/lib/i18n/server";
import { auth } from "@/auth";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const [{ t }, session] = await Promise.all([getDict(), auth().catch(() => null)]);
  return (
    <>
      <MarketingHeader t={t} signedIn={Boolean(session?.user)} />
      <main id="main">{children}</main>
      <MarketingFooter t={t} />
      <CookieConsent />
    </>
  );
}
