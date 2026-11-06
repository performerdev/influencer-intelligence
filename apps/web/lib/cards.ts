/**
 * Cards inside a chat answer. The mind writes a tag on its own line —
 * [[calls:WIF]], [[coin:SOL]], [[compare:WIF,BONK]], [[record]], [[rule:exit]] —
 * and the site draws the card from its own data there. The model never writes
 * a card's numbers; an unknown tag is just dropped.
 */
import type { RecordRow, summary } from "./record";
import type { TokenInfo } from "./server/token";

export type Card =
  | { kind: "calls"; ticker: string }
  | { kind: "coin"; ticker: string }
  | { kind: "compare"; tickers: string[] }
  | { kind: "record" }
  | { kind: "rule"; topic: string };

export const RULE_TOPICS = ["entry", "exit", "sizing", "risk", "hold", "averaging"] as const;
// any [[word]] or [[word:args]]: known kinds (and the names a model may use for them) draw, the rest is dropped
const TAG = /\[\[\s*([a-z][a-z _-]{0,20}?)\s*(?::\s*([^\]]*))?\]\]/gi;
const KIND: Record<string, Card["kind"]> = {
  calls: "calls",
  call: "calls",
  chart: "calls",
  coin: "coin",
  price: "coin",
  token: "coin",
  compare: "compare",
  record: "record",
  track_record: "record",
  trackrecord: "record",
  stats: "record",
  rule: "rule",
  rules: "rule",
};
const ticker = (s: string) => s.trim().replace(/^\$/, "").toUpperCase();
const okTicker = (s: string) => /^[A-Z0-9]{1,15}$/.test(s);

function parse(kind: string, arg: string | undefined): Card | null {
  const k = KIND[kind.toLowerCase().replace(/[\s-]+/g, "_")];
  if (!k) return null;
  const a = (arg ?? "").trim();
  if (k === "record") return { kind: "record" };
  if (k === "rule") {
    const t = a.toLowerCase();
    return RULE_TOPICS.find((r) => t.startsWith(r.slice(0, 4))) ? { kind: "rule", topic: RULE_TOPICS.find((r) => t.startsWith(r.slice(0, 4)))! } : null;
  }
  if (k === "compare") {
    const ts = [...new Set(a.split(/[,\s]+/).map(ticker).filter(okTicker))].slice(0, 4);
    return ts.length >= 2 ? { kind: "compare", tickers: ts } : null;
  }
  const t = ticker(a);
  return okTicker(t) ? { kind: k, ticker: t } : null;
}

/** The answer as text pieces and cards, in order (at most `max` cards; extra tags are dropped). */
export function splitCards(text: string, max = 2): ({ text: string } | { card: Card })[] {
  const out: ({ text: string } | { card: Card })[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(TAG)) {
    const before = text.slice(last, m.index);
    if (before.trim()) out.push({ text: before.replace(/^\s+|\s+$/g, "") });
    const card = n < max ? parse(m[1], m[2]) : null;
    if (card) {
      out.push({ card });
      n++;
    }
    last = (m.index ?? 0) + m[0].length;
  }
  const rest = text.slice(last);
  if (rest.trim()) out.push({ text: rest.replace(/^\s+|\s+$/g, "") });
  return out;
}

/** Text without card tags (share pages, previews, anything that can't draw cards). A half-written tag at the end goes too. */
export const stripCards = (text: string) =>
  text
    .replace(TAG, "")
    .replace(/\[\[[^\]]*$/, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/* ───────────── what /api/cards/<handle> returns ───────────── */

type Sum = ReturnType<typeof summary>;
export type CardCall = Pick<RecordRow, "t" | "dir" | "price" | "r7" | "r30" | "quote" | "post"> & { approx: boolean };
export type CoinCardData = { ticker: string; token: TokenInfo | null; history: [number, number][]; calls: CardCall[]; sum: Sum };
export type CompareCardData = { rows: { ticker: string; token: Pick<TokenInfo, "price" | "change24h" | "mcap" | "top"> | null; n: number; last: { dir: RecordRow["dir"]; t: number } | null; sum: Sum }[] };
export type RecordCardData = {
  n: number;
  priced: number;
  all: Sum;
  d30: Sum & { n: number };
  top: { ticker: string; n: number; w7: number | null }[];
  best: (CardCall & { ticker: string })[];
  worst: (CardCall & { ticker: string })[];
};

