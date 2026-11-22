"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { UsageMeter, untilText, useAuth } from "@/components/account/AuthProvider";
import { TypingIndicator, type Verdict, VerdictChip } from "@/components/chat/bits";
import { GroupAnswer } from "@/components/group/GroupView";
import { MindStack } from "@/components/home/MindStack";
import { BrainAvatar } from "@/components/particles/BrainAvatar";
import { type CoinRecord, NO_VIEW, SUMMARY_ROUND } from "@/lib/all-minds";
import type { Intelligence } from "@/lib/intelligences";
import type { Reference } from "@/lib/server/data";

type Answer = { handle: string; content: string; streaming: boolean; verdict: Verdict | null; refs: Reference[]; noView: boolean; record: CoinRecord | null; error?: string };
type Block = { id: string; question: string; routing: boolean; answers: Answer[]; summary: string | null; summing: boolean; error?: string };

export type AllHistory = { chatId: string; items: { role: "user" | "assistant"; handle: string | null; content: string; verdict: Verdict | null; refs: Reference[]; round?: number }[] };

const EXAMPLES = ["Would you buy $SOL here?", "Is the top in for this cycle?", "What are you most bullish on right now?", "How do you trade a memecoin launch?"];

/** Saved messages back into question blocks: a question, the minds' answers, the summary. */
function fromHistory(h: AllHistory | null | undefined): Block[] {
  const out: Block[] = [];
  for (const [i, m] of (h?.items ?? []).entries()) {
    if (m.role === "user") out.push({ id: `h${i}`, question: m.content, routing: false, answers: [], summary: null, summing: false });
    else if (out.length) {
      const b = out[out.length - 1];
      if (!m.handle && m.round === SUMMARY_ROUND) b.summary = m.content;
      else if (m.handle) b.answers.push({ handle: m.handle, content: m.content === NO_VIEW ? "" : m.content, streaming: false, verdict: m.verdict, refs: m.refs ?? [], noView: m.content === NO_VIEW, record: null });
    }
  }
  return out;
}

/**
 * "All minds": one question to every mind. The minds that called the coin in it
 * (or, for anything else, the ones whose focus fits) answer side by side, each in
 * its own voice and with its own record on that coin; a short summary says where
 * they agree and where they split. Minds with nothing on it say so and step back.
 */
export function AllMinds({
  minds,
  history,
  onChat,
  onContinue,
}: {
  minds: Intelligence[];
  history?: AllHistory | null;
  onChat?: (id: string, title: string) => void;
  onContinue?: (handle: string) => void;
}) {
  const auth = useAuth();
  const [blocks, setBlocks] = useState<Block[]>(() => fromHistory(history));
  const [chatId, setChatId] = useState<string | null>(history?.chatId ?? null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const byHandle = useMemo(() => new Map(minds.map((m) => [m.handle.toLowerCase(), m])), [minds]);

  // a new question scrolls up to the top of its block, so its verdicts and summary are in view as they arrive
  const lastId = blocks[blocks.length - 1]?.id;
  useEffect(() => {
    const box = scrollRef.current;
    const el = lastId ? box?.querySelector<HTMLElement>(`[data-block="${lastId}"]`) : null;
    if (box && el) box.scrollTo({ top: Math.max(0, el.offsetTop - 24), behavior: "smooth" });
  }, [lastId]);

  const patchBlock = (id: string, fn: (b: Block) => Partial<Block>) => setBlocks((all) => all.map((b) => (b.id === id ? { ...b, ...fn(b) } : b)));
  const patchAnswer = (id: string, handle: string, fn: (a: Answer) => Partial<Answer>) =>
    patchBlock(id, (b) => ({ answers: b.answers.map((a) => (a.handle === handle ? { ...a, ...fn(a) } : a)) }));

  /** Streams one mind's answer into its card. */
  const speakOne = async (cid: string, blockId: string, handle: string) => {
    try {
      const res = await fetch("/api/all", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "speak", chatId: cid, handle }) });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        const error = j.reason === "limit" && j.resetsAt ? `${j.error} Refills in ${untilText(j.resetsAt)}.` : (j.error ?? "No answer. Try again.");
        patchAnswer(blockId, handle, () => ({ streaming: false, error }));
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const raw = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = raw.match(/^event: (\w+)/m)?.[1];
          const data = JSON.parse(raw.match(/^data: (.*)$/m)?.[1] ?? "{}");
          if (ev === "meta") patchAnswer(blockId, handle, () => ({ record: data.record ?? null }));
          else if (ev === "delta") patchAnswer(blockId, handle, (a) => ({ content: a.content + data.t }));
          else if (ev === "done") patchAnswer(blockId, handle, () => ({ streaming: false, verdict: data.verdict, refs: data.refs ?? [], content: data.noView ? "" : data.content, noView: Boolean(data.noView) }));
          else if (ev === "error") patchAnswer(blockId, handle, () => ({ streaming: false, error: data.message }));
        }
      }
    } catch {
      patchAnswer(blockId, handle, () => ({ error: "Connection dropped." }));
    } finally {
      patchAnswer(blockId, handle, (a) => (a.streaming ? { streaming: false } : {}));
    }
  };

  const send = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || busy) return;
      setBusy(true);
      setInput("");
      const blockId = `b${Date.now()}`;
      setBlocks((all) => [...all, { id: blockId, question: q, routing: true, answers: [], summary: null, summing: false }]);
      try {
        const res = await fetch("/api/all", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ask", message: q, chatId }) });
        const j = await res.json();
        if (!res.ok) {
          if (j.reason === "login") auth.askLogin();
          const error = j.reason === "limit" && j.resetsAt ? `${j.error} Refills in ${untilText(j.resetsAt)}.` : (j.error ?? "Something went wrong. Try again.");
          patchBlock(blockId, () => ({ routing: false, error }));
          return;
        }
        setChatId(j.chatId);
        onChat?.(j.chatId, q);
        const speakers: string[] = j.speakers ?? [];
        patchBlock(blockId, () => ({
          routing: false,
          answers: speakers.map((h) => ({ handle: h, content: "", streaming: true, verdict: null, refs: [], noView: false, record: null })),
        }));
        // every mind at once: they answer side by side, not in turn
        await Promise.all(speakers.map((h) => speakOne(j.chatId, blockId, h)));
        patchBlock(blockId, () => ({ summing: true }));
        const s = await fetch("/api/all", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sum", chatId: j.chatId }) })
          .then((r) => (r.ok ? r.json() : { summary: null }))
          .catch(() => ({ summary: null }));
        patchBlock(blockId, () => ({ summing: false, summary: s.summary ?? null }));
      } catch {
        patchBlock(blockId, () => ({ routing: false, summing: false, error: "Connection dropped. Try again." }));
      } finally {
        setBusy(false);
        auth.refresh();
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    },
    // speakOne and the patchers only touch state setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy, chatId, auth, onChat],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} data-lenis-prevent className="relative min-h-0 flex-1 overflow-y-auto px-gutter lg:px-8" aria-live="polite">
        {blocks.length === 0 ? (
          <Empty minds={minds} onAsk={send} busy={busy} />
        ) : (
          <ol className="mx-auto max-w-[860px] space-y-10 py-8">
            {blocks.map((b) => (
              <li key={b.id} data-block={b.id} className="space-y-5">
                <div className="flex justify-end">
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-panel border border-line bg-panel px-4 py-3 text-body">{b.question}</p>
                </div>
                <BlockView block={b} byHandle={byHandle} onContinue={onContinue} />
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="border-t border-line bg-void px-gutter pb-[max(12px,env(safe-area-inset-bottom))] pt-3 lg:px-8">
        <form
          className="mx-auto flex max-w-[860px] items-end gap-2 rounded-input border border-line bg-panel p-2 transition-colors duration-fast focus-within:border-line-hover"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <label htmlFor="all-input" className="sr-only">Ask all minds</label>
          <textarea
            id="all-input"
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            placeholder="Ask all minds at once…"
            className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-body text-ceramic placeholder:text-muted focus:outline-none"
          />
          <button type="submit" disabled={busy || !input.trim()} className="btn-ceramic h-10 w-10 shrink-0 px-0 disabled:opacity-40" aria-label="Send">
            →
          </button>
        </form>
        <UsageMeter className="mx-auto mt-2 max-w-[860px]" />
      </div>
    </div>
  );
}

function Empty({ minds, onAsk, busy }: { minds: Intelligence[]; onAsk: (q: string) => void; busy: boolean }) {
  return (
    <div className="mx-auto flex min-h-full max-w-[560px] flex-col items-center justify-center py-12 text-center">
      <MindStack minds={minds} size={40} />
      <h2 className="mt-6 text-h3 font-medium">Ask all minds</h2>
      <p className="mt-3 text-sm leading-relaxed text-particle">
        One question to every mind. The ones that have a view answer side by side, each with their record on the coin you ask about. The rest stay quiet.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-2">
        {EXAMPLES.map((q) => (
          <button key={q} type="button" disabled={busy} onClick={() => onAsk(q)} className="btn-line h-9 px-3.5 text-xs disabled:opacity-40">
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

const signed = (r: number) => `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r * 100).toFixed(1)}%`;
const UP = "var(--ii-verdict-buy)";
const DOWN = "var(--ii-verdict-sell)";

/** One question's answers: who leans which way, the summary, then each mind's card. */
function BlockView({ block: b, byHandle, onContinue }: { block: Block; byHandle: Map<string, Intelligence>; onContinue?: (h: string) => void }) {
  if (b.error) return <p className="text-body text-muted">{b.error}</p>;
  if (b.routing)
    return (
      <p className="flex items-center gap-2 font-pixel text-xs text-muted">
        <TypingIndicator /> Finding the minds with a view…
      </p>
    );
  const spoke = b.answers.filter((a) => !a.noView);
  const quiet = b.answers.filter((a) => a.noView);
  const verdicts = spoke.filter((a) => a.verdict).map((a) => a.verdict!);
  const done = b.answers.every((a) => !a.streaming);
  return (
    <div className="space-y-4">
      {done && verdicts.length >= 2 && <Consensus answers={spoke} byHandle={byHandle} />}
      {(b.summary || b.summing) && (
        <div className="rounded-panel border border-line-hover p-4">
          <p className="label-mono">Where they land</p>
          {b.summary ? <p className="mt-2 text-body leading-relaxed text-ceramic">{b.summary}</p> : <TypingIndicator />}
        </div>
      )}
      <ul className="grid gap-3 md:grid-cols-2">
        {spoke.map((a) => {
          const it = byHandle.get(a.handle.toLowerCase());
          // a mind that's about to say "no view" shows nothing until it's done
          const quietSoon = a.streaming && NO_VIEW.startsWith(a.content.trim().slice(0, NO_VIEW.length).toUpperCase()) && a.content.trim().length > 0;
          return (
            <li key={a.handle} className="flex flex-col rounded-card border border-line bg-panel p-4">
              <div className="flex items-center gap-2.5">
                {it && <BrainAvatar it={it} size={26} active={a.streaming} />}
                <span className="font-mono text-xs" style={{ color: it?.color }}>
                  {it?.code}
                </span>
                <span className="min-w-0 truncate font-pixel text-sm text-ceramic">@{a.handle}</span>
                <span className="ml-auto">{a.verdict ? <VerdictChip verdict={a.verdict} /> : a.streaming && <TypingIndicator />}</span>
              </div>
              <div className="mt-3 flex-1 text-sm">
                {a.error ? (
                  <p className="text-muted">{a.error}</p>
                ) : a.content && !quietSoon ? (
                  <GroupAnswer item={{ content: a.content, streaming: a.streaming, refs: a.refs, verdict: null }} />
                ) : null}
              </div>
              {(a.record || (!a.streaming && !a.error && onContinue)) && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line pt-3">
                  {a.record ? (
                    <span className="font-pixel text-[11px] text-muted">
                      ${a.record.ticker} · {a.record.calls} call{a.record.calls === 1 ? "" : "s"}
                      {a.record.worked != null && (
                        <>
                          {" · right "}
                          <span style={{ color: a.record.worked >= 0.5 ? UP : DOWN }}>{Math.round(a.record.worked * 100)}%</span> in 7d
                        </>
                      )}
                      {a.record.med != null && (
                        <>
                          {" · median "}
                          <span style={{ color: a.record.med > 0 ? UP : a.record.med < 0 ? DOWN : undefined }}>{signed(a.record.med)}</span>
                        </>
                      )}
                    </span>
                  ) : (
                    <span />
                  )}
                  {!a.streaming && !a.error && onContinue && (
                    <button type="button" onClick={() => onContinue(a.handle)} className="link-quiet text-xs">
                      Ask @{a.handle} more <span className="arrow">→</span>
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {quiet.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-2 font-pixel text-[11px] text-muted">
          <span>No view on this:</span>
          {quiet.map((a) => {
            const it = byHandle.get(a.handle.toLowerCase());
            return (
              <span key={a.handle} className="inline-flex items-center gap-1.5">
                {it && <BrainAvatar it={it} size={18} />}@{a.handle}
              </span>
            );
          })}
        </p>
      )}
      {done && spoke.length === 0 && quiet.length > 0 && <p className="text-sm text-particle">None of the minds asked has posted about this. Try naming a coin, or ask it another way.</p>}
    </div>
  );
}

/** How the minds that gave a verdict split: one bar, green for buy, grey for hold or pass, red for sell. */
function Consensus({ answers, byHandle }: { answers: Answer[]; byHandle: Map<string, Intelligence> }) {
  const groups: { v: Verdict; label: string; color: string }[] = [
    { v: "BUY", label: "buy", color: UP },
    { v: "HOLD", label: "hold", color: "var(--ii-particle)" },
    { v: "PASS", label: "pass", color: "var(--ii-line-hover)" },
    { v: "SELL", label: "sell", color: DOWN },
  ];
  const counted = groups.map((g) => ({ ...g, who: answers.filter((a) => a.verdict === g.v) })).filter((g) => g.who.length);
  const total = counted.reduce((n, g) => n + g.who.length, 0);
  return (
    <div>
      <div className="flex h-2 gap-[2px]" role="img" aria-label={counted.map((g) => `${g.who.length} ${g.label}`).join(", ")}>
        {counted.map((g) => (
          <i key={g.v} style={{ flex: g.who.length, background: g.color }} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
        {counted.map((g) => (
          <span key={g.v} className="inline-flex items-center gap-2 font-pixel text-xs">
            <span style={{ color: g.v === "PASS" ? "var(--ii-muted)" : g.color }}>
              {g.who.length}/{total} {g.label}
            </span>
            <span className="flex -space-x-1.5">
              {g.who.map((a) => {
                const it = byHandle.get(a.handle.toLowerCase());
                return it ? <BrainAvatar key={a.handle} it={it} size={18} /> : null;
              })}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
