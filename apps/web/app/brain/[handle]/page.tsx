import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CallsChart, type ChartCall } from "@/components/brain/CallsChart";
import { BrainAvatar } from "@/components/particles/BrainAvatar";
import { AppLink } from "@/components/ui/AppLink";
import { site } from "@/config/site";
import { formatCount } from "@/lib/intelligences";
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
type PerCall = { post_id: string; r_7d: number | null; r_30d: number | null; price_at_call: number | null };

const pct = (x: number | null | undefined, signed = false) => (x == null ? "—" : `${signed && x > 0 ? "+" : ""}${(x * 100).toFixed(Math.abs(x) < 0.1 ? 1 : 0)}%`);
const share = (x: number | null | undefined) => (x == null ? "—" : `${Math.round(x * 100)}%`);
const day = (d: string | Date) => new Date(d).toISOString().slice(0, 10);
// quotes come from X's API with HTML entities
const unescape = (s: string) => s.replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const tickerKey = (t: string) => t.replace(/^\$/, "").toUpperCase();
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

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
  const calls = ((f?.calls ?? []) as unknown as FileCall[]).map((c) => ({ ...c, called_at: String(c.called_at), quote: unescape(c.quote ?? "") }));
  const stats = f?.stats ?? null;
  const priced = new Map(((stats?.per_call ?? []) as PerCall[]).filter((p) => p.price_at_call != null).map((p) => [p.post_id, p]));

  const chart: ChartCall[] = calls
    .filter((c) => priced.has(c.post_id))
    .map((c) => {
      const p = priced.get(c.post_id)!;
      return { t: new Date(c.called_at).getTime(), ticker: tickerKey(c.ticker), dir: c.direction, post: c.post_id, quote: c.quote.slice(0, 180), r7: p.r_7d, r30: p.r_30d };
    });

  // most-called coins
  const groups = new Map<string, FileCall[]>();
  for (const c of calls) groups.set(tickerKey(c.ticker), [...(groups.get(tickerKey(c.ticker)) ?? []), c]);
  const top = [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([k, cs]) => {
      const r30 = cs.map((c) => priced.get(c.post_id)?.r_30d).filter((x): x is number => x != null);
      const n = { buy: 0, sell: 0, hold: 0 };
      for (const c of cs) n[c.direction]++;
      const sorted = [...cs].sort((a, b) => a.called_at.localeCompare(b.called_at));
      return { k, total: cs.length, ...n, first: sorted[0].called_at, last: sorted[sorted.length - 1].called_at, n30: r30.length, hit30: r30.length ? r30.filter((x) => x > 0).length / r30.length : null, med30: median(r30) };
    });

  const latest = [...calls].sort((a, b) => b.called_at.localeCompare(a.called_at)).slice(0, 12);
  const rules = f ? ruleHighlights(f.rules) : [];
  const h7 = stats?.horizons["7d"];
  const h30 = stats?.horizons["30d"];
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

      {/* numbers */}
      <section className="mt-12 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Calls on record", stats ? formatCount(stats.calls_total) : formatCount(calls.length), stats ? `${formatCount(stats.calls_priced)} with price history` : "not priced yet"],
          ["Worked after 7 days", share(h7?.hit_rate), h7?.n ? `median move ${pct(h7.median_return, true)} · n=${h7.n}` : "no data"],
          ["Worked after 30 days", share(h30?.hit_rate), h30?.n ? `median move ${pct(h30.median_return, true)} · n=${h30.n}` : "no data"],
          ["Median hold", stats?.median_hold_days != null ? `${stats.median_hold_days}d` : "—", stats?.hold_pairs ? `buy → sell, ${stats.hold_pairs} pairs` : "no buy → sell pairs"],
        ].map(([label, value, sub]) => (
          <div key={label} className="rounded-panel border border-line bg-panel p-4">
            <p className="label-mono">{label}</p>
            <p className="mt-2 font-pixel text-h3 text-ceramic">{value}</p>
            <p className="mt-1 font-pixel text-xs text-muted">{sub}</p>
          </div>
        ))}
      </section>

      {/* every priced call */}
      <section className="mt-12">
        <h2 className="text-h3">Every call, priced</h2>
        <p className="mt-2 text-sm text-particle">
          Calls @{it.handle} made in public posts on X — bought, sold, holding — found by the brain build and priced by code from DefiLlama. Not what the AI says on this site.
          {stats && stats.calls_total > stats.calls_priced ? ` ${formatCount(stats.calls_total - stats.calls_priced)} calls have no price history (mostly small memecoins) and aren't counted.` : ""}
        </p>
        <div className="mt-5 rounded-panel border border-line bg-panel p-4 sm:p-5">
          <CallsChart calls={chart} handle={it.handle} />
        </div>
      </section>

      {/* most-called coins */}
      {top.length > 0 && (
        <section className="mt-12">
          <h2 className="text-h3">Most-called coins</h2>
          <div className="mt-5 overflow-x-auto rounded-panel border border-line" data-lenis-prevent>
            <table className="w-full min-w-[640px] text-left font-pixel text-xs">
              <thead className="text-muted">
                <tr className="border-b border-line">
                  <th className="px-3 py-2.5 font-normal">Coin</th>
                  <th className="px-3 py-2.5 text-right font-normal">Calls</th>
                  <th className="px-3 py-2.5 font-normal">Buy · sell · hold</th>
                  <th className="px-3 py-2.5 font-normal">First → last</th>
                  <th className="px-3 py-2.5 text-right font-normal">Worked 30d</th>
                  <th className="px-3 py-2.5 text-right font-normal">Median 30d</th>
                </tr>
              </thead>
              <tbody className="text-particle">
                {top.map((t) => (
                  <tr key={t.k} className="border-b border-line last:border-0">
                    <td className="px-3 py-2.5 text-ceramic">${t.k}</td>
                    <td className="px-3 py-2.5 text-right">{t.total}</td>
                    <td className="px-3 py-2.5">
                      {t.buy} · {t.sell} · {t.hold}
                    </td>
                    <td className="px-3 py-2.5 text-muted">
                      {day(t.first)} → {day(t.last)}
                    </td>
                    <td className="px-3 py-2.5 text-right">{t.n30 ? `${share(t.hit30)} of ${t.n30}` : <span className="text-muted">no price</span>}</td>
                    <td className="px-3 py-2.5 text-right">{t.n30 ? pct(t.med30, true) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="mt-12 grid gap-12 lg:grid-cols-[1.4fr_1fr]">
        {/* latest calls */}
        <section>
          <h2 className="text-h3">Latest calls</h2>
          {latest.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No explicit calls found in the posts.</p>
          ) : (
            <ul className="mt-5 divide-y divide-line rounded-panel border border-line">
              {latest.map((c) => {
                const p = priced.get(c.post_id);
                return (
                  <li key={c.post_id + c.ticker} className="p-4">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-pixel text-xs">
                      <DirChip dir={c.direction} />
                      <span className="text-ceramic">${tickerKey(c.ticker)}</span>
                      <span className="text-muted">{day(c.called_at)}</span>
                      {p?.r_30d != null ? (
                        <span className="text-particle">30d {pct(p.r_30d, true)}</span>
                      ) : p?.r_7d != null ? (
                        <span className="text-particle">7d {pct(p.r_7d, true)}</span>
                      ) : null}
                      <a href={`https://x.com/${it.handle}/status/${c.post_id}`} target="_blank" rel="noreferrer" className="link-quiet ml-auto" aria-label="Open the post on X">
                        <span className="arrow">↗</span>
                      </a>
                    </div>
                    <p className="mt-2 text-sm text-particle">“{c.quote}”</p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* rules */}
        {rules.length > 0 && (
          <section>
            <h2 className="text-h3">Their rules</h2>
            <p className="mt-2 text-sm text-particle">The first rule of each kind, in short. All of them are in the brain.</p>
            <dl className="mt-5 space-y-4">
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

function DirChip({ dir }: { dir: "buy" | "sell" | "hold" }) {
  const color = dir === "buy" ? "var(--ii-verdict-buy)" : dir === "sell" ? "var(--ii-verdict-sell)" : "var(--ii-ceramic)";
  return (
    <span className="inline-flex h-6 items-center rounded-pill border px-2.5 font-mono text-xs tracking-[0.08em]" style={{ color, borderColor: dir === "hold" ? "var(--ii-line-hover)" : `color-mix(in srgb, ${color} 45%, transparent)` }}>
      {dir.toUpperCase()}
    </span>
  );
}

/** "## Entry\n- Buy when … "quote" (post:…)" → [{ kind: "Entry", rule: "Buy when …" }], first rule of each section. */
function ruleHighlights(md: string): { kind: string; rule: string }[] {
  const out: { kind: string; rule: string }[] = [];
  for (const part of md.split(/\n(?=##\s)/)) {
    const head = part.match(/^##\s+(.+)$/m)?.[1]?.trim();
    const first = part.match(/^\s*[-*]\s+(.+)$/m)?.[1];
    if (!head || !first) continue;
    const rule = first
      .replace(/\s*\((?:post:[^)]*)\)/g, "")
      .replace(/\s*["“][^"”]*["”]\s*$/, "")
      .replace(/\s*["“].*$/, "")
      .replace(/[\s:;,—-]+$/, "")
      .trim();
    if (rule) out.push({ kind: head, rule });
    if (out.length >= 6) break;
  }
  return out;
}
