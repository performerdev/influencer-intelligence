import "server-only";

import { randomBytes } from "node:crypto";

import { payments } from "@/config/payments";

/**
 * Solana Pay, server side, with plain JSON-RPC (no SDK on the server).
 * A checkout gets a random "reference" public key; the wallet adds it to the
 * transfer as a read-only key, so the payment can be found by searching that
 * address and checked on-chain: right mint, right recipient, enough USDC.
 */

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58(bytes: Uint8Array): string {
  let n = BigInt(`0x${Buffer.from(bytes).toString("hex") || "0"}`);
  let out = "";
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = `1${out}`;
  }
  return out;
}

/** A fresh 32-byte reference key (any 32 bytes is a valid address for Solana Pay references). */
export const newReference = () => base58(randomBytes(32));

export const rpcUrl = () => process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

export async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(rpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = (await res.json()) as { result?: T; error?: { message: string } };
  if (j.error) throw new Error(`solana rpc ${method}: ${j.error.message}`);
  return j.result as T;
}

/** Solana Pay transfer-request URL: wallets open it from a link or a QR code. */
export function transferUrl(reference: string, amountUsd: number, message: string) {
  const q = new URLSearchParams({
    amount: String(amountUsd),
    "spl-token": payments.mint,
    reference,
    label: payments.label,
    message,
  });
  return `solana:${payments.recipient}?${q.toString()}`;
}

type TokenBalance = { accountIndex: number; mint: string; owner?: string; uiTokenAmount: { amount: string } };
type ParsedTx = { meta: { err: unknown; preTokenBalances?: TokenBalance[]; postTokenBalances?: TokenBalance[] } | null };

/**
 * Find a confirmed transaction that carries `reference` and moved at least
 * `amountUsd` USDC to the recipient. Returns its signature, or null.
 */
export async function findPayment(reference: string, amountUsd: number): Promise<string | null> {
  const sigs = await rpc<{ signature: string; err: unknown }[]>("getSignaturesForAddress", [reference, { limit: 10, commitment: "confirmed" }]);
  const need = BigInt(Math.round(amountUsd * 10 ** payments.decimals));
  for (const s of sigs) {
    if (s.err) continue;
    const tx = await rpc<ParsedTx | null>("getTransaction", [s.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]);
    if (!tx?.meta || tx.meta.err) continue;
    const mine = (b: TokenBalance) => b.mint === payments.mint && b.owner === payments.recipient;
    const pre = tx.meta.preTokenBalances?.filter(mine).reduce((a, b) => a + BigInt(b.uiTokenAmount.amount), 0n) ?? 0n;
    const post = tx.meta.postTokenBalances?.filter(mine).reduce((a, b) => a + BigInt(b.uiTokenAmount.amount), 0n) ?? 0n;
    if (post - pre >= need) return s.signature;
  }
  return null;
}
