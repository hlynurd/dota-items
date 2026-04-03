import { chatStream } from "@/lib/agent/chat";
import type { ChatMessage, ChatContext } from "@/lib/agent/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json()) as {
    messages: ChatMessage[];
    context: ChatContext;
  };
  const { messages, context } = body;

  if (!messages?.length) {
    return new Response(JSON.stringify({ error: "messages required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  // Stream plain text — the chat response is streamed as raw text chunks
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of chatStream(messages, context)) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(encoder.encode(`\n\nError: ${message}`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
