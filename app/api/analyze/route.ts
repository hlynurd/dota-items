import { analyzeDraft } from "@/lib/analysis/build-analyzer";
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
