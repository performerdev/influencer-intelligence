import { sql } from "@/lib/server/data";

export const dynamic = "force-dynamic";

/**
 * A member's X avatar, served from our own origin so the Early card can turn it
 * into pixels (a cross-origin image would taint the canvas). Asks X for the
 * 400px version instead of the 48px one it gives at login.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) return new Response("Not found", { status: 404 });
  const [r] = await sql()<{ avatar_url: string | null }[]>`select avatar_url from users where lower(handle) = lower(${handle}) order by last_seen_at desc limit 1`.catch(() => []);
  const url = r?.avatar_url;
  if (!url || !/^https:\/\/pbs\.twimg\.com\//.test(url)) return new Response("Not found", { status: 404 });
  const big = url.replace(/_normal(\.\w+)$/, "_400x400$1");
  let res = await fetch(big, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!res?.ok && big !== url) res = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!res?.ok) return new Response("Not found", { status: 404 });
  return new Response(await res.arrayBuffer(), {
    headers: { "Content-Type": res.headers.get("content-type") ?? "image/jpeg", "Cache-Control": "public, max-age=3600, s-maxage=86400" },
  });
}
