import { loadBrain } from "@/lib/server/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The exact system prompt and brain files the model saw — the "Open the brain"
 * drawer. Pass ?version=N for the version a specific answer used, and
 * ?lite=1 to leave out the prompt (the app only needs the files).
 */
export async function GET(req: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const v = new URL(req.url).searchParams.get("version");
  const brain = await loadBrain(handle, v && /^\d+$/.test(v) ? Number(v) : undefined);
  if (!brain) return Response.json({ error: "No brain for this handle yet." }, { status: 404 });
  const { mind, rules, voice, identity, calls, stats, example_ids } = brain.files;
  const lite = new URL(req.url).searchParams.get("lite") === "1";
  return Response.json(
    {
      code: brain.code,
      handle: brain.handle,
      version: brain.version,
      model: brain.model,
      createdAt: brain.createdAt,
      promptTokens: brain.promptTokens,
      ...(lite ? {} : { prompt: brain.prompt }),
      files: lite ? { identity, mind, rules, voice, calls, stats } : { identity, mind, rules, voice, calls, stats, example_ids },
    },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } },
  );
}
