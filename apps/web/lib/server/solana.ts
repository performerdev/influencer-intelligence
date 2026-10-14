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

/* ── Plain transfers (no reference key): a copy-paste send from any wallet or exchange ── */

const recipientDelta = (tx: ParsedTx): bigint => {
  const mine = (b: TokenBalance) => b.mint === payments.mint && b.owner === payments.recipient;
  const pre = tx.meta?.preTokenBalances?.filter(mine).reduce((a, b) => a + BigInt(b.uiTokenAmount.amount), 0n) ?? 0n;
  const post = tx.meta?.postTokenBalances?.filter(mine).reduce((a, b) => a + BigInt(b.uiTokenAmount.amount), 0n) ?? 0n;
  return post - pre;
};

export const toUnits = (amountUsd: number) => BigInt(Math.round(amountUsd * 10 ** payments.decimals));
export const validSignature = (s: string) => /^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(s);

export type Incoming = { signature: string; units: bigint; time: number };

// a confirmed transaction never changes, so what it paid us is cached for the life of the instance
const seen = new Map<string, Incoming | null>();

/** USDC this transaction moved into the recipient wallet (null: failed, unknown, or nothing received). */
export async function receivedIn(signature: string): Promise<Incoming | null> {
  if (seen.has(signature)) return seen.get(signature)!;
  const tx = await rpc<(ParsedTx & { blockTime?: number | null }) | null>("getTransaction", [signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]);
  if (!tx) return null; // not found yet: don't cache, it may still land
  const units = tx.meta && !tx.meta.err ? recipientDelta(tx) : 0n;
  const r = units > 0n ? { signature, units, time: tx.blockTime ?? 0 } : null;
  if (seen.size > 5000) seen.clear();
  seen.set(signature, r);
  return r;
}

let tokenAccounts: { at: number; list: string[] } | null = null;
/** The recipient's USDC token account(s): plain transfers show up in their history. */
async function recipientTokenAccounts(): Promise<string[]> {
  if (tokenAccounts && Date.now() - tokenAccounts.at < 3_600_000) return tokenAccounts.list;
  const r = await rpc<{ value: { pubkey: string }[] }>("getTokenAccountsByOwner", [payments.recipient, { mint: payments.mint }, { encoding: "jsonParsed", commitment: "confirmed" }]);
  tokenAccounts = { at: Date.now(), list: r.value.map((v) => v.pubkey) };
  return tokenAccounts.list;
}

let recent: { at: number; sigs: { signature: string; time: number }[] } | null = null;
/** USDC received since `sinceSec` (unix seconds), newest first. One history read per ~10s, shared by every checkout. */
export async function incomingSince(sinceSec: number): Promise<Incoming[]> {
  if (!recent || Date.now() - recent.at > 10_000) {
    const sigs: { signature: string; time: number }[] = [];
    for (const acc of await recipientTokenAccounts()) {
      const list = await rpc<{ signature: string; err: unknown; blockTime?: number | null }[]>("getSignaturesForAddress", [acc, { limit: 50, commitment: "confirmed" }]);
      for (const s of list) if (!s.err) sigs.push({ signature: s.signature, time: s.blockTime ?? 0 });
    }
    recent = { at: Date.now(), sigs: sigs.sort((a, b) => b.time - a.time) };
  }
  const out: Incoming[] = [];
  for (const s of recent.sigs) {
    if (s.time && s.time < sinceSec) continue;
    const r = await receivedIn(s.signature).catch(() => null);
    if (r) out.push(r);
  }
  return out;
}
