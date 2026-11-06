"use client";

import { useState } from "react";

import { useAuth } from "@/components/account/AuthProvider";
import { TypingIndicator, VerdictChip } from "@/components/chat/bits";
import { AppLink } from "@/components/ui/AppLink";
import type { Reference } from "@/lib/server/data";
import type { TokenInfo } from "@/lib/server/token";
import type { BagResult, CheckResult, CoinRecord, Holding, PlanLine } from "@/lib/server/tools";
import { money, share, signed } from "@/lib/record";

type Mode = "check" | "bag";
type Mind = { handle: string; code: string; color: string };
type Failure = { error: string; reason?: string };

/**
 * The app's tools. Check a coin: paste any coin and the mind says whether it
 * would buy it, and how it would play it. Rate my bag: your holdings, coin by
 * coin, the way the mind manages its own. Live data from code; the judgement
 * is one model call in the mind's voice, checked against its brain.
 */
export function Tools({ mode, mind, examples }: { mode: Mode; mind: Mind; examples: string[] }) {
  return (
    <div data-lenis-prevent className="min-h-0 flex-1 overflow-y-auto px-gutter py-6 lg:px-8">
      <div className="mx-auto grid max-w-[720px] gap-6">{mode === "check" ? <CheckCoin mind={mind} examples={examples} /> : <RateBag mind={mind} examples={examples} />}</div>
    </div>
  );
}

async function post<T>(url: string, body: unknown): Promise<T | Failure> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (!r) return { error: "Connection dropped. Try again." };
  const j = await r.json().catch(() => ({ error: "Something went wrong. Try again." }));
  return r.ok ? (j as T) : (j as Failure);
}

/* ───────────────────────── Check a coin ───────────────────────── */

type CheckReply = { token: TokenInfo; record: CoinRecord; result: CheckResult; usedPct: number | null };

function CheckCoin({ mind, examples }: { mind: Mind; examples: string[] }) {
  const auth = useAuth();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [res, setRes] = useState<CheckReply | Failure | null>(null);

  const run = async (text: string) => {
    const v = text.trim();
    if (!v || busy) return;
    setQ(v);
    setBusy(v);
    setRes(null);
    const r = await post<CheckReply>("/api/tools/check", { handle: mind.handle, q: v });
    setRes(r);
    setBusy(null);
    if ("reason" in r && r.reason === "login") auth.askLogin();
    else auth.refresh();
  };

  return (
    <>
      <div>
        <form
          className="flex items-center gap-2 rounded-input border border-line bg-panel p-1.5 focus-within:border-line-hover"
          onSubmit={(e) => {
            e.preventDefault();
            void run(q);
          }}
        >
          <label htmlFor="check-q" className="sr-only">
            Ticker, contract address or link
          </label>
          <input
            id="check-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="$TICKER, contract address or a DexScreener link"
            maxLength={300}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent px-2 py-2 text-body placeholder:text-muted focus:outline-none"
          />
          <button type="submit" disabled={!q.trim() || !!busy} className="btn-ceramic h-10 shrink-0 px-4 text-xs disabled:opacity-40">
            Check
          </button>
        </form>
        <p className="mt-2 font-pixel text-[11px] text-muted">Any coin, called or not: a ticker, a contract address, or a DexScreener, pump.fun, Birdeye or GMGN link. Uses part of your session, like an answer in chat.</p>
        {examples.length > 0 && !res && !busy && (
          <div className="mt-3 flex flex-wrap gap-2">
            {examples.map((t) => (
              <button key={t} type="button" onClick={() => void run(`$${t}`)} className="rounded-chip border border-line px-3 py-1.5 font-pixel text-xs text-particle transition-colors duration-fast hover:border-line-hover hover:text-ceramic">
                ${t}
              </button>
            ))}
          </div>
        )}
      </div>

      {busy && <Working text={`@${mind.handle} is looking at ${busy.length > 18 ? `${busy.slice(0, 6)}…${busy.slice(-4)}` : busy}…`} />}
      {res && "error" in res && <p className="text-sm text-muted">{res.error}</p>}
      {res && "token" in res && (
        <>
          <TokenCard t={res.token} />
          <Take mind={mind} title={`Would @${mind.handle} buy $${res.token.symbol}?`} meter={res.result.fit} meterLabel={`fits my style ${res.result.fit}/10`} verdict={res.result.verdict} usedPct={res.usedPct}>
            <p className="text-body text-ceramic">{res.result.take}</p>
            {res.result.why.length > 0 && (
              <Block label="Why, from my posts">
                <ul className="grid gap-2">
                  {res.result.why.map((w, i) => (
                    <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 border-b border-line pb-2 text-sm text-particle last:border-0 last:pb-0">
                      <span>{w.point}</span>
                      <RefLink refs={res.result.refs} n={w.ref} />
                    </li>
                  ))}
                </ul>
              </Block>
            )}
            <Block label={`My record on $${res.token.symbol}`}>
              <RecordLine r={res.record} />
            </Block>
            {res.result.plan.length > 0 && (
              <Block label="If you still want it, how I'd play it">
                <Plan lines={res.result.plan} />
              </Block>
            )}
            {res.result.similar.length > 0 && (
              <Block label="Closest coins in my record">
                <div className="flex flex-wrap gap-2">
                  {res.result.similar.map((s) => (
                    <AppLink key={s.ticker} href={`/coin/${encodeURIComponent(s.ticker)}`} className="rounded-chip border border-line px-3 py-1.5 font-pixel text-xs transition-colors duration-fast hover:border-line-hover">
                      ${s.ticker}
                      <span className="ml-2 text-muted">
                        {s.n} calls{s.w7 != null ? ` · ${share(s.w7)}` : ""}
                      </span>
                    </AppLink>
                  ))}
                </div>
              </Block>
            )}
          </Take>
        </>
      )}
    </>
  );
}

/* ───────────────────────── Rate my bag ───────────────────────── */

type BagReply = { holdings: Holding[]; records: Record<string, CoinRecord>; result: BagResult; usedPct: number | null };

/** "SOL 40", "$WIF 25%", a bare contract address, one per line (or comma-separated). */
function parseBag(raw: string) {
  return raw
    .split(/[\n,;]+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^(\S+)\s*[:\s]\s*([\d.]+)\s*%?$/) ?? l.match(/^(\S+)$/);
      return m ? { q: m[1], share: m[2] ? parseFloat(m[2]) : null } : null;
    })
    .filter((x): x is { q: string; share: number | null } => !!x)
    .slice(0, 8);
}

function RateBag({ mind, examples }: { mind: Mind; examples: string[] }) {
  const auth = useAuth();
  const [bag, setBag] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<BagReply | Failure | null>(null);
  const items = parseBag(bag);

  const run = async () => {
    if (!items.length || busy) return;
    setBusy(true);
    setRes(null);
    const r = await post<BagReply>("/api/tools/bag", { handle: mind.handle, holdings: items });
    setRes(r);
    setBusy(false);
    if ("reason" in r && r.reason === "login") auth.askLogin();
    else auth.refresh();
  };

  return (
    <>
      <div>
        <form
          className="flex items-end gap-2 rounded-input border border-line bg-panel p-1.5 focus-within:border-line-hover"
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
        >
          <label htmlFor="bag-input" className="sr-only">
            Your holdings
          </label>
          <textarea
            id="bag-input"
            value={bag}
            onChange={(e) => setBag(e.target.value)}
            rows={4}
            placeholder={`One coin per line with its share\n${examples[0] ?? "SOL"} 40\n${examples[1] ?? "BTC"} 35\n${examples[2] ?? "WIF"} 25`}
            className="min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-body placeholder:text-muted focus:outline-none"
          />
          <button type="submit" disabled={!items.length || busy} className="btn-ceramic h-10 shrink-0 px-4 text-xs disabled:opacity-40">
            Rate it
          </button>
        </form>
        <p className="mt-2 font-pixel text-[11px] text-muted">Up to 8 coins: tickers or contract addresses, share in % (coins without one split the rest). Uses part of your session.</p>
      </div>

      {busy && <Working text={`@${mind.handle} is going through your bag…`} />}
      {res && "error" in res && <p className="text-sm text-muted">{res.error}</p>}
      {res && "result" in res && (
        <Take mind={mind} title={`Your bag, my way · ${res.result.rows.length} ${res.result.rows.length === 1 ? "coin" : "coins"}`} meter={res.result.score} meterLabel={`${res.result.score}/10`} usedPct={res.usedPct}>
          <p className="text-body text-ceramic">{res.result.summary}</p>
          <div className="overflow-x-auto" data-lenis-prevent>
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="font-pixel text-[11px] text-muted">
                <tr className="border-b border-line">
                  <th className="py-2 pr-3 font-normal">Coin</th>
                  <th className="py-2 pr-3 text-right font-normal">Share</th>
                  <th className="py-2 pr-3 text-right font-normal">24h</th>
                  <th className="py-2 pr-3 font-normal">My record</th>
                  <th className="py-2 pr-3 font-normal">Do</th>
                  <th className="py-2 font-normal">Why</th>
                </tr>
              </thead>
              <tbody>
                {res.result.rows.map((r) => {
                  const t = res.holdings.find((h) => (h.token?.symbol ?? "") === r.ticker)?.token ?? null;
                  const rec = res.records[r.ticker];
                  return (
                    <tr key={r.ticker} className="border-b border-line align-top last:border-0">
                      <td className="py-2.5 pr-3 font-pixel">
                        <AppLink href={`/coin/${encodeURIComponent(r.ticker)}`} className="hover:underline">
                          ${r.ticker}
                        </AppLink>
                      </td>
                      <td className="py-2.5 pr-3 text-right font-pixel tabular-nums">{Math.round(r.share * 100)}%</td>
                      <td className={`py-2.5 pr-3 text-right font-pixel tabular-nums ${t?.change24h != null && t.change24h >= 0 ? "text-ceramic" : "text-muted"}`}>
                        {t?.change24h != null ? `${t.change24h >= 0 ? "+" : "−"}${Math.abs(t.change24h).toFixed(1)}%` : "—"}
                      </td>
                      <td className="py-2.5 pr-3 font-pixel text-[11px] text-particle">{rec?.n ? `${rec.n} calls${rec.n7 ? ` · ${share(rec.w7)}` : ""} · last ${rec.last?.dir.toUpperCase()} ${rec.last?.at}` : "never called"}</td>
                      <td className="py-2.5 pr-3">
                        <Action a={r.action} />
                      </td>
                      <td className="py-2.5 text-particle">
                        {r.why} <RefLink refs={res.result.refs} n={r.ref} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {res.result.changes.length > 0 && (
            <Block label="What I'd change">
              <Plan lines={res.result.changes} />
            </Block>
          )}
          {res.holdings.some((h) => !h.token) && (
            <p className="font-pixel text-[11px] text-muted">
              No live data for {res.holdings.filter((h) => !h.token).map((h) => h.q).join(", ")}: try a contract address.
            </p>
          )}
        </Take>
      )}
    </>
  );
}

/* ───────────────────────── pieces ───────────────────────── */

function Working({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-2 font-pixel text-xs text-muted">
      <TypingIndicator /> {text}
    </p>
  );
}

export const pct = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(Math.abs(x) < 0.1 ? 1 : 0)}%`;
export const usd = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}k` : `$${n.toFixed(0)}`);
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

export function TokenCard({ t }: { t: TokenInfo }) {
  const [copied, setCopied] = useState(false);
  const [noImg, setNoImg] = useState(false);
  const age = t.listedAt ? Math.max(0, (Date.now() - Date.parse(t.listedAt)) / 864e5) : null;
  const stats = [
    t.mcap ? ["Market cap", usd(t.mcap), null] : null,
    t.top ? ["From the top", pct(t.price / t.top.price - 1), `top ${money(t.top.price)} · ${t.top.at}`] : null,
    t.change1y != null ? ["1 year", pct(t.change1y), null] : null,
    t.liquidity ? ["DEX liquidity", usd(t.liquidity), t.volume24h ? `24h volume ${usd(t.volume24h)}` : null] : null,
    age != null ? ["Age", age >= 365 ? `${Math.floor(age / 365)}y ${Math.floor((age % 365) / 30)}m` : age >= 30 ? `${Math.floor(age / 30)}m` : `${Math.floor(age)}d`, `since ${t.listedAt!.slice(0, 10)}`] : null,
  ].filter((x): x is [string, string, string | null] => !!x).slice(0, 4);
  return (
    <div className="rounded-panel border border-line bg-panel">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        {t.image && !noImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.image} alt="" width={36} height={36} referrerPolicy="no-referrer" onError={() => setNoImg(true)} className="h-9 w-9 shrink-0 object-cover" />
        ) : (
          <span className="grid h-9 w-9 shrink-0 place-items-center bg-line font-pixel text-sm text-ceramic">{t.symbol.slice(0, 1)}</span>
        )}
        <div className="min-w-0">
          <p className="font-pixel text-body">${t.symbol}</p>
          <p className="truncate font-pixel text-[11px] text-muted">
            {[t.name, t.chain].filter(Boolean).join(" · ")}
            {t.address && (
              <>
                {" · "}
                <button
                  type="button"
                  title="Copy the contract address"
                  onClick={() => {
                    navigator.clipboard?.writeText(t.address!).then(() => setCopied(true), () => {});
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  className="hover:text-ceramic"
                >
                  {copied ? "copied" : short(t.address)}
                </button>
              </>
            )}
            {t.links.map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="ml-2 hover:text-ceramic">
                {l.label}
              </a>
            ))}
          </p>
        </div>
        <div className="ml-auto shrink-0 text-right font-pixel tabular-nums">
          <p className="text-body">{money(t.price)}</p>
          {t.change24h != null && <p className={`text-[11px] ${t.change24h >= 0 ? "text-ceramic" : "text-muted"}`}>{`${t.change24h >= 0 ? "+" : "−"}${Math.abs(t.change24h).toFixed(1)}%`} 24h</p>}
        </div>
      </div>
      {stats.length > 0 && (
        <dl className="grid grid-cols-2 sm:grid-cols-4">
          {stats.map(([label, value, sub], i) => (
            <div key={label} className={`px-4 py-3 ${i % 2 ? "border-l border-line" : ""} ${i >= 2 ? "border-t border-line sm:border-t-0" : ""} ${i === 2 ? "sm:border-l" : ""}`}>
              <dt className="font-pixel text-[11px] text-muted">{label}</dt>
              <dd className="mt-0.5 font-pixel text-h3 tabular-nums">{value}</dd>
              {sub && <dd className="font-pixel text-[10px] text-muted">{sub}</dd>}
            </div>
          ))}
        </dl>
      )}
      {t.safety && (
        <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3 font-pixel text-[11px]">
          {t.safety.risks.length === 0 ? (
            <span className="border border-line-hover px-2 py-0.5 text-particle">
              <span style={{ color: "var(--ii-verdict-buy)" }}>✓</span> RugCheck: no risks flagged
            </span>
          ) : (
            t.safety.risks.map((r) => (
              <span key={r.name} className="border border-line-hover px-2 py-0.5 text-particle">
                <span style={{ color: r.level === "danger" ? "var(--ii-verdict-sell)" : "var(--ii-particle)" }}>!</span> {r.name}
              </span>
            ))
          )}
        </div>
      )}
      <p className="border-t border-line px-4 py-2 font-pixel text-[10px] text-muted">
        Live · {t.source}
        {t.top || t.change1y != null ? ", DefiLlama" : ""}
        {t.safety ? ", RugCheck" : ""}
      </p>
    </div>
  );
}

function Take({ mind, title, meter, meterLabel, verdict, usedPct, children }: { mind: Mind; title: string; meter: number; meterLabel: string; verdict?: CheckResult["verdict"]; usedPct: number | null; children: React.ReactNode }) {
  return (
    <section className="rounded-panel border border-line-hover bg-panel">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3">
        <span className="font-mono text-xs" style={{ color: mind.color }}>
          {mind.code}
        </span>
        <h3 className="font-pixel text-sm">{title}</h3>
        <span className="flex items-center gap-[3px]" aria-label={meterLabel}>
          {Array.from({ length: 10 }, (_, i) => (
            <i key={i} className="inline-block h-2.5 w-2.5" style={{ background: i < meter ? mind.color : "var(--ii-line-hover)" }} />
          ))}
        </span>
        <span className="font-pixel text-[11px] text-muted">{meterLabel}</span>
        {verdict && (
          <span className="ml-auto">
            <VerdictChip verdict={verdict} />
          </span>
        )}
      </header>
      <div className="grid gap-5 px-4 py-4">{children}</div>
      <footer className="flex flex-wrap justify-between gap-2 border-t border-line px-4 py-2 font-pixel text-[10px] text-muted">
        <span>{usedPct != null ? `Used ${usedPct}% of your session` : ""}</span>
        <span>@{mind.handle}&apos;s AI brain, from public posts · not financial advice</span>
      </footer>
    </section>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 font-pixel text-[11px] text-muted">{label}</p>
      {children}
    </div>
  );
}

function Plan({ lines }: { lines: PlanLine[] }) {
  return (
    <dl className="grid">
      {lines.map((p, i) => (
        <div key={i} className={`grid grid-cols-[96px_minmax(0,1fr)] gap-3 py-2 ${i ? "border-t border-line" : "pt-0"}`}>
          <dt className="font-pixel text-xs text-muted">{p.label}</dt>
          <dd className="text-sm">
            {p.text}
            {p.rule && <span className="mt-1 block font-pixel text-[10px] text-muted">from my rules: “{p.rule}”</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function RecordLine({ r }: { r: CoinRecord }) {
  if (!r.n) return <p className="text-sm text-particle">Never called it.</p>;
  return (
    <p className="text-sm text-particle">
      {r.n} {r.n === 1 ? "call" : "calls"} since {r.first}
      {r.n7 ? ` · worked within 7 days ${share(r.w7)} of ${r.n7} (median ${signed(r.m7)})` : ""}
      {r.last && (
        <>
          {" · last "}
          <span className="font-pixel text-xs text-ceramic">{r.last.dir.toUpperCase()}</span> {r.last.at}
          {r.last.price ? ` at ${money(r.last.price)}` : ""}
          {r.last.quote && <span className="mt-1 block italic text-muted">“{r.last.quote}”</span>}
        </>
      )}
    </p>
  );
}

function RefLink({ refs, n }: { refs: Reference[]; n: number | null }) {
  const r = n ? refs.find((x) => x.n === n) : null;
  if (!r) return null;
  return (
    <a href={r.url} target="_blank" rel="noreferrer" title={r.text ?? r.call?.quote ?? "Open the post"} className="inline-flex h-6 min-w-6 items-center justify-center rounded-chip border border-line px-1.5 font-mono text-[11px] text-particle hover:border-line-hover hover:text-ceramic">
      [{r.n}]
    </a>
  );
}

function Action({ a }: { a: "Add" | "Keep" | "Trim" | "Cut" }) {
  const color = a === "Add" ? "var(--ii-verdict-buy)" : a === "Cut" ? "var(--ii-verdict-sell)" : a === "Keep" ? "var(--ii-ceramic)" : "var(--ii-particle)";
  return (
    <span className="inline-block border px-1.5 py-0.5 font-pixel text-[10px]" style={{ color, borderColor: "currentColor" }}>
      {a}
    </span>
  );
}
