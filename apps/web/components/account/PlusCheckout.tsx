"use client";

import { useEffect, useRef, useState } from "react";

import { useAuth } from "./AuthProvider";
import { type Checkout, type Wallet, openInWalletLinks, payWith, watchWallets } from "./wallets";

export type Info = Checkout & { token: string; handle: string; status?: string; purpose?: string; label?: string; jobId?: string | null };

/**
 * Plus checkout: 10 USDC on Solana. Pick a wallet (Phantom, OKX, Solflare,
 * Backpack… whatever is installed), scan the QR with a phone, or open the
 * pay page inside a wallet app. Either way the server finds the transfer
 * on-chain by its reference key and turns Plus on.
 */
export function PlusCheckout({ enabled, note }: { enabled: boolean; note: string }) {
  const { refresh } = useAuth();
  const [co, setCo] = useState<Info | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);

  const start = async () => {
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/plus/checkout", { method: "POST" }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok) return setErr(j.error ?? "Couldn't start the checkout.");
    setCo(j);
  };

  if (!enabled) return <p className="font-pixel text-sm text-particle">Payments coming soon.</p>;
  if (paid) return <p className="font-pixel text-body text-ceramic">Plus is on. Thank you — enjoy the bigger sessions.</p>;
  return (
    <div>
      {co ? (
        <PayPanel
          co={co}
          onPaid={() => {
            setPaid(true);
            refresh();
          }}
        />
      ) : (
        <button onClick={start} disabled={busy} className="btn-ceramic">
          {busy ? "Preparing…" : "Pay 10 USDC on Solana"}
        </button>
      )}
      {err && <p className="mt-3 text-sm text-particle">{err}</p>}
      <p className="mt-4 font-pixel text-xs text-muted">{note}</p>
    </div>
  );
}

/** The wallet picker + QR + status for one checkout. Also the body of /pay/[ref], opened inside wallet apps. */
export function PayPanel({ co, onPaid }: { co: Info; onPaid?: () => void }) {
  const [wallets, setWallets] = useState<Wallet[] | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [paid, setPaid] = useState(co.status === "paid");
  const [pageUrl, setPageUrl] = useState("");
  const done = useRef(false);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  useEffect(() => watchWallets(setWallets), []);
  useEffect(() => setPageUrl(`${location.origin}/pay/${co.reference}`), [co.reference]);

  useEffect(() => {
    let alive = true;
    import("qrcode").then((QR) =>
      // pixel QR, in the site's colors
      QR.toDataURL(co.url, { margin: 1, scale: 1, errorCorrectionLevel: "M", color: { dark: "#050506", light: "#F2F1EC" } }).then((d) => alive && setQr(d)),
    );
    return () => {
      alive = false;
    };
  }, [co.url]);

  useEffect(() => {
    if (paid) return;
    const began = Date.now();
    const t = setInterval(async () => {
      if (Date.now() - began > 30 * 60_000) {
        clearInterval(t);
        setMsg("Still waiting for the payment. If you've sent it, it's picked up when you come back to this page.");
        return;
      }
      const s = await fetch(`/api/plus/status?ref=${co.reference}`).then((x) => x.json()).catch(() => null);
      if (s?.status === "paid" && !done.current) {
        done.current = true;
        clearInterval(t);
        setPaid(true);
        onPaidRef.current?.();
      }
    }, 4000);
    return () => clearInterval(t);
  }, [co.reference, paid]);

  const pay = async (w: Wallet) => {
    setSending(w.name);
    setMsg(null);
    try {
      await payWith(w, co, `${location.origin}/api/plus/rpc`);
      setMsg("Sent. Confirming on Solana — usually a few seconds.");
    } catch (e) {
      const m = (e as Error)?.message ?? "";
      console.warn("wallet payment:", e);
      if (m.startsWith("NO_USDC:")) setMsg(`This wallet has ${m.slice(8)} USDC on Solana — it needs ${co.amount}. Top it up or pick another wallet.`);
      else if (/reject|denied|cancel/i.test(m)) setMsg("Cancelled in the wallet.");
      else setMsg("The wallet didn't send it. Try again, pick another wallet, or scan the QR.");
    } finally {
      setSending(null);
    }
  };

  if (paid)
    return (
      <p className="font-pixel text-body text-ceramic">
        {co.purpose === "add" ? (
          <>
            Paid. The brain is being built —{" "}
            <a href={`/add/${co.jobId}`} className="underline decoration-line-hover underline-offset-4">
              follow it here
            </a>
            .
          </>
        ) : (
          <>Paid. Plus is on for @{co.handle}.</>
        )}
      </p>
    );

  const none = wallets !== null && wallets.length === 0;
  return (
    <div className="space-y-6">
      <p className="font-pixel text-sm text-particle">
        {co.amount} USDC on Solana · {co.label ?? `Plus for @${co.handle}`}
      </p>

      <div>
        <p className="label-mono">Choose a wallet</p>
        {wallets === null ? null : none ? (
          <p className="mt-2 text-sm text-muted">No wallet in this browser. Open this checkout in your wallet app, or scan the QR.</p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {wallets.map((w) => (
              <button key={w.name} onClick={() => pay(w)} disabled={!!sending} className="btn-line h-12 justify-start gap-3 px-4">
                {w.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={w.icon} alt="" width={22} height={22} className="h-[22px] w-[22px] shrink-0" />
                ) : (
                  <span className="h-[22px] w-[22px] shrink-0 bg-line" aria-hidden />
                )}
                <span className="truncate">{sending === w.name ? "Check your wallet…" : w.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        {qr && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt={`Solana Pay QR code for ${co.amount} USDC`} width={168} height={168} className="h-[168px] w-[168px] shrink-0" style={{ imageRendering: "pixelated" }} />
        )}
        <div className="min-w-0 space-y-3">
          <p className="text-sm text-particle">On your phone: scan the QR with Phantom or Solflare, or open this checkout in your wallet app.</p>
          {pageUrl && (
            <div className="flex flex-wrap gap-2">
              {openInWalletLinks(pageUrl).map((l) => (
                <a key={l.name} href={l.href} className={none ? "btn-ceramic h-9 px-4" : "btn-line h-9 px-4"}>
                  {l.name}
                </a>
              ))}
            </div>
          )}
          <a href={co.url} className="link-quiet block text-xs">
            Any Solana Pay wallet <span className="arrow">↗</span>
          </a>
        </div>
      </div>

      <p className="font-pixel text-xs text-muted">Waiting for the transfer… this updates by itself.</p>
      {msg && <p className="text-sm text-particle">{msg}</p>}
    </div>
  );
}
