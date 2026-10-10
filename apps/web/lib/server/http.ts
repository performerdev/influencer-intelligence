import "server-only";

import { createHash } from "node:crypto";

/** Anonymous per-visitor key for rate limits: a salted hash of the IP, never the IP itself. */
export function clientHash(req: Request) {
  const ip =
    req.headers.get("x-nf-client-connection-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "local";
  return createHash("sha256").update(`${ip}:${process.env.CHAT_SALT ?? "ii"}`).digest("hex").slice(0, 32);
}

export const json = (data: unknown, status = 200) => Response.json(data, { status });

export const VERDICT = /\n*\s*VERDICT:\s*(BUY|SELL|HOLD|PASS)\s*\.?\s*$/i;

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  "X-Accel-Buffering": "no",
};
