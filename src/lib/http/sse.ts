import { bigintReplacer } from "@/lib/money";

/** Minimal SSE writer over a ReadableStream. */
export function sseStream(run: (send: (event: string, data: unknown) => void) => Promise<void>) {
  const enc = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data, bigintReplacer)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const ping = setInterval(() => {
        if (!closed) {
          try {
            controller.enqueue(enc.encode(`: ping\n\n`));
          } catch {
            closed = true;
          }
        }
      }, 15_000);
      try {
        await run(send);
      } finally {
        clearInterval(ping);
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      }
    },
    cancel() {
      closed = true;
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
