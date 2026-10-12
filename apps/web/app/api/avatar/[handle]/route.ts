import { sql } from "@/lib/server/data";

export const dynamic = "force-dynamic";

/**
 * PFPs of brains added by users, served from our own origin so the pixel
 * brain can read their colors (a cross-origin image would taint the canvas).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const [r] = await sql()<{ avatar_url: string | null }[]>`select avatar_url from influencers where lower(handle) = lower(${handle}) and not coalesce(hidden, false) limit 1`.catch(() => []);
  const url = r?.avatar_url;
  if (!url || !/^https:\/\/pbs\.twimg\.com\//.test(url)) return new Response("Not found", { status: 404 });
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!res?.ok) return new Response("Not found", { status: 404 });
  return new Response(await res.arrayBuffer(), {
    headers: { "Content-Type": res.headers.get("content-type") ?? "image/jpeg", "Cache-Control": "public, max-age=86400, s-maxage=604800" },
  });
}
