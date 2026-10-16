"use client";

import { useState } from "react";

/** Everything needed to send a refund by hand: who paid, how much arrived, a wallet link that fills it in. */
export function RefundBox({ payer, amount, paidTx, url }: { payer: string | null; amount: number; paidTx: string | null; url: string | null }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (k: string, v: string) => {
    try {
      await navigator.clipboard.writeText(v);
      setCopied(k);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* selectable anyway */
    }
  };
  if (!paidTx) return <p className="text-muted">No payment transaction on record.</p>;
  return (
    <div className="space-y-1.5">
      <p>
        Refund <span className="text-ceramic">{amount} USDC</span> to{" "}
        {payer ? (
          <>
            <span className="break-all text-ceramic">{payer}</span>{" "}
            <button onClick={() => copy("payer", payer)} className="link-quiet">
              {copied === "payer" ? "Copied" : "Copy"}
            </button>
          </>
        ) : (
          <span className="text-muted">— payer not found in the transaction</span>
        )}
      </p>
      <p className="flex flex-wrap gap-x-4 gap-y-1">
        {url && (
          <a href={url} className="link-quiet">
            Open in wallet <span className="arrow">↗</span>
          </a>
        )}
        <a href={`https://solscan.io/tx/${paidTx}`} target="_blank" rel="noreferrer" className="link-quiet">
          Payment on Solscan <span className="arrow">↗</span>
        </a>
      </p>
      <p className="text-muted">If they paid from an exchange, this address is the exchange&apos;s: ask them for their own address first.</p>
    </div>
  );
}
