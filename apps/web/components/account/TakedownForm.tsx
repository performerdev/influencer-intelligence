"use client";

import { useState } from "react";

const KINDS = [
  ["self", "I am this person"],
  ["representative", "I represent this person"],
  ["account", "Delete my account data"],
  ["other", "Something else"],
] as const;

const field = "mt-2 w-full rounded-panel border border-line bg-panel px-4 py-3 text-sm text-ceramic outline-none transition-colors placeholder:text-muted focus:border-line-hover";

/** Takedown / data-deletion request. Stored for a person to review. */
export function TakedownForm({ handles }: { handles: string[] }) {
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>("self");
  const [handle, setHandle] = useState(handles[0] ?? "");
  const [contact, setContact] = useState("");
  const [proof, setProof] = useState("");
  const [reason, setReason] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    setError(null);
    const r = await fetch("/api/takedown", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, handle: kind === "account" ? "" : handle, contact, proof, reason }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) {
      setState("idle");
      setError(j.error ?? "Couldn't send it. Try again in a moment.");
      return;
    }
    setState("sent");
  };

  if (state === "sent")
    return (
      <div className="rounded-panel border border-line bg-panel p-6">
        <p className="font-pixel text-body text-ceramic">Received.</p>
        <p className="mt-2 text-sm text-particle">A person reviews every request, usually within 72 hours. We&apos;ll reply at the contact you gave.</p>
      </div>
    );

  return (
    <form onSubmit={submit} className="space-y-6">
      <fieldset>
        <legend className="label-mono">Request</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {KINDS.map(([k, label]) => (
            <button
              type="button"
              key={k}
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={`rounded-pill border px-3 py-1.5 font-pixel text-xs ${kind === k ? "border-ceramic text-ceramic" : "border-line text-muted hover:text-particle"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      {kind !== "account" && (
        <label className="block">
          <span className="label-mono">Which brain</span>
          <select value={handle} onChange={(e) => setHandle(e.target.value)} className={field}>
            {handles.map((h) => (
              <option key={h} value={h}>
                @{h}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="block">
        <span className="label-mono">How we reach you</span>
        <input required value={contact} onChange={(e) => setContact(e.target.value)} maxLength={200} placeholder="@handle on X, or an email" className={field} />
      </label>

      <label className="block">
        <span className="label-mono">Proof {kind === "other" ? "(optional)" : ""}</span>
        <input
          required={kind !== "other"}
          value={proof}
          onChange={(e) => setProof(e.target.value)}
          maxLength={500}
          placeholder={kind === "account" ? "Link to a post from the X account you log in with" : "Link to a post from that X account asking for removal"}
          className={field}
        />
        <span className="mt-2 block text-xs text-muted">
          {kind === "account"
            ? "Post anything mentioning ii.plus from your account, and link it here."
            : "The simplest proof: a post (or DM to us) from the account itself saying it wants its ii.plus brain removed."}
        </span>
      </label>

      <label className="block">
        <span className="label-mono">Anything else (optional)</span>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} rows={4} className={field} />
      </label>

      {error && <p className="text-sm text-particle">{error}</p>}
      <button type="submit" disabled={state === "sending"} className="btn-ceramic">
        {state === "sending" ? "Sending…" : "Send request"}
      </button>
    </form>
  );
}
