"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, ChevronDown, Square } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";

/**
 * Product preview of the real chat layout. It replays a PRE-RECORDED answer (labelled as such) —
 * it never calls a model and is not presented as a live response. The cost receipt under the
 * answer is the product's signature: every reply shows tokens and credits.
 */
export function HeroDemo() {
  const { t, locale } = useI18n();
  const [input, setInput] = useState(t.landing.demoPrompt);
  const [sent, setSent] = useState<string | null>(t.landing.demoPrompt);
  const [shown, setShown] = useState(t.landing.demoAnswer);
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setRunning(false);
  };

  const run = () => {
    if (!input.trim()) return;
    stop();
    setSent(input);
    setShown("");
    setRunning(true);
    const full = t.landing.demoAnswer;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(full);
      setRunning(false);
      return;
    }
    let i = 0;
    timer.current = setInterval(() => {
      i += 3;
      setShown(full.slice(0, i));
      if (i >= full.length) stop();
    }, 18);
  };

  useEffect(() => stop, []);
  const done = !running && shown.length > 0;

  return (
    <figure className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_24px_64px_rgb(0_0_0/0.35)]" aria-label="Kezvra chat preview">
      <div className="flex h-12 items-center justify-between border-b border-border px-4">
        <span className="inline-flex h-8 items-center gap-2 rounded-lg border border-border bg-elevated px-3 text-[13px]">
          Claude Sonnet <ChevronDown className="size-3.5 text-faint" aria-hidden />
        </span>
        <span className="font-mono text-xs text-faint">{locale === "en" ? "Balance" : "Баланс"} 1 248.50</span>
      </div>

      <div className="min-h-72 space-y-5 p-5" aria-live="polite">
        {sent && <div className="ml-auto w-fit max-w-[85%] rounded-xl bg-elevated px-4 py-2.5 text-sm">{sent}</div>}
        {sent && (
          <div>
            <p className="text-sm leading-relaxed text-text">
              {shown}
              {running && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-text align-middle" aria-hidden />}
            </p>
            <div className={`mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-dashed border-border pt-3 font-mono text-xs text-faint transition-opacity duration-300 ${done ? "opacity-100" : "opacity-0"}`}>
              <span>412 → 138 tok</span>
              <span aria-hidden>·</span>
              <span>{locale === "en" ? "reserved" : "резерв"} 2.40</span>
              <span aria-hidden>·</span>
              <span className="text-primary">{locale === "en" ? "charged" : "списано"} 0.42 cr</span>
              <span aria-hidden>·</span>
              <span>{locale === "en" ? "returned" : "повернуто"} 1.98</span>
            </div>
          </div>
        )}
      </div>

      <form
        className="mx-4 mb-3 flex items-end gap-2 rounded-xl border border-border bg-bg p-2"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <label htmlFor="demo-input" className="sr-only">{t.chat.placeholder}</label>
        <textarea id="demo-input" rows={1} value={input} onChange={(e) => setInput(e.target.value)} className="max-h-24 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none" />
        {running ? (
          <button type="button" onClick={stop} aria-label={t.chat.stop} className="grid size-8 place-items-center rounded-lg bg-elevated"><Square className="size-3.5" /></button>
        ) : (
          <button type="submit" aria-label={t.chat.send} className="grid size-8 place-items-center rounded-lg bg-btn text-btn-fg"><ArrowUp className="size-4" /></button>
        )}
      </form>
      <figcaption className="px-4 pb-3 text-xs text-faint">{t.landing.demoNote}</figcaption>
    </figure>
  );
}
