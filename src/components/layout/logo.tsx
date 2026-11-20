import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Kezvra mark: a flat "K" whose upper arm ends in a small square — a cursor / meter tick.
 * One solid color (currentColor), no gradient.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("size-6", className)} fill="none">
      <rect x="0.75" y="0.75" width="22.5" height="22.5" rx="6" stroke="currentColor" strokeOpacity="0.18" strokeWidth="1.5" />
      <path d="M8 6.5v11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M8.5 12 14.5 17.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="13.25" y="5.5" width="3.5" height="3.5" rx="0.75" fill="currentColor" />
      <path d="M8.5 12 13.6 8.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 text-text", className)} aria-label="Kezvra AI">
      <LogoMark />
      <span className="text-[16px] font-semibold leading-none">
        Kezvra<span className="font-normal text-muted"> AI</span>
      </span>
    </Link>
  );
}
