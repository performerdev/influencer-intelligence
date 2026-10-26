/**
 * Brain files → what the chat UI needs (sections for the brain panel, stats,
 * suggested questions). Shared by the chat page (server) and the app (client).
 */
import type { BrainSection, ChatBrain } from "@/components/chat/ChatView";

export type BrainCall = { post_id: string; ticker: string; direction: "buy" | "sell" | "hold"; called_at: string; quote: string };
export type CallStat = {
  post_id: string;
  ticker: string;
  direction: "buy" | "sell" | "hold";
  called_at: string;
  r_1d: number | null;
  r_7d: number | null;
  r_30d: number | null;
  matched_by?: "ticker" | null;
};
export type BrainStatsFile = {
  computed_at: string;
  calls_total: number;
  calls_priced: number;
  by_direction: Record<"buy" | "sell" | "hold", number>;
  horizons: Record<"1d" | "7d" | "30d", { n: number; hit_rate: number | null; median_return: number | null; mean_return?: number | null }>;
  median_hold_days: number | null;
  hold_pairs: number;
  per_call: CallStat[];
};
export type BrainFilesLite = { mind: string; rules: string; voice: string; identity?: string; calls: BrainCall[]; stats: BrainStatsFile | null };
/** /api/brain/<handle>?lite=1 */
export type ApiBrain = { code: string; handle: string; version: number; createdAt: string; promptTokens: number; files: BrainFilesLite };

/** "## Section" blocks of a brain file → collapsible items in the brain panel. */
export function splitSections(md: string, source: "mind" | "rules"): BrainSection[] {
  const parts = md.split(/\n(?=##\s)/).filter((p) => /^##\s/.test(p.trim()));
  return parts
    .map((p, i) => {
      const [head, ...rest] = p.trim().split("\n");
      const title = head.replace(/^##\s*/, "").trim();
      const body = rest.join("\n").trim();
      return { id: `${source}-${i}`, title: source === "rules" && !/rule/i.test(title) ? `${title} rules`.replace(/ and taking profit rules$/i, " rules") : title, body, source };
    })
    .filter((s) => s.body && !/^no stated rule\.?$/i.test(s.body));
}

export const stripTitle = (md: string) => md.replace(/^#\s.*\n+/, "").trim();

/** Prompts built from this brain's own data (most-called tickers), rotated by the chat. */
export function suggestionsFor(tickers: string[]): string[] {
  const counts = new Map<string, number>();
  for (const t of tickers) if (t !== "CA") counts.set(t, (counts.get(t) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  return [
    "Who are you?",
    top[0] ? `Would you buy $${top[0]} here?` : "Would you buy this dip?",
    "What's your rule for taking profit?",
    top[1] ? `Still holding $${top[1]}?` : "How long do you hold a winner?",
    "How do you size a position?",
    "What would make you sell everything?",
    "What's the trade you regret most?",
  ];
}

export function toChatBrain(b: { version: number; createdAt: string; promptTokens: number; files: BrainFilesLite }): ChatBrain {
  const f = b.files;
  const s = f.stats;
  return {
    version: b.version,
    createdAt: b.createdAt,
    promptTokens: b.promptTokens,
    sections: [...splitSections(f.mind, "mind"), ...splitSections(f.rules, "rules"), { id: "voice", title: "Style", body: stripTitle(f.voice), source: "voice" as const }],
    stats: s
      ? {
          computedAt: s.computed_at,
          callsTotal: s.calls_total,
          callsPriced: s.calls_priced,
          hit7d: s.horizons["7d"].hit_rate,
          median7d: s.horizons["7d"].median_return,
          medianHoldDays: s.median_hold_days,
          holdPairs: s.hold_pairs,
        }
      : null,
    suggestions: suggestionsFor(f.calls.map((c) => c.ticker)),
  };
}
