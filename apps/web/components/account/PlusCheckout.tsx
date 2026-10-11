"use client";

import { useEffect, useRef, useState } from "react";

import { useAuth } from "./AuthProvider";

type Checkout = { reference: string; amount: number; token: string; mint: string; decimals: number; recipient: string; url: string };
type WalletProvider = {
  publicKey?: { toBase58(): string; toBytes(): Uint8Array } | null;
  connect(): Promise<{ publicKey: { toBase58(): string } }>;
  signAndSendTransaction(tx: unknown): Promise<{ signature: string }>;
};

/** The browser wallets that speak the Solana provider API. */
function findWallet(): { name: string; provider: WalletProvider } | null {
  const w = window as unknown as Record<string, any>;
  if (w.phantom?.solana?.isPhantom) return { name: "Phantom", provider: w.phantom.solana };
  if (w.solflare?.isSolflare) return { name: "Solflare", provider: w.solflare };
  if (w.backpack?.solana) return { name: "Backpack", provider: w.backpack.solana };
  if (w.solana) return { name: "wallet", provider: w.solana };
  return null;
}

/**
 * Plus checkout: 10 USDC on Solana. Scan the QR with a phone wallet, or pay
 * from a browser wallet; either way the server finds the transfer on-chain by
 * its reference key and turns Plus on.
 */
export function PlusCheckout({ enabled, note }: { enabled: boolean; note: string }) {
  const { refresh } = useAuth();
  const [co, setCo] = useState<Checkout | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "creating" | "waiting" | "sending" | "paid" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const [wallet, setWallet] = useState<string | null>(null);
  const polling = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setWallet(findWallet()?.name ?? null);
    return () => {
      if (polling.current) clearInterval(polling.current);
    };
  }, []);

  const start = async () => {
    setState("creating");
    setMsg(null);
    const r = await fetch("/api/plus/checkout", { method: "POST" });
    const j = await r.json();
    if (!r.ok) {
      setState("error");
      setMsg(j.error ?? "Couldn't start the checkout.");
      return;
    }
    setCo(j);
    const QR = await import("qrcode");
    // pixel QR, in the site's colors
    setQr(await QR.toDataURL(j.url, { margin: 1, scale: 1, errorCorrectionLevel: "M", color: { dark: "#050506", light: "#F2F1EC" } }));
    setState("waiting");
    const began = Date.now();
    polling.current = setInterval(async () => {
      if (Date.now() - began > 30 * 60_000) {
        clearInterval(polling.current!);
        setMsg("Still waiting for the payment. If you've sent it, this page picks it up when you come back.");
        return;
      }
      const s = await fetch(`/api/plus/status?ref=${j.reference}`).then((x) => x.json()).catch(() => null);
      if (s?.status === "paid") {
        clearInterval(polling.current!);
        setState("paid");
        refresh();
      }
    }, 4000);
  };

  const payInBrowser = async () => {
    const found = findWallet();
    if (!found || !co) return;
    setState("sending");
    setMsg(null);
    try {
      const [{ Connection, PublicKey, Transaction }, spl] = await Promise.all([import("@solana/web3.js"), import("@solana/spl-token")]);
      const { publicKey } = await found.provider.connect();
      const owner = new PublicKey(publicKey.toBase58());
      const mint = new PublicKey(co.mint);
      const to = new PublicKey(co.recipient);
      const ix = spl.createTransferCheckedInstruction(
        spl.getAssociatedTokenAddressSync(mint, owner),
        mint,
        spl.getAssociatedTokenAddressSync(mint, to),
        owner,
        BigInt(Math.round(co.amount * 10 ** co.decimals)),
        co.decimals,
      );
      // the reference key lets the server find this exact payment
      ix.keys.push({ pubkey: new PublicKey(co.reference), isSigner: false, isWritable: false });
      const connection = new Connection(`${location.origin}/api/plus/rpc`, "confirmed");
      const { blockhash } = await connection.getLatestBlockhash();
      const tx = new Transaction({ feePayer: owner, recentBlockhash: blockhash }).add(ix);
      await found.provider.signAndSendTransaction(tx);
      setState("waiting");
      setMsg("Sent. Confirming on Solana — usually a few seconds.");
    } catch (err) {
      setState("waiting");
      setMsg((err as Error)?.message?.includes("User rejected") ? "Cancelled in the wallet." : "The wallet didn't send it. You can also scan the QR.");
    }
  };

  if (!enabled) return <p className="font-pixel text-sm text-particle">Payments coming soon.</p>;
  if (state === "paid") return <p className="font-pixel text-body text-ceramic">Plus is on. Thank you — enjoy the bigger sessions.</p>;

  return (
    <div>
      {state === "idle" || state === "creating" || state === "error" ? (
        <button onClick={start} disabled={state === "creating"} className="btn-ceramic">
          {state === "creating" ? "Preparing…" : "Pay 10 USDC on Solana"}
        </button>
      ) : (
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          {qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="Solana Pay QR code for 10 USDC" width={184} height={184} className="h-[184px] w-[184px] shrink-0" style={{ imageRendering: "pixelated" }} />
          )}
          <div className="min-w-0 space-y-3">
            <p className="font-pixel text-sm text-ceramic">Scan with Phantom, Solflare or any Solana Pay wallet.</p>
            {wallet && (
              <button onClick={payInBrowser} disabled={state === "sending"} className="btn-ceramic">
                {state === "sending" ? "Check your wallet…" : `Pay with ${wallet}`}
              </button>
            )}
            {co && (
              <a href={co.url} className="link-quiet block">
                Open in a wallet app <span className="arrow">↗</span>
              </a>
            )}
            <p className="font-pixel text-xs text-muted">Waiting for the transfer… this updates by itself.</p>
          </div>
        </div>
      )}
      {msg && <p className="mt-3 text-sm text-particle">{msg}</p>}
      <p className="mt-4 font-pixel text-xs text-muted">{note}</p>
    </div>
  );
}
