import { analyzeDraft } from "@/lib/analysis/build-analyzer";
import type { DraftInput } from "@/lib/agent/types";

export const dynamic = "force-dynamic";

// ─── Rate limiting ────────────────────────────────────────────────────────────
// Simple in-memory sliding window: 5 requests per IP per 60s.
// Not perfect across serverless instances but protects against single-client abuse.
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 5;
const requestLog = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (timestamps.length >= MAX_REQUESTS) return true;
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return false;
}

export async function POST(req: Request): Promise<Response> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (isRateLimited(ip)) {
    return new Response(JSON.stringify({ error: "Too many requests — wait a minute and try again." }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": "60" },
    });
  }

  const body = (await req.json()) as { draft: DraftInput };
  const { draft } = body;

  if (!draft || (!draft.radiant?.length && !draft.dire?.length)) {
    return new Response(JSON.stringify({ error: "At least one hero required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      try {
        emit({ type: "status", message: "Fetching match data..." });

        const builds = await analyzeDraft(draft);

        for (const build of builds) {
          emit({ type: "hero_build", data: build });
        }

        emit({ type: "done" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        emit({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
