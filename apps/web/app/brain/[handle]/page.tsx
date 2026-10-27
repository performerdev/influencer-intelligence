import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { isNotCoin } from "@ii/stats";

import { type RecordTuple, TrackRecord } from "@/components/brain/TrackRecord";
import { BrainAvatar } from "@/components/particles/BrainAvatar";
import { AppLink } from "@/components/ui/AppLink";
import { site } from "@/config/site";
import { formatCount } from "@/lib/intelligences";
import { stripCitations } from "@/lib/refs";
import { findIntelligence, hasDatabase, loadBrain } from "@/lib/server/data";

// Public and the same for everyone: cached, rebuilt at most every 10 minutes.
export const revalidate = 600;

type Props = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const it = await findIntelligence(handle);
  if (!it) return {};
  return {
    title: `@${it.handle}'s calls and brain`,
    description: `Every public call @${it.handle} made on X, priced after 7 and 30 days, and the open-source AI brain built from their posts. Unofficial, not financial advice.`,
  };
}

type FileCall = { post_id: string; ticker: string; direction: "buy" | "sell" | "hold"; called_at: string; quote: string };
type PerCall = { post_id: string; ticker: string; r_7d: number | null; r_30d: number | null; price_at_call: number | null; matched_by?: string | null; symbol?: string | null };

const day = (d: string | Date) => new Date(d).toISOString().slice(0, 10);
// quotes come from X's API with HTML entities
const unescape = (s: string) => s.replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const tickerKey = (t: string) => t.replace(/^\$/, "").toUpperCase();

export default async function BrainProfile({ params }: Props) {
  const { handle } = await params;
  const it = await findIntelligence(handle);
  if (!it) notFound();
  const brain = hasDatabase()
    ? await loadBrain(it.handle)
        .catch(() => loadBrain(it.handle))
        .catch(() => null)
    : null;

  const f = brain?.files;
  // categories, stablecoins and sports bets the extraction took for tickers are not calls on an asset
  const calls = ((f?.calls ?? []) as unknown as FileCall[]).filter((c) => !isNotCoin(c.ticker)).map((c) => ({ ...c, called_at: String(c.called_at), quote: unescape(c.quote ?? "") }));
  const stats = f?.stats ?? null;
  const perCallList = (stats?.per_call ?? []) as PerCall[];
  const perCall = new Map<string, PerCall>();
  for (const p of perCallList) {
    perCall.set(`${p.post_id}|${tickerKey(p.ticker)}`, p);
    if (!perCall.has(p.post_id)) perCall.set(p.post_id, p);
  }

  // every call, packed small for the client (thousands for the biggest minds)
  const r4 = (x: number | null | undefined) => (x == null ? null : Math.round(x * 1e4) / 1e4);
  const record: RecordTuple[] = calls.map((c) => {
    const p = perCall.get(`${c.post_id}|${tickerKey(c.ticker)}`) ?? perCall.get(c.post_id);
    const price = p?.price_at_call;
    return [
      Math.round(new Date(c.called_at).getTime() / 6e4),
      tickerKey(p?.symbol ?? c.ticker),
      c.direction === "buy" ? "b" : c.direction === "sell" ? "s" : "h",
      c.post_id,
      c.quote.slice(0, 200),
      price == null ? null : Number(price.toPrecision(5)),
      price == null ? null : r4(p?.r_7d),
      price == null ? null : r4(p?.r_30d),
      p?.matched_by === "stock" ? 2 : p?.matched_by === "ticker" || p?.matched_by === "symbol" ? 1 : 0,
    ];
  });
  const rules = f ? ruleHighlights(f.rules) : [];
  const githubDir = `${site.githubUrl}/tree/main/brains/${it.code}-${it.handle.toLowerCase()}`;

  return (
    <div className="mx-auto max-w-[1100px] px-gutter pb-24 pt-[calc(var(--ii-topbar-h)+40px)]">
      {/* who */}
      <header className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="shrink-0" style={{ width: 132, height: 132 }}>
          <BrainAvatar it={it} size={132} />
        </div>
        <div className="min-w-0">
          <p className="font-mono text-xs" style={{ color: it.color }}>
            {it.code} · unofficial AI model
          </p>
          <h1 className="mt-1 break-words text-h2">@{it.handle}</h1>
          {it.oneLineMind && <p className="mt-2 text-lead text-particle">{it.oneLineMind}</p>}
          <p className="mt-3 font-pixel text-xs text-muted">
            {it.postsParsed ? `Built from ${formatCount(it.postsParsed)} public posts` : "Brain not built yet"}
            {brain ? ` · brain v${brain.version} · updated ${day(brain.createdAt)}` : ""}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <AppLink href={`/i/${it.handle}`} className="btn-ceramic">
              Talk to {it.code}
            </AppLink>
            <AppLink href={`/group?with=${encodeURIComponent(it.handle)}`} className="btn-line">
              Ask in a group
            </AppLink>
            <a href={`https://x.com/${it.handle}`} target="_blank" rel="noreferrer" className="link-quiet text-sm">
              @{it.handle} on X <span className="arrow">↗</span>
            </a>
            <a href={githubDir} target="_blank" rel="noreferrer" className="link-quiet text-sm">
              Brain files <span className="arrow">↗</span>
            </a>
          </div>
        </div>
      </header>

      <TrackRecord handle={it.handle} data={record} medianHold={stats?.median_hold_days ?? null} holdPairs={stats?.hold_pairs ?? 0} />
      <p className="mt-4 text-xs leading-relaxed text-muted">
        Calls are what @{it.handle} said in public posts on X — bought, sold, holding — found by the brain build and priced by code (DefiLlama; small coins named only by ticker are looked up on DexScreener). Not what the AI says on this site.
        {stats && stats.calls_total > stats.calls_priced ? ` ${formatCount(stats.calls_total - stats.calls_priced)} calls have no price history and aren't counted in the numbers.` : ""}
        {stats ? ` Computed ${day(stats.computed_at)}.` : ""}
      </p>

      <div className="mt-16">
        {/* rules */}
        {rules.length > 0 && (
          <section>
            <h2 className="text-h3">Their rules</h2>
            <p className="mt-2 text-sm text-particle">The first rule of each kind, in short. All of them are in the brain.</p>
            <dl className="mt-5 grid gap-x-10 gap-y-4 md:grid-cols-2">
              {rules.map((r) => (
                <div key={r.kind} className="border-l border-line pl-4">
                  <dt className="label-mono">{r.kind}</dt>
                  <dd className="mt-1 text-sm text-ceramic">{r.rule}</dd>
                </div>
              ))}
            </dl>
            <AppLink href={`/i/${it.handle}`} className="link-quiet mt-6 inline-block text-sm">
              Ask {it.code} how it applies them <span className="arrow">↗</span>
            </AppLink>
          </section>
        )}
      </div>

      <p className="mt-16 font-pixel text-xs text-muted">
        Unofficial. {it.code} is an AI model built from @{it.handle}&apos;s public posts; it is not @{it.handle} and not affiliated with them. Past calls say nothing certain about future ones. Not financial advice.
      </p>
    </div>
  );
}


/** "## Entry\n- Buy when … "quote" (post:…)" → [{ kind: "Entry", rule: "Buy when …" }], first rule of each section. */
function ruleHighlights(md: string): { kind: string; rule: string }[] {
  const out: { kind: string; rule: string }[] = [];
  for (const part of md.split(/\n(?=##\s)/)) {
    const head = part.match(/^##\s+(.+)$/m)?.[1]?.trim();
    const first = part.match(/^\s*[-*]\s+(.+)$/m)?.[1];
    if (!head || !first) continue;
    const rule = stripCitations(first)
      .replace(/\s*["“][^"”]*["”]\s*$/, "")
      .replace(/\s*["“].*$/, "")
      .replace(/[\s:;,—-]+$/, "")
      .trim();
    if (rule) out.push({ kind: head, rule });
    if (out.length >= 6) break;
  }
  return out;
}
