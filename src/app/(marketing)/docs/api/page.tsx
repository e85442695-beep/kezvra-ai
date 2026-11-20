import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "API documentation", description: "Kezvra AI OpenAI-compatible REST API: authentication, chat completions, streaming, models and usage.", alternates: { canonical: "/docs/api" } };

function Code({ children }: { children: string }) {
  // tabIndex lets keyboard users scroll long lines (WCAG scrollable-region-focusable)
  return <pre tabIndex={0} className="overflow-x-auto rounded-xl border border-border bg-code p-4 font-mono text-[13px] leading-relaxed">{children}</pre>;
}

export default function ApiDocs() {
  const base = `${env.APP_URL}/api/v1`;
  const errors: [string, string, string][] = [
    ["401", "INVALID_API_KEY", "Missing, malformed, revoked or expired key"],
    ["402", "INSUFFICIENT_CREDITS", "Balance can't cover the worst-case cost of the request"],
    ["402", "KEY_SPEND_LIMIT_EXCEEDED", "The key's own spend limit would be exceeded"],
    ["403", "INSUFFICIENT_SCOPE / MODEL_NOT_ALLOWED_FOR_KEY", "Key lacks the scope or the model isn't allowed for it"],
    ["404", "MODEL_NOT_FOUND", "Unknown or disabled model id"],
    ["429", "RATE_LIMITED", "Per-key requests-per-minute limit reached"],
    ["503", "SERVICE_BUSY", "Platform-wide spend guard is active; retry later"],
  ];
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-medium tracking-[-0.02em]">API documentation</h1>
      <p className="mt-3 text-muted">
        OpenAI-compatible REST API, versioned under <code className="font-mono">/api/v1</code>. Requests are billed from your Kezvra Credits balance using the same reserve → charge → release ledger as the web app. Create keys in <Link href="/developers" className="text-primary underline">API keys</Link>.
      </p>

      <h2 className="mt-10 text-xl font-medium">Authentication</h2>
      <p className="mt-2 text-sm text-muted">Send your key as a bearer token. Keys are shown once and stored only as a SHA-256 hash.</p>
      <Code>{`Authorization: Bearer kz_live_…`}</Code>

      <h2 className="mt-10 text-xl font-medium">POST /chat/completions</h2>
      <p className="mt-2 text-sm text-muted">Fields: <code>model</code>, <code>messages</code>, <code>stream</code>, <code>max_tokens</code>, <code>temperature</code>, <code>top_p</code>. <code>max_tokens</code> is capped to what your balance can pay for.</p>
      <Code>{`curl ${base}/chat/completions \\
  -H "Authorization: Bearer $KEZVRA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/gpt-4o-mini",
    "messages": [{ "role": "user", "content": "Hello" }]
  }'`}</Code>
      <p className="mt-3 text-sm text-muted">The response follows the OpenAI shape and adds a <code>kezvra</code> object with <code>credits_charged</code>.</p>

      <h3 className="mt-6 font-medium">Streaming</h3>
      <p className="mt-2 text-sm text-muted">Set <code>&quot;stream&quot;: true</code> to receive <code>chat.completion.chunk</code> server-sent events, ending with <code>data: [DONE]</code>. The final chunk carries <code>usage</code>.</p>
      <Code>{`from openai import OpenAI

client = OpenAI(base_url="${base}", api_key="kz_live_…")
stream = client.chat.completions.create(
    model="openai/gpt-4o-mini",
    messages=[{"role": "user", "content": "Write a haiku about ledgers"}],
    stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="")`}</Code>

      <h2 className="mt-10 text-xl font-medium">GET /models</h2>
      <p className="mt-2 text-sm text-muted">Text-capable models available to the key (respects the key&apos;s model allow-list). Requires the <code>models</code> scope.</p>
      <Code>{`curl ${base}/models -H "Authorization: Bearer $KEZVRA_API_KEY"`}</Code>

      <h2 className="mt-10 text-xl font-medium">GET /usage</h2>
      <p className="mt-2 text-sm text-muted">Balance, the key&apos;s spend and limit, and 30-day usage. Requires the <code>usage</code> scope.</p>

      <h2 className="mt-10 text-xl font-medium">Errors</h2>
      <p className="mt-2 text-sm text-muted">Errors return <code>{`{ "error": { "code": "…", "message": "…" } }`}</code>.</p>
      <div className="mt-3 overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-faint">
            <tr className="border-b border-border"><th className="px-4 py-2 font-normal">HTTP</th><th className="px-4 py-2 font-normal">code</th><th className="px-4 py-2 font-normal">Meaning</th></tr>
          </thead>
          <tbody>
            {errors.map(([s, c, m]) => (
              <tr key={c} className="border-b border-border last:border-0"><td className="px-4 py-2 font-mono">{s}</td><td className="px-4 py-2 font-mono text-xs">{c}</td><td className="px-4 py-2 text-muted">{m}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-xl font-medium">Limits</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
        <li>Per-key rate limit (requests per minute), configurable when creating the key.</li>
        <li>Optional per-key spend limit in credits, enforced atomically.</li>
        <li>Requests can never exceed your available balance.</li>
      </ul>
    </article>
  );
}
