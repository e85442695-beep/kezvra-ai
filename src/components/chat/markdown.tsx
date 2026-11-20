"use client";
import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";

function textOf(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) return textOf((node as { props: { children?: React.ReactNode } }).props.children);
  return "";
}

function CodeBlock({ children, className }: { children?: React.ReactNode; className?: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const lang = /language-([\w+-]+)/.exec(className ?? "")?.[1];
  const code = textOf(children).replace(/\n$/, "");
  return (
    <div className="not-prose group relative my-3 overflow-hidden rounded-lg border border-border bg-code">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5 text-xs text-muted">
        <span>{lang ?? "code"}</span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-elevated hover:text-text"
          aria-label={t.chat.copyCode}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? t.common.copied : t.common.copy}
        </button>
      </div>
      <pre tabIndex={0} className="overflow-x-auto p-3 text-[13px] leading-relaxed">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

/**
 * Safe Markdown rendering: raw HTML is NOT enabled (react-markdown escapes it by default), so model
 * output can't inject scripts. Links open in a new tab with noopener/noreferrer.
 */
export const Markdown = memo(function Markdown({ content }: { content: string }) {
  return (
    <div className="prose-kz break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: "ignore" }], [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children, ...rest }) => {
            const inline = !className && !String(children).includes("\n");
            return inline ? <code {...rest}>{children}</code> : <CodeBlock className={className}>{children}</CodeBlock>;
          },
          a: ({ href, children }) => {
            const safe = href && /^(https?:|mailto:|\/|#)/i.test(href) ? href : undefined;
            return (
              <a href={safe} target="_blank" rel="noopener noreferrer nofollow">
                {children}
              </a>
            );
          },
          img: ({ src, alt }) => (typeof src === "string" && /^https:/.test(src) ? <a href={src} target="_blank" rel="noopener noreferrer">{alt || src}</a> : null),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
