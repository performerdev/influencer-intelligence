import { type PostRow, norm } from "./format";

export type RawCall = { post_id?: string; ticker?: string; direction?: string; quote?: string };

export type Call = {
  post_id: string;
  ticker: string;
  chain: string | null;
  address: string | null;
  direction: "buy" | "sell" | "hold";
  called_at: Date;
  quote: string;
};

const SOLANA_ADDR = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;
const EVM_ADDR = /\b0x[a-fA-F0-9]{40}\b/g;

/** Contract address written in the post itself (detected by code, never by the model). */
export function findAddress(text: string): { chain: string; address: string } | null {
  const evm = text.match(EVM_ADDR);
  if (evm) return { chain: "evm", address: evm[0] };
  for (const m of text.match(SOLANA_ADDR) ?? []) {
    // base58 strings that are plain words/numbers aren't addresses
    if (/\d/.test(m) && /[A-Za-z]/.test(m)) return { chain: "solana", address: m };
  }
  return null;
}

/**
 * Turn model-extracted calls into trustworthy rows: the post must exist, the
 * direction must be valid, and the quote must really be in the post (else we
 * use the post's own opening words). Deduplicated per post/ticker/direction.
 */
export function validateCalls(raw: RawCall[], posts: Map<string, PostRow>): Call[] {
  const out = new Map<string, Call>();
  for (const c of raw) {
    const post = c.post_id ? posts.get(String(c.post_id)) : undefined;
    if (!post) continue;
    const direction = String(c.direction ?? "").toLowerCase();
    if (direction !== "buy" && direction !== "sell" && direction !== "hold") continue;
    let ticker = String(c.ticker ?? "").replace(/^\$/, "").trim().toUpperCase();
    const addr = findAddress(post.text);
    if (!/^[A-Z0-9._-]{1,20}$/.test(ticker)) ticker = addr ? "CA" : "";
    if (!ticker) continue;
    const q = String(c.quote ?? "").trim();
    const quote = q && norm(post.text).includes(norm(q)) ? q.slice(0, 160) : post.text.replace(/\s+/g, " ").trim().slice(0, 140);
    const key = `${post.id}|${ticker}|${direction}`;
    if (out.has(key)) continue;
    out.set(key, {
      post_id: post.id,
      ticker,
      chain: addr?.chain ?? null,
      address: addr?.address ?? null,
      direction,
      called_at: new Date(post.created_at),
      quote,
    });
  }
  return [...out.values()].sort((a, b) => a.called_at.getTime() - b.called_at.getTime());
}
