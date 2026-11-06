"use client";

import { useEffect, useState } from "react";

import { TokenCard, pct, usd } from "@/components/app/Tools";
import { CoinChart } from "@/components/coin/CoinChart";
import { AppLink } from "@/components/ui/AppLink";
import type { Card, CardCall, CoinCardData, CompareCardData, RecordCardData } from "@/lib/cards";
import { type Dir, day, money, share, signed } from "@/lib/record";

import type { BrainSection } from "./ChatView";

type Mind = { handle: string; code: string; color: string };

/* One request per card per page view; a card drawn again (scrolling, a reopened chat) reuses it. */
const cache = new Map<string, Promise<unknown>>();
// what has arrived, so a card redrawn (the answer finished streaming) shows at once instead of flashing "Loading"
const done = new Map<string, unknown>();
function load<T>(url: string): Promise<T> {
  let p = cache.get(url);
  if (!p) {
    p = fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
    p.then(
      (d) => done.set(url, d),
      () => cache.delete(url),
    );
    cache.set(url, p);
  }
  return p as Promise<T>;
}
function useCard<T>(url: string | null) {
  const [s, setS] = useState<{ url: string | null; data: T | null; failed: boolean }>(() => ({ url, data: (url && (done.get(url) as T)) || null, failed: false }));
  useEffect(() => {
    if (!url) return;
    let live = true;
    load<T>(url).then(
      (data) => live && setS({ url, data, failed: false }),
      () => live && setS({ url, data: null, failed: true }),
    );
    return () => {
      live = false;
    };
  }, [url]);
  return s.url === url ? s : { url, data: (url && (done.get(url) as T)) || null, failed: false };
}

/**
 * A card the mind placed in its answer ([[calls:WIF]] and the like, see
 * lib/cards.ts). The numbers come from the call record and live sources,
 * never from the model. A card with nothing to show is left out.
 */
export function AnswerCard({ card, mind, sections }: { card: Card; mind: Mind; sections: BrainSection[] }) {
  const api = `/api/cards/${encodeURIComponent(mind.handle)}`;
  switch (card.kind) {
    case "calls":
      return <CallsCard url={`${api}?coin=${card.ticker}`} ticker={card.ticker} mind={mind} />;
    case "coin":
      return <CoinCard url={`${api}?coin=${card.ticker}`} ticker={card.ticker} mind={mind} />;
    case "compare":
      return <CompareCard url={`${api}?compare=${card.tickers.join(",")}`} tickers={card.tickers} mind={mind} />;
    case "record":
      return <RecordCard url={`${api}?record=1`} mind={mind} />;
    case "rule":
      return <RuleCard topic={card.topic} sections={sections} mind={mind} />;
  }
}

function Frame({ title, aside, foot, children }: { title: React.ReactNode; aside?: React.ReactNode; foot?: React.ReactNode; children: React.ReactNode }) {
  return (
    <figure className="my-4 whitespace-normal rounded-panel border border-line bg-panel">
      <figcaption className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line px-4 py-2.5">
        <span className="font-pixel text-sm text-ceramic">{title}</span>
        {aside && <span className="ml-auto font-pixel text-[11px] text-muted">{aside}</span>}
      </figcaption>
      <div className="px-4 py-3">{children}</div>
      {foot && <p className="flex flex-wrap justify-between gap-2 border-t border-line px-4 py-2 font-pixel text-[10px] text-muted">{foot}</p>}
    </figure>
  );
}

function Loading({ label, h = 120 }: { label: string; h?: number }) {
  return (
    <div className="my-4 grid place-items-center rounded-panel border border-line bg-panel font-pixel text-[11px] text-muted" style={{ height: h }}>
      {label}
    </div>
  );
}

const Dot = ({ dir }: { dir: Dir }) => (
  <span className="font-pixel text-[11px]" style={{ color: dir === "buy" ? "var(--ii-verdict-buy)" : dir === "sell" ? "var(--ii-verdict-sell)" : "var(--ii-ceramic)" }}>
    {dir.toUpperCase()}
  </span>
);

const postUrl = (handle: string, id: string) => `https://x.com/${handle}/status/${id}`;

function recordLine(handle: string, calls: CardCall[], sum: CoinCardData["sum"]) {
  if (!calls.length) return `@${handle} never called it.`;
  const last = calls[calls.length - 1];
  return [
    `${calls.length} ${calls.length === 1 ? "call" : "calls"} since ${day(calls[0].t)}`,
    sum.n7 ? `worked within 7 days ${share(sum.w7)} of ${sum.n7}` : "",
    sum.n30 ? `median 30d ${signed(sum.m30)}` : "",
    `last ${last.dir.toUpperCase()} ${day(last.t)}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function CallsCard({ url, ticker, mind }: { url: string; ticker: string; mind: Mind }) {
  const { data, failed } = useCard<CoinCardData>(url);
  if (failed) return null;
  if (!data) return <Loading label={`Loading $${ticker}…`} h={300} />;
  if (!data.history.length && !data.calls.some((c) => c.price != null)) return data.token ? <CoinCard url={url} ticker={ticker} mind={mind} /> : null;
  const points = data.calls.filter((c) => c.price != null).map((c) => ({ ...c, price: c.price!, m: 0 }));
  return (
    <Frame
      title={
        <>
          ${ticker} <span className="text-muted">· my calls</span>
        </>
      }
      aside={data.token ? `${money(data.token.price)}${data.token.change24h != null ? ` · ${data.token.change24h >= 0 ? "+" : "−"}${Math.abs(data.token.change24h).toFixed(1)}% 24h` : ""}` : null}
      foot={
        <>
          <span>{recordLine(mind.handle, data.calls, data.sum)}</span>
          <AppLink href={`/coin/${ticker}`} className="hover:text-ceramic">
            All of CT on ${ticker} ↗
          </AppLink>
        </>
      }
    >
      <CoinChart compact ticker={ticker} history={data.history} calls={points} minds={[{ code: mind.code, handle: mind.handle, color: mind.color }]} />
    </Frame>
  );
}

function CoinCard({ url, ticker, mind }: { url: string; ticker: string; mind: Mind }) {
  const { data, failed } = useCard<CoinCardData>(url);
  if (failed) return null;
  if (!data) return <Loading label={`Loading $${ticker}…`} />;
  if (!data.token) return null;
  return (
    <div className="my-4 whitespace-normal">
      <TokenCard t={data.token} />
      <p className="mt-2 font-pixel text-[11px] text-muted">
        {recordLine(mind.handle, data.calls, data.sum)}
        {data.calls.length > 0 && (
          <>
            {" · "}
            <AppLink href={`/coin/${ticker}`} className="hover:text-ceramic">
              All of CT on ${ticker} ↗
            </AppLink>
          </>
        )}
      </p>
    </div>
  );
}

function CompareCard({ url, tickers, mind }: { url: string; tickers: string[]; mind: Mind }) {
  const { data, failed } = useCard<CompareCardData>(url);
  if (failed) return null;
  if (!data) return <Loading label={`Loading ${tickers.map((t) => `$${t}`).join(", ")}…`} />;
  const rows = data.rows.filter((r) => r.token || r.n);
  if (rows.length < 2) return null;
  // on a phone the mind's side stays in view; the market extras show from sm up
  const head: [string, boolean][] = [["Coin", false], ["Price", false], ["24h", false], ["Calls", false], ["Last", false], ["Worked 7d", false], ["From top", true], ["Mcap", true]];
  const wide = "hidden sm:table-cell";
  return (
    <Frame title="Side by side" aside={`@${mind.handle}'s calls · live prices`}>
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full border-collapse whitespace-nowrap font-pixel text-xs tabular-nums sm:min-w-[560px]">
          <thead>
            <tr className="text-left text-[11px] text-muted">
              {head.map(([h, extra], i) => (
                <th key={h} scope="col" className={`pb-2 pl-2 font-normal first:pl-0 ${i ? "text-right" : ""} ${extra ? wide : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ticker} className="border-t border-line">
                <th scope="row" className="py-2 text-left font-normal">
                  <AppLink href={`/coin/${r.ticker}`} className="text-ceramic hover:underline">
                    ${r.ticker}
                  </AppLink>
                </th>
                <td className="py-2 pl-2 text-right">{r.token ? money(r.token.price) : "—"}</td>
                <td className={`py-2 pl-2 text-right ${r.token?.change24h != null && r.token.change24h < 0 ? "text-muted" : ""}`}>
                  {r.token?.change24h != null ? `${r.token.change24h >= 0 ? "+" : "−"}${Math.abs(r.token.change24h).toFixed(1)}%` : "—"}
                </td>
                <td className="py-2 pl-2 text-right">{r.n || "—"}</td>
                <td className="py-2 pl-2 text-right">{r.last ? <Dot dir={r.last.dir} /> : "—"}</td>
                <td className="py-2 pl-2 text-right">{r.sum.n7 ? (
                    <>
                      {share(r.sum.w7)}
                      <span className="hidden text-muted sm:inline"> of {r.sum.n7}</span>
                    </>
                  ) : (
                    "—"
                  )}</td>
                <td className={`py-2 pl-2 text-right text-particle ${wide}`}>{r.token?.top ? pct(r.token.price / r.token.top.price - 1) : "—"}</td>
                <td className={`py-2 pl-2 text-right text-particle ${wide}`}>{r.token?.mcap ? usd(r.token.mcap) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Frame>
  );
}

function RecordCard({ url, mind }: { url: string; mind: Mind }) {
  const { data, failed } = useCard<RecordCardData>(url);
  if (failed) return null;
  if (!data) return <Loading label="Loading my record…" h={200} />;
  if (!data.n) return null;
  const tiles: [string, string, string][] = [
    ["Calls", String(data.n), `${data.priced} priced`],
    ["Worked in 7d", share(data.all.w7), `of ${data.all.n7}`],
    ["Median 7d", signed(data.all.m7), "per call"],
    ["Median 30d", signed(data.all.m30), `of ${data.all.n30}`],
  ];
  return (
    <Frame
      title={
        <>
          My track record <span className="text-muted">· all time</span>
        </>
      }
      aside={data.d30.n ? `last 30 days: ${data.d30.n} calls${data.d30.n7 ? `, ${share(data.d30.w7)} worked` : ""}` : null}
      foot={
        <>
          <span>Moves are signed in the call&apos;s favor · not financial advice</span>
          <AppLink href={`/brain/${mind.handle}`} className="hover:text-ceramic">
            Full track record ↗
          </AppLink>
        </>
      }
    >
      <dl className="-mx-4 -mt-3 grid grid-cols-2 border-b border-line sm:grid-cols-4">
        {tiles.map(([label, value, sub], i) => (
          <div key={label} className={`px-4 py-3 ${i % 2 ? "border-l border-line" : ""} ${i >= 2 ? "border-t border-line sm:border-t-0" : ""} ${i === 2 ? "sm:border-l" : ""}`}>
            <dt className="font-pixel text-[11px] text-muted">{label}</dt>
            <dd className="mt-0.5 font-pixel text-h3 tabular-nums">{value}</dd>
            <dd className="font-pixel text-[10px] text-muted">{sub}</dd>
          </div>
        ))}
      </dl>
      {data.top.length > 0 && (
        <div className="pt-3">
          <p className="mb-2 font-pixel text-[11px] text-muted">Most called</p>
          <div className="flex flex-wrap gap-2">
            {data.top.map((c) => (
              <AppLink key={c.ticker} href={`/coin/${c.ticker}`} className="border border-line px-2 py-0.5 font-pixel text-[11px] text-particle hover:border-line-hover hover:text-ceramic">
                ${c.ticker} <span className="text-muted">×{c.n}</span>
              </AppLink>
            ))}
          </div>
        </div>
      )}
      {(data.best.length > 0 || data.worst.length > 0) && (
        <ul className="mt-3 grid gap-1.5 border-t border-line pt-3 font-pixel text-xs">
          {[...data.best.map((c) => ["Best", c] as const), ...data.worst.map((c) => ["Worst", c] as const)].map(([label, c]) => (
            <li key={`${label}${c.post}${c.ticker}`} className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-baseline gap-3">
              <span className="text-[11px] text-muted">{label}</span>
              <a href={postUrl(mind.handle, c.post)} target="_blank" rel="noreferrer" className="truncate hover:text-ceramic" title={c.quote}>
                <Dot dir={c.dir} /> ${c.ticker} <span className="text-muted">{day(c.t)}</span>
                {c.price != null && <span className="text-muted"> at {money(c.price)}</span>}
              </a>
              <span className="tabular-nums" style={{ color: c.r30! >= 0 ? "var(--ii-verdict-buy)" : "var(--ii-verdict-sell)" }}>
                {signed(c.r30)} <span className="text-[10px] text-muted">30d</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Frame>
  );
}

const TOPIC: Record<string, RegExp> = { entry: /^entry/i, exit: /^exit|profit/i, sizing: /^siz/i, risk: /^risk/i, hold: /^hold/i, averaging: /^averag/i };
const TOPIC_TITLE: Record<string, string> = { entry: "Entry", exit: "Exit and taking profit", sizing: "Sizing", risk: "Risk management", hold: "Hold time", averaging: "Averaging down" };

/** "- Rule. “quote” (post:123)." → the rule, its quote and the post. */
function ruleLines(body: string) {
  return body
    .split("\n")
    .map((l) => l.replace(/^\s*[-*]\s*/, "").trim())
    .filter(Boolean)
    .map((l) => {
      const post = l.match(/post:\s*(\d{6,})/)?.[1] ?? null;
      const quote = l.match(/[“"]([^”"]{3,})[”"]/)?.[1] ?? null;
      const text = l
        .replace(/[“"][^”"]*[”"]/, "")
        .replace(/\(?\s*post:\s*\d+[^)]*\)?/g, "")
        .replace(/[\s.,:;—–-]+$/, "")
        .trim();
      return { text: text || quote || l, quote: text ? quote : null, post };
    });
}

function RuleCard({ topic, sections, mind }: { topic: string; sections: BrainSection[]; mind: Mind }) {
  const s = sections.find((x) => x.source === "rules" && TOPIC[topic]?.test(x.title));
  if (!s) return null;
  const lines = ruleLines(s.body).slice(0, 6);
  if (!lines.length) return null;
  return (
    <Frame title={`My rules · ${TOPIC_TITLE[topic] ?? s.title}`} aside="from my posts">
      <ol className="grid">
        {lines.map((l, i) => (
          <li key={i} className={`grid grid-cols-[20px_minmax(0,1fr)] gap-2 py-2 ${i ? "border-t border-line" : "pt-0"}`}>
            <span className="font-pixel text-[11px] text-muted">{i + 1}</span>
            <div className="text-sm">
              {l.text}
              {l.quote && (
                <span className="mt-1 block font-pixel text-[11px] text-muted">
                  “{l.quote}”
                  {l.post && (
                    <a href={postUrl(mind.handle, l.post)} target="_blank" rel="noreferrer" className="ml-1.5 hover:text-ceramic">
                      ↗
                    </a>
                  )}
                </span>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Frame>
  );
}
