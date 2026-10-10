import { loadBrain } from "@/lib/server/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The exact system prompt and brain files the model saw — the "Open the brain"
 * drawer. Pass ?version=N for the version a specific answer used.
 */
export async function GET(req: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const v = new URL(req.url).searchParams.get("version");
  const brain = await loadBrain(handle, v && /^\d+$/.test(v) ? Number(v) : undefined);
  if (!brain) return Response.json({ error: "No brain for this handle yet." }, { status: 404 });
  const { mind, rules, voice, identity, calls, stats, example_ids } = brain.files;
  return Response.json(
    {
      code: brain.code,
      handle: brain.handle,
      version: brain.version,
      model: brain.model,
      createdAt: brain.createdAt,
      promptTokens: brain.promptTokens,
      prompt: brain.prompt,
      files: { identity, mind, rules, voice, calls, stats, example_ids },
    },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } },
  );
}
