import { clientHash, json } from "@/lib/server/http";
import { addConfigured, existingFor, normalizeHandle, quote, validHandle } from "@/lib/server/jobs";
import { logError } from "@/lib/server/ops";

export const dynamic = "force-dynamic";

// each quote costs two small API reads: cache per handle, cap per visitor
const cache = new Map<string, { at: number; body: unknown }>();
const perClient = new Map<string, number[]>();

/** GET ?handle= → price to add this account's brain (or where it already is). */
export async function GET(req: Request) {
  const handle = normalizeHandle(new URL(req.url).searchParams.get("handle") ?? "");
  if (!validHandle(handle)) return json({ error: "That doesn't look like an X handle." }, 400);
  if (!addConfigured()) return json({ error: "Adding brains opens shortly." }, 503);
  const existing = await existingFor(handle).catch(() => null);
  if (existing?.kind === "live") return json({ exists: true, handle: existing.handle });
  if (existing?.kind === "building") return json({ building: true, jobId: existing.jobId });

  const key = handle.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 15 * 60_000) return json(hit.body);
  const client = clientHash(req);
  const recent = (perClient.get(client) ?? []).filter((t) => Date.now() - t < 3600_000);
  if (recent.length >= 30) return json({ error: "That's a lot of lookups — try again in a bit." }, 429);
  perClient.set(client, [...recent, Date.now()]);

  try {
    const q = await quote(handle);
    if ("error" in q) return json({ error: q.error }, 404);
    const body = {
      handle: q.handle,
      name: q.profile.name,
      avatar: q.profile.avatar,
      followers: q.profile.followers,
      estimatedPosts: q.estimatedPosts,
      breakdown: q.breakdown,
      priceUsd: q.priceUsd,
    };
    cache.set(key, { at: Date.now(), body });
    if (cache.size > 300) cache.delete(cache.keys().next().value!);
    return json(body);
  } catch (err) {
    await logError("server", "/api/add/quote", err, { clientHash: client });
    return json({ error: "Couldn't reach X right now. Try again in a minute." }, 502);
  }
}
