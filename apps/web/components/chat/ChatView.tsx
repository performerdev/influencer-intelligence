"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { UsageMeter, untilText, useAuth } from "@/components/account/AuthProvider";
import { BrainAvatar } from "@/components/particles/BrainAvatar";
import { AppLink } from "@/components/ui/AppLink";
import { site } from "@/config/site";
import { formatCount } from "@/lib/intelligences";
import { normalizeRefs, stripCitations } from "@/lib/refs";

import { Markdown, Sheet, TypingIndicator, type Verdict, VerdictChip } from "./bits";
import { ShareBar } from "./ShareBar";

export type BrainSection = { id: string; title: string; body: string; source: "mind" | "rules" | "voice" };
export type BrainStats = {
  computedAt: string;
  callsTotal: number;
  callsPriced: number;
  hit7d: number | null;
  median7d: number | null;
  medianHoldDays: number | null;
  holdPairs: number;
};
export type ChatBrain = {
  version: number;
  createdAt: string;
  promptTokens: number;
  sections: BrainSection[];
  stats: BrainStats | null;
  suggestions: string[];
};
export type ChatIntelligence = {
  code: string;
  handle: string;
  displayName: string;
  color: string;
  avatar?: string;
  postsParsed: number | null;
  postsPerDay: number | null;
};

type Reference = {
  n: number;
  postId: string;
  kind: "call" | "post";
  date: string | null;
  text: string | null;
  quoted: { author: string | null; text: string | null } | null;
  call: { ticker: string; direction: string; quote: string } | null;
  url: string;
};

type Msg =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "assistant"; content: string; streaming: boolean; lastDelta: string; verdict: Verdict | null; refs: Reference[]; brainVersion: number | null; error?: string; messageId?: string };

const VERDICT_TAIL = /\n*\s*VERDICT:?\s*[A-Z]*\.?\s*$/i;

export type ChatHistory = {
  chatId: string;
  items: { id?: string; role: "user" | "assistant"; content: string; verdict: Verdict | null; refs: Reference[]; brainVersion: number | null }[];
};

export function ChatView({ intelligence, brain, history }: { intelligence: ChatIntelligence; brain: ChatBrain | null; history?: ChatHistory | null }) {
  const { handle, code } = intelligence;
  const auth = useAuth();
  const [messages, setMessages] = useState<Msg[]>(() =>
    (history?.items ?? []).map((it, i) =>
      it.role === "user"
        ? { id: `h${i}`, role: "user" as const, content: it.content }
        : { id: `h${i}`, role: "assistant" as const, content: it.content, streaming: false, lastDelta: "", verdict: it.verdict, refs: it.refs, brainVersion: it.brainVersion, messageId: it.id },
    ),
  );
  const [chatId, setChatId] = useState<string | null>(history?.chatId ?? null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Reference | null>(null);
  const [refsSheet, setRefsSheet] = useState(false);
  const [brainSheet, setBrainSheet] = useState(false);
  const [drawer, setDrawer] = useState<{ version: number } | null>(null);
  const [suggestOffset, setSuggestOffset] = useState(0);
  // the "post it on X for a free session" invite: at most once per page view
  const [offerFor, setOfferFor] = useState<string | null>(null);
  const offered = useRef(false);
  const maybeOffer = useCallback(
    (messageId: string | undefined, force = false) => {
      const me = auth.me;
      if (!messageId || offered.current || !me?.user || !me.shareBonus?.available) return;
      if (force || me.usage.used >= 0.5 || Math.random() < 0.2) {
        offered.current = true;
        setOfferFor(messageId);
      }
    },
    [auth.me],
  );
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const lastAnswer = [...messages].reverse().find((m) => m.role === "assistant") as Extract<Msg, { role: "assistant" }> | undefined;
  const suggestions = useMemo(() => {
    const s = brain?.suggestions ?? [];
    return s.length ? [0, 1, 2].map((i) => s[(suggestOffset + i) % s.length]).filter((v, i, a) => a.indexOf(v) === i) : [];
  }, [brain, suggestOffset]);

  // "/" focuses the input from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: busy ? "auto" : "smooth" });
  }, [messages, busy]);

  const send = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || busy || !brain) return;
      setBusy(true);
      setInput("");
      setSuggestOffset((o) => o + 3);
      const aId = `a${Date.now()}`;
      setMessages((m) => [
        ...m,
        { id: `u${Date.now()}`, role: "user", content: q },
        { id: aId, role: "assistant", content: "", streaming: true, lastDelta: "", verdict: null, refs: [], brainVersion: null },
      ]);
      const patch = (fn: (m: Extract<Msg, { role: "assistant" }>) => Partial<Extract<Msg, { role: "assistant" }>>) =>
        setMessages((all) => all.map((m) => (m.id === aId && m.role === "assistant" ? { ...m, ...fn(m) } : m)));

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle, chatId, message: q }),
        });
        if (!res.ok || !res.body) {
          const j = await res.json().catch(() => ({}));
          if (j.reason === "login") auth.askLogin();
          const error = j.reason === "limit" && j.resetsAt ? `${j.error} Refills in ${untilText(j.resetsAt)}.` : (j.error ?? "Something went wrong. Try again.");
          patch(() => ({ streaming: false, error }));
          // out of session: the share invite under the last answer is a way back in
          if (j.reason === "limit") {
            auth.refresh();
            const prev = [...messages].reverse().find((m) => m.role === "assistant" && m.messageId) as Extract<Msg, { role: "assistant" }> | undefined;
            maybeOffer(prev?.messageId, true);
          }
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
            if (ev === "meta") {
              setChatId(data.chatId);
              patch(() => ({ brainVersion: data.brainVersion }));
            } else if (ev === "delta") {
              patch((m) => ({ content: m.content + data.t, lastDelta: data.t }));
            } else if (ev === "done") {
              patch((m) => ({ streaming: false, verdict: data.verdict, refs: data.refs, content: m.content.replace(VERDICT_TAIL, "").trim(), messageId: data.messageId }));
              maybeOffer(data.messageId);
              if (data.refs?.length) setSelected(data.refs[0]);
              else setSelected(null);
              auth.refresh();
            } else if (ev === "error") {
              patch(() => ({ streaming: false, error: data.message }));
            }
          }
        }
      } catch {
        patch(() => ({ streaming: false, error: "Connection dropped. Try again." }));
      } finally {
        setBusy(false);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    },
    [busy, brain, chatId, handle, auth, messages, maybeOffer],
  );

  const openRef = (r: Reference) => {
    setSelected(r);
    if (window.matchMedia("(max-width: 1023px)").matches) setRefsSheet(true);
  };

  const disclaimer = `Unofficial AI model built from public posts. Not affiliated with @${handle}. Not financial advice.`;

  return (
    <div className="mx-auto grid h-[100svh] max-w-site grid-cols-1 pt-topbar lg:grid-cols-[264px_minmax(0,1fr)_300px]">
      {/* ── left: the brain ── */}
      <aside className="hidden min-h-0 overflow-y-auto border-r border-line px-5 py-6 lg:block" aria-label={`${code} brain summary`}>
        <BrainPanel intelligence={intelligence} brain={brain} onOpenBrain={() => brain && setDrawer({ version: brain.version })} />
      </aside>

      {/* ── center: the conversation ── */}
      <section className="flex min-h-0 min-w-0 flex-col" aria-label="Conversation">
        <header className="flex items-start justify-between gap-4 border-b border-line px-gutter py-4 lg:px-8">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-xs text-muted">{code}</span>
              <h1 className="truncate text-body font-medium">@{handle}</h1>
              <span className="hidden text-sm text-muted sm:inline">· Unofficial model</span>
            </div>
            <p className="mt-1 text-xs text-muted">{disclaimer}</p>
          </div>
          <button onClick={() => setBrainSheet(true)} className="btn-line h-9 shrink-0 px-4 lg:hidden">
            Brain
          </button>
        </header>

        <div ref={scrollRef} data-scroll-main data-lenis-prevent className="min-h-0 flex-1 overflow-y-auto px-gutter lg:px-8" aria-live="polite">
          {messages.length === 0 ? (
            <EmptyState intelligence={intelligence} ready={!!brain} onAsk={send} />
          ) : (
            <ol className="mx-auto max-w-[720px] space-y-8 py-8">
              {messages.map((m, idx) =>
                m.role === "user" ? (
                  <li key={m.id} className="flex justify-end">
                    <p className="max-w-[85%] whitespace-pre-wrap rounded-panel border border-line bg-panel px-4 py-3 text-body">{m.content}</p>
                  </li>
                ) : (
                  <li key={m.id}>
                    <div className="mb-2 flex items-center gap-2">
                      <BrainAvatar it={intelligence} size={20} active={m.streaming} />
                      <span className="font-mono text-xs" style={{ color: intelligence.color }}>{code}</span>
                      {m.streaming && !m.content && <TypingIndicator />}
                    </div>
                    {m.error ? (
                      <p className="text-body text-muted">{m.error}</p>
                    ) : (
                      <Answer msg={m} onRef={openRef} />
                    )}
                    {!m.streaming && !m.error && (
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        {m.verdict && <VerdictChip verdict={m.verdict} />}
                        {m.refs.map((r) => (
                          <button
                            key={r.n}
                            onClick={() => openRef(r)}
                            className={`h-7 min-w-7 rounded-chip border px-2 font-mono text-xs transition-colors duration-fast ${
                              selected?.postId === r.postId ? "border-ceramic text-ceramic" : "border-line text-particle hover:border-line-hover"
                            }`}
                            aria-label={`Reference ${r.n}: ${r.kind === "call" ? "call" : "post"} from ${r.date ?? "unknown date"}`}
                          >
                            [{r.n}]
                          </button>
                        ))}
                        {m.brainVersion != null && (
                          <button onClick={() => setDrawer({ version: m.brainVersion! })} className="link-quiet ml-1 text-xs">
                            Open the brain <span className="arrow">↗</span>
                          </button>
                        )}
                        {m.messageId && (
                          <ShareBar
                            messageId={m.messageId}
                            handle={handle}
                            question={(messages.slice(0, idx).reverse().find((x) => x.role === "user")?.content as string | undefined) ?? null}
                            offer={offerFor === m.messageId}
                          />
                        )}
                      </div>
                    )}
                  </li>
                ),
              )}
            </ol>
          )}
        </div>

        {/* input stays on the bottom, safe-area aware */}
        <div className="border-t border-line bg-void px-gutter pb-[max(12px,env(safe-area-inset-bottom))] pt-3 lg:px-8">
          <form
            className="mx-auto flex max-w-[720px] items-end gap-2 rounded-input border border-line bg-panel p-2 transition-colors duration-fast focus-within:border-line-hover"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <label htmlFor="chat-input" className="sr-only">Ask @{handle}</label>
            <textarea
              id="chat-input"
              ref={inputRef}
              rows={1}
              value={input}
              disabled={!brain}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder={brain ? `Ask @${handle} anything…` : "This brain is still being distilled"}
              className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-body text-ceramic placeholder:text-muted focus:outline-none disabled:opacity-60"
            />
            <button type="submit" disabled={!brain || busy || !input.trim()} className="btn-ceramic h-10 w-10 shrink-0 px-0 disabled:opacity-40" aria-label="Send">
              →
            </button>
          </form>
          <UsageMeter className="mx-auto mt-2 max-w-[720px]" />
          {suggestions.length > 0 && (
            <div className="mx-auto mt-2 flex max-w-[720px] gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
              {suggestions.map((s) => (
                <button
                  key={s}
                  disabled={busy}
                  onClick={() => send(s)}
                  className="shrink-0 rounded-pill border border-line px-3 py-1.5 text-xs text-particle transition-colors duration-fast hover:border-line-hover hover:text-ceramic disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── right: from the brain ── */}
      <aside className="hidden min-h-0 overflow-y-auto border-l border-line px-5 py-6 lg:block" aria-label="From the brain">
        <RefsPanel answer={lastAnswer} selected={selected} onSelect={setSelected} brain={brain} />
      </aside>

      <Sheet open={refsSheet} onClose={() => setRefsSheet(false)} title="From the brain" side="bottom">
        <RefsPanel answer={lastAnswer} selected={selected} onSelect={setSelected} brain={brain} />
      </Sheet>
      <Sheet open={brainSheet} onClose={() => setBrainSheet(false)} title={`${code} · brain`} side="bottom">
        <BrainPanel intelligence={intelligence} brain={brain} onOpenBrain={() => brain && (setBrainSheet(false), setDrawer({ version: brain.version }))} />
      </Sheet>
      <BrainDrawer handle={handle} code={code} version={drawer?.version ?? null} onClose={() => setDrawer(null)} />
    </div>
  );
}

/* ───────────────────────── pieces ───────────────────────── */

function Answer({ msg, onRef }: { msg: Extract<Msg, { role: "assistant" }>; onRef: (r: Reference) => void }) {
  if (msg.streaming) {
    // While streaming: hide citation markers and the verdict line; animate only the newest words.
    const shown = normalizeRefs(msg.content).replace(/\[post:\d+\]/g, "").replace(/\[(p(o(s(t(:[^\]]*)?)?)?)?)?$/, "").replace(VERDICT_TAIL, "");
    const tail = Math.min(msg.lastDelta.length, shown.length);
    return (
      <div className="whitespace-pre-wrap text-body leading-relaxed text-ceramic">
        {shown.slice(0, shown.length - tail)}
        <span key={shown.length} className="tok">{shown.slice(shown.length - tail)}</span>
        <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] bg-particle align-baseline" aria-hidden />
      </div>
    );
  }
  const byId = new Map(msg.refs.map((r) => [r.postId, r]));
  const parts = normalizeRefs(msg.content).split(/(\[post:\d+\])/g);
  return (
    <div className="whitespace-pre-wrap text-body leading-relaxed text-ceramic">
      {parts.map((p, i) => {
        const id = p.match(/^\[post:(\d+)\]$/)?.[1];
        if (!id) return <Fragment key={i}>{p}</Fragment>;
        const r = byId.get(id);
        return r ? (
          <button key={i} onClick={() => onRef(r)} className="mx-0.5 align-baseline font-mono text-xs text-particle underline decoration-line-hover underline-offset-4 hover:text-ceramic">
            [{r.n}]
          </button>
        ) : null;
      })}
    </div>
  );
}

function EmptyState({ intelligence, ready, onAsk }: { intelligence: ChatIntelligence; ready: boolean; onAsk: (q: string) => void }) {
  return (
    <div className="flex h-full min-h-[360px] flex-col items-center justify-center py-10 text-center">
      <BrainAvatar it={intelligence} size={200} />
      {ready ? (
        <p className="mt-6 font-pixel text-lead text-particle">
          Ask @{intelligence.handle} anything. Try:{" "}
          <button onClick={() => onAsk("Who are you?")} className="text-ceramic underline decoration-line-hover underline-offset-4 hover:decoration-ceramic">
            who are you?
          </button>
        </p>
      ) : (
        <p className="mt-6 max-w-[42ch] text-lead text-particle">This brain is still being distilled from @{intelligence.handle}&apos;s posts. It opens here when it&apos;s ready.</p>
      )}
    </div>
  );
}

function BrainPanel({ intelligence, brain, onOpenBrain }: { intelligence: ChatIntelligence; brain: ChatBrain | null; onOpenBrain: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const st = brain?.stats;
  const pct = (x: number | null) => (x == null ? "—" : `${x > 0 ? "+" : ""}${(x * 100).toFixed(1)}%`);
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <BrainAvatar it={intelligence} size={56} />
        <div className="min-w-0">
          <p className="font-mono text-xs" style={{ color: intelligence.color }}>{intelligence.code}</p>
          <p className="truncate font-pixel text-body">@{intelligence.handle}</p>
          <p className="font-mono text-xs text-muted">{formatCount(intelligence.postsParsed)} posts</p>
        </div>
      </div>

      <div>
        <p className="label-mono">Brain file</p>
        {brain ? (
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {brain.sections.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => setOpen(open === s.id ? null : s.id)}
                  aria-expanded={open === s.id}
                  className="flex w-full items-center justify-between py-2.5 text-left text-sm text-particle transition-colors duration-fast hover:text-ceramic"
                >
                  {s.title}
                  <span className="font-mono text-xs text-muted">{open === s.id ? "−" : "+"}</span>
                </button>
                {open === s.id && <Markdown text={stripCitations(s.body)} className="pb-3 text-sm leading-relaxed text-particle" />}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">Not distilled yet.</p>
        )}
        {brain && (
          <button onClick={onOpenBrain} className="link-quiet mt-3 text-xs">
            Open the full brain <span className="arrow">↗</span>
          </button>
        )}
      </div>

      <div>
        <p className="label-mono">Stats</p>
        <dl className="mt-3 space-y-2 font-mono text-xs">
          {[
            ["Calls tracked", st ? String(st.callsTotal) : "—"],
            ["Priced", st ? `${st.callsPriced}` : "—"],
            ["7d hit rate", st?.hit7d != null ? `${Math.round(st.hit7d * 100)}%` : "—"],
            ["7d median", pct(st?.median7d ?? null)],
            ["Median hold", st?.medianHoldDays != null ? `${st.medianHoldDays}d` : "—"],
          ].map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">{k}</dt>
              <dd className="border-b border-dotted border-line flex-1" aria-hidden />
              <dd className="text-particle">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted">{st ? `Computed on ${st.computedAt.slice(0, 10)} by code, not by the model.` : "Computed once the brain is built."}</p>
        <AppLink href={`/brain/${intelligence.handle}`} className="link-quiet mt-3 inline-block text-xs">
          Every call, priced <span className="arrow">↗</span>
        </AppLink>
      </div>

      <AppLink href={`/group?with=${intelligence.handle}`} className="btn-line w-full">
        + Group
      </AppLink>
    </div>
  );
}

function RefsPanel({
  answer,
  selected,
  onSelect,
  brain,
}: {
  answer: Extract<Msg, { role: "assistant" }> | undefined;
  selected: Reference | null;
  onSelect: (r: Reference) => void;
  brain: ChatBrain | null;
}) {
  if (!answer || answer.streaming) {
    return (
      <div>
        <p className="label-mono">From the brain</p>
        <p className="mt-3 text-sm text-muted">Calls and posts an answer leans on show up here.</p>
      </div>
    );
  }
  if (!answer.refs.length) {
    return (
      <div>
        <p className="label-mono">From the brain</p>
        <p className="mt-3 text-sm text-particle">This answer didn&apos;t cite a specific post. It drew on these parts of the brain:</p>
        <ul className="mt-3 space-y-1.5 text-sm text-muted">
          {(brain?.sections ?? []).filter((s) => s.source !== "voice").slice(0, 5).map((s) => (
            <li key={s.id}>· {s.title}</li>
          ))}
          <li>· Voice</li>
        </ul>
      </div>
    );
  }
  const cur = selected && answer.refs.some((r) => r.postId === selected.postId) ? selected : answer.refs[0];
  return (
    <div>
      <p className="label-mono">From the brain</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {answer.refs.map((r) => (
          <button
            key={r.n}
            onClick={() => onSelect(r)}
            className={`h-7 min-w-7 rounded-chip border px-2 font-mono text-xs ${cur.postId === r.postId ? "border-ceramic text-ceramic" : "border-line text-particle hover:border-line-hover"}`}
          >
            [{r.n}]
          </button>
        ))}
      </div>
      <article className="mt-5 rounded-panel border border-line p-4">
        <p className="flex items-center justify-between font-mono text-xs text-muted">
          <span>{cur.kind === "call" ? "Call" : "Post"} · {cur.date ?? "—"}</span>
          {cur.call && <span className="uppercase text-particle">{cur.call.direction} {cur.call.ticker}</span>}
        </p>
        {cur.quoted?.text && (
          <blockquote className="mt-3 border-l border-line pl-3 text-xs text-muted">
            @{cur.quoted.author ?? "?"}: {cur.quoted.text}
          </blockquote>
        )}
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ceramic">{cur.text ?? cur.call?.quote ?? "—"}</p>
        <a href={cur.url} target="_blank" rel="noreferrer" className="link-quiet mt-4 text-xs">
          View on x.com <span className="arrow">↗</span>
        </a>
      </article>
    </div>
  );
}

type BrainDump = {
  version: number;
  model: string;
  createdAt: string;
  promptTokens: number;
  prompt: string;
  files: { identity: string; mind: string; rules: string; voice: string; calls: unknown[]; stats: unknown; example_ids: string[] };
};

function BrainDrawer({ handle, code, version, onClose }: { handle: string; code: string; version: number | null; onClose: () => void }) {
  const [data, setData] = useState<BrainDump | null>(null);
  const [tab, setTab] = useState<"prompt" | "mind" | "rules" | "voice" | "identity" | "calls" | "stats">("prompt");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (version == null) return;
    setData(null);
    setError(null);
    fetch(`/api/brain/${handle}?version=${version}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("not found"))))
      .then(setData)
      .catch(() => setError("Couldn't load this brain version."));
  }, [handle, version]);
  const body =
    !data ? null : tab === "prompt" ? data.prompt : tab === "calls" ? JSON.stringify(data.files.calls, null, 2) : tab === "stats" ? JSON.stringify(data.files.stats, null, 2) : data.files[tab];
  return (
    <Sheet
      open={version != null}
      onClose={onClose}
      wide
      title={
        <span className="font-mono text-xs">
          {code} · brain v{version}
          {data ? ` · ~${data.promptTokens.toLocaleString("en-US")} tokens · ${data.model} · ${data.createdAt.slice(0, 10)}` : ""}
        </span>
      }
    >
      <p className="text-sm text-particle">
        The exact system prompt and brain files behind this answer. Each question also carries the calls on any ticker it names, live prices and posts since the brain was built.{" "}
        <a
          href={`${site.githubUrl}/tree/main/brains/${code}-${handle.toLowerCase()}`}
          target="_blank"
          rel="noreferrer"
          className="text-ceramic underline decoration-line-hover underline-offset-4"
        >
          Browse all files on GitHub
        </a>
      </p>
      <div className="mt-4 flex flex-wrap gap-1.5" role="tablist">
        {(["prompt", "identity", "mind", "rules", "voice", "calls", "stats"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-pill border px-3 py-1 font-mono text-xs ${tab === t ? "border-ceramic text-ceramic" : "border-line text-muted hover:text-particle"}`}
          >
            {t === "prompt" ? "system prompt" : t === "calls" || t === "stats" ? `${t}.json` : `${t}.md`}
          </button>
        ))}
      </div>
      {error && <p className="mt-6 text-sm text-muted">{error}</p>}
      {!data && !error && <p className="mt-6"><TypingIndicator /></p>}
      {body != null && (
        <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-words rounded-panel border border-line bg-void p-4 font-code text-xs leading-relaxed text-particle">{body}</pre>
      )}
    </Sheet>
  );
}
