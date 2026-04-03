import { analyzeStream } from "@/lib/agent";
import type { DraftInput } from "@/lib/agent/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json()) as { draft: DraftInput };
  const { draft } = body;

  if (!draft || (!draft.radiant?.length && !draft.dire?.length)) {
    return new Response(JSON.stringify({ error: "At least one hero required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  // Stream newline-delimited JSON (NDJSON) — one event per line
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of analyzeStream(draft)) {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(
          encoder.encode(JSON.stringify({ type: "error", message }) + "\n")
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no", // disable Nginx buffering on Vercel
    },
  });
}
