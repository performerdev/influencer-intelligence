"use client";

import { useEffect, useRef, useState } from "react";

import { VerdictChip } from "@/components/chat/bits";
import { type CallRow, type Record_, type Verdict, callsOn, isoDay, pct, record, rulesOf, signed, topCoins, verdictOf } from "@/lib/calls";

type Mode = "plan" | "bag";
type Entry = { id: number; kind: "plan"; coin: string; side: "long" | "short" } | { id: number; kind: "bag"; items: { t: string; w: number }[] };

const chipOf = (d: CallRow["dir"]) => (d === "buy" ? "BUY" : d === "sell" ? "SELL" : "HOLD") as "BUY" | "SELL" | "HOLD";
const EXAMPLE_BAG = "SOL 40\nJUP 25\nWIF 20\nETH 15";

/**
 * Trade plan and Rate my bag: answered from the mind's own written rules and its
 * priced call record, in the browser. No model call, so they're instant and
 * free, and every line points at where it came from.
 */
export function Tools({ mode, handle, rows, rules, medianHold }: { mode: Mode; handle: string; rows: CallRow[]; rules: string; medianHold: number | null }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [coin, setCoin] = useState("");
  const [side, setSide] = useState<"long" | "short">("long");
  const [bag, setBag] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  const tops = topCoins(rows, 5).map((c) => c.t);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [entries.length]);

  const runPlan = (c: string) => {
    const t = c.trim().replace(/^\$/, "").toUpperCase();
    if (!t) return;
    setEntries((e) => [...e, { id: nextId.current++, kind: "plan", coin: t, side }]);
    setCoin("");
  };
  const runBag = (raw: string) => {
    const items = parseBag(raw);
    if (!items.length) return;
    setEntries((e) => [...e, { id: nextId.current++, kind: "bag", items }]);
    setBag("");
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div ref={scroller} data-lenis-prevent className="min-h-0 flex-1 overflow-y-auto px-gutter lg:px-8">
        <div className="mx-auto grid max-w-[760px] gap-6 py-8">
          {entries.length === 0 && (
            <div className="py-6">
              <p className="font-pixel text-xs text-muted">{mode === "plan" ? "Trade plan" : "Rate my bag"}</p>
              <h2 className="mt-2 font-pixel text-h2">{mode === "plan" ? `How would @${handle} trade it?` : `What would @${handle} say about your bag?`}</h2>
              <p className="mt-3 max-w-[56ch] text-body text-particle">
                {mode === "plan"
                  ? `Name a coin. You get entry, exit, size and risk the way @${handle} wrote them down, next to how @${handle}'s calls on that coin actually played out.`
                  : `Paste your holdings, one per line. Each coin is checked against @${handle}'s calls on it: backs it, against it, or no view.`}
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {mode === "plan"
                  ? tops.map((t) => (
                      <button key={t} type="button" onClick={() => runPlan(t)} className="rounded-pill border border-line px-3 py-1.5 font-pixel text-xs text-particle transition-colors duration-fast hover:border-line-hover hover:text-ceramic">
                        {t} plan
                      </button>
                    ))
                  : (
                    <button type="button" onClick={() => runBag(EXAMPLE_BAG)} className="rounded-pill border border-line px-3 py-1.5 font-pixel text-xs text-particle transition-colors duration-fast hover:border-line-hover hover:text-ceramic">
                      Try an example bag
                    </button>
                  )}
              </div>
            </div>
          )}
          {entries.map((e) => (e.kind === "plan" ? <PlanCard key={e.id} handle={handle} coin={e.coin} side={e.side} rows={rows} rules={rules} medianHold={medianHold} /> : <BagCard key={e.id} handle={handle} items={e.items} rows={rows} rules={rules} />))}
        </div>
      </div>

      <div className="border-t border-line bg-void px-gutter pb-[max(12px,env(safe-area-inset-bottom))] pt-3 lg:px-8">
        {mode === "plan" ? (
          <form
            className="mx-auto flex max-w-[760px] items-center gap-2 rounded-input border border-line bg-panel p-2 focus-within:border-line-hover"
            onSubmit={(e) => {
              e.preventDefault();
              runPlan(coin);
            }}
          >
            <label htmlFor="plan-coin" className="sr-only">Coin</label>
            <input id="plan-coin" value={coin} onChange={(e) => setCoin(e.target.value)} maxLength={16} placeholder="Coin, e.g. SOL" autoComplete="off" className="min-w-0 flex-1 bg-transparent px-2 py-2 text-body placeholder:text-muted focus:outline-none" />
            <div className="flex border border-line" role="group" aria-label="Side">
              {(["long", "short"] as const).map((s) => (
                <button key={s} type="button" aria-pressed={side === s} onClick={() => setSide(s)} className={`px-3 py-1.5 font-pixel text-xs capitalize ${side === s ? "bg-particle text-void" : "text-muted hover:text-ceramic"}`}>
                  {s}
                </button>
              ))}
            </div>
            <button type="submit" disabled={!coin.trim()} className="btn-ceramic h-10 shrink-0 px-4 disabled:opacity-40">
              Build plan
            </button>
          </form>
        ) : (
          <form
            className="mx-auto flex max-w-[760px] items-end gap-2 rounded-input border border-line bg-panel p-2 focus-within:border-line-hover"
            onSubmit={(e) => {
              e.preventDefault();
              runBag(bag);
            }}
          >
            <label htmlFor="bag-input" className="sr-only">Your holdings</label>
            <textarea id="bag-input" value={bag} onChange={(e) => setBag(e.target.value)} rows={3} placeholder={"One coin per line, share optional\nSOL 40\nJUP 25"} className="min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-body placeholder:text-muted focus:outline-none" />
            <button type="submit" disabled={!bag.trim()} className="btn-ceramic h-10 shrink-0 px-4 disabled:opacity-40">
              Rate it
            </button>
          </form>
        )}
        <p className="mx-auto mt-2 max-w-[760px] font-pixel text-[11px] text-muted">
          {mode === "plan" ? "From @" + handle + "'s rules and priced calls. Instant, doesn't use your session." : "From @" + handle + "'s priced calls. Instant, doesn't use your session."} Not financial advice.
        </p>
      </div>
    </div>
  );
}

function Card({ title, by, children, foot }: { title: string; by: string; children: React.ReactNode; foot: string }) {
  return (
    <article className="rounded-card border border-line bg-panel">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h3 className="font-pixel text-sm">{title}</h3>
        <span className="font-pixel text-[11px] text-muted">{by}</span>
      </header>
      <div className="grid gap-4 px-4 py-4">{children}</div>
      <footer className="flex flex-wrap justify-between gap-2 border-t border-line px-4 py-2.5 font-pixel text-[11px] text-muted">
        <span>{foot}</span>
        <span>Not financial advice</span>
      </footer>
    </article>
  );
}

function RecordStrip({ coin, r }: { coin: string; r: Record_ }) {
  return (
    <dl className="grid grid-cols-2 border border-line sm:grid-cols-4">
      {[
        [`Calls on ${coin}`, String(r.n)],
        ["Worked in 7d", pct(r.worked)],
        ["Median 7d", signed(r.med)],
      ].map(([k, v], i) => (
        <div key={k} className={`grid gap-1 p-3 ${i % 2 ? "border-l border-line" : ""} ${i > 0 && i < 3 ? "sm:border-l sm:border-line" : ""} ${i >= 2 ? "border-t border-line sm:border-t-0" : ""}`}>
          <dt className="font-pixel text-[11px] text-muted">{k}</dt>
          <dd className="font-pixel text-h3 tabular-nums">{v}</dd>
        </div>
      ))}
      <div className="grid gap-1 border-l border-t border-line p-3 sm:border-t-0">
        <dt className="font-pixel text-[11px] text-muted">Last call</dt>
        <dd className="flex items-center gap-2">
          {r.last ? (
            <>
              <span className="origin-left scale-90">
                <VerdictChip verdict={chipOf(r.last.dir)} />
              </span>
              <span className="font-pixel text-[11px] text-muted tabular-nums">{isoDay(r.last.at)}</span>
            </>
          ) : (
            <span className="font-pixel text-h3">—</span>
          )}
        </dd>
      </div>
    </dl>
  );
}

function PlanCard({ handle, coin, side, rows, rules, medianHold }: { handle: string; coin: string; side: "long" | "short"; rows: CallRow[]; rules: string; medianHold: number | null }) {
  const cs = callsOn(rows, coin);
  const r = record(cs);
  const last = r.last;
  let warn: string | null = null;
  if (!cs.length) warn = `@${handle} never called ${coin}. The plan below is the general rules only.`;
  else if (last && last.dir === "sell" && side === "long") warn = `The last call on ${coin} was SELL on ${isoDay(last.at)}. A long here goes against @${handle}.`;
  else if (last && last.dir !== "sell" && side === "short") warn = `The last call on ${coin} was ${last.dir.toUpperCase()} on ${isoDay(last.at)}. A short here goes against @${handle}.`;
  const lines: [string, string, string, string?][] = [
    ["Entry", "entry", "Entry"],
    ["Exit", "exit", "Exit and taking profit"],
    ["Size", "sizing", "Sizing"],
    ["Risk", "risk", "Risk management"],
    ["Hold", "hold", "Hold time", medianHold != null ? `Median hold across all calls: ${Math.round(medianHold)} days.` : undefined],
  ];
  const recent = cs.slice(-5).reverse();
  return (
    <Card title={`Trade plan · ${coin} · ${side === "long" ? "Long" : "Short"}`} by={`by @${handle}'s rules`} foot={`Rules written from @${handle}'s posts · returns priced by code`}>
      <RecordStrip coin={coin} r={r} />
      {warn && (
        <p className="flex gap-3 border border-line-hover px-3 py-2.5 text-sm text-particle">
          <span className="shrink-0 font-pixel text-ceramic">{cs.length ? "Against" : "No record"}</span>
          {warn}
        </p>
      )}
      <dl className="grid">
        {lines.map(([k, sec, src, extra], i) => {
          const list = rulesOf(rules, sec, sec === "hold" ? 1 : 2);
          return (
            <div key={k} className={`grid grid-cols-[72px_minmax(0,1fr)] gap-4 py-3 sm:grid-cols-[88px_minmax(0,1fr)] ${i ? "border-t border-line" : "pt-0"}`}>
              <dt className="pt-0.5 font-pixel text-xs text-muted">{k}</dt>
              <dd className="text-sm">
                {list.length ? (
                  <ul className="grid list-disc gap-1 pl-4 marker:text-muted">
                    {list.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-muted">No written rule for this.</span>
                )}
                {extra && <span className="mt-1 block text-xs text-particle">{extra}</span>}
                <span className="mt-1 block font-pixel text-[10px] text-muted">rules.md → {src}</span>
              </dd>
            </div>
          );
        })}
      </dl>
      {recent.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="font-pixel text-[11px] text-muted">
                <th className="py-1.5 text-left font-normal">Date</th>
                <th className="py-1.5 text-left font-normal">Call</th>
                <th className="py-1.5 text-right font-normal">7 days</th>
                <th className="py-1.5 text-right font-normal">30 days</th>
                <th />
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {recent.map((c) => (
                <tr key={c.postId} className="border-t border-line">
                  <td className="whitespace-nowrap py-2">{isoDay(c.at)}</td>
                  <td className="py-2">
                    <span className="inline-block origin-left scale-90">
                      <VerdictChip verdict={chipOf(c.dir)} />
                    </span>
                  </td>
                  <td className={`py-2 text-right ${c.r7 != null && c.r7 > 0 ? "text-ceramic" : "text-muted"}`}>{signed(c.r7)}</td>
                  <td className={`py-2 text-right ${c.r30 != null && c.r30 > 0 ? "text-ceramic" : "text-muted"}`}>{signed(c.r30)}</td>
                  <td className="py-2 text-right">
                    <a href={`https://x.com/${encodeURIComponent(handle)}/status/${c.postId}`} target="_blank" rel="noreferrer" className="link-quiet text-xs">
                      Post <span className="arrow">↗</span>
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

const TONE: Record<Verdict["tone"], string> = { buy: "var(--ii-verdict-buy)", sell: "var(--ii-verdict-sell)", hold: "var(--ii-particle)", none: "var(--ii-muted)" };

function BagCard({ handle, items, rows, rules }: { handle: string; items: { t: string; w: number }[]; rows: CallRow[]; rules: string }) {
  const rated = items.map((x) => {
    const r = record(callsOn(rows, x.t));
    return { ...x, r, v: verdictOf(r) };
  });
  const backed = rated.filter((x) => x.v.tone === "buy");
  const against = rated.filter((x) => x.v.tone === "sell");
  const top = [...rated].sort((a, b) => b.w - a.w)[0];
  const sizing = rulesOf(rules, "sizing", 1)[0];
  return (
    <Card title={`Rate my bag · ${rated.length} coins`} by={`by @${handle}'s record`} foot="Last call SELL → Against · worked ≥ 50% → Backs it · never called → No view">
      <p className="text-sm text-particle">
        <b className="font-medium text-ceramic">
          {backed.length} of {rated.length}
        </b>{" "}
        backed by @{handle}&apos;s calls
        {against.length > 0 && (
          <>
            , <b className="font-medium text-ceramic">{against.length}</b> against ({against.map((x) => x.t).join(", ")})
          </>
        )}
        .{top && top.w >= 35 && sizing ? ` ${top.t} is ${top.w.toFixed(0)}% of the bag; the sizing rule: “${sizing}.”` : ""}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="font-pixel text-[11px] text-muted">
              <th className="py-1.5 text-left font-normal">Coin</th>
              <th className="py-1.5 text-right font-normal">Share</th>
              <th className="py-1.5 text-right font-normal">Calls</th>
              <th className="py-1.5 text-right font-normal">Worked 7d</th>
              <th className="py-1.5 pl-3 text-left font-normal">Verdict</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rated.map((x) => (
              <tr key={x.t} className="border-t border-line align-top">
                <td className="py-2">
                  <span className="font-pixel">{x.t}</span>
                  <span className="block text-xs text-particle">{x.r.last ? `Last ${x.r.last.dir.toUpperCase()} ${isoDay(x.r.last.at)} · median ${signed(x.r.med)}` : "Never called it"}</span>
                </td>
                <td className="py-2 text-right">{x.w.toFixed(0)}%</td>
                <td className="py-2 text-right">{x.r.n || "—"}</td>
                <td className="py-2 text-right">{pct(x.r.worked)}</td>
                <td className="py-2 pl-3">
                  <span className="inline-block border px-1.5 py-0.5 font-pixel text-[10px]" style={{ color: TONE[x.v.tone], borderColor: TONE[x.v.tone] }}>
                    {x.v.label}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function parseBag(raw: string) {
  const rows = raw
    .split(/[\n,;]+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^\$?([A-Za-z0-9]{2,12})\s*[:-]?\s*(\d+(?:\.\d+)?)?\s*%?$/);
      return m ? { t: m[1].toUpperCase(), w: m[2] ? parseFloat(m[2]) : NaN } : null;
    })
    .filter((r): r is { t: string; w: number } => !!r)
    .filter((r, i, a) => a.findIndex((x) => x.t === r.t) === i)
    .slice(0, 15);
  const given = rows.filter((r) => !isNaN(r.w));
  const left = Math.max(0, 100 - given.reduce((s, r) => s + r.w, 0));
  const rest = rows.length - given.length;
  rows.forEach((r) => {
    if (isNaN(r.w)) r.w = rest ? left / rest || 100 / rows.length : 0;
  });
  const total = rows.reduce((s, r) => s + r.w, 0) || 1;
  rows.forEach((r) => (r.w = (r.w / total) * 100));
  return rows;
}
