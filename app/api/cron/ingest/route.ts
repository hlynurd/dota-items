import { runIngest } from "@/scripts/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — Vercel Pro allows up to 300s

export async function GET(req: Request): Promise<Response> {
  // Vercel Cron sends the CRON_SECRET as a Bearer token
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const result = await runIngest(300);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/ingest] Error:", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
