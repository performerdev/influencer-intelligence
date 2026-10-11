"use client";

/**
 * Solana wallets in the browser, through the Wallet Standard — the same
 * discovery @wallet-standard/app does, without the package. Phantom, OKX,
 * Solflare, Backpack, Coinbase, Trust, Bitget, Glow… all register themselves
 * this way, with their own name and icon. Older wallets that only inject
 * window.solana are picked up as a fallback.
 */

export type WalletAccount = { address: string; publicKey: Uint8Array; chains?: readonly string[] };
type StdWallet = {
  name: string;
  icon: string;
  chains: readonly string[];
  accounts: readonly WalletAccount[];
  features: Record<string, any>;
};
type LegacyProvider = {
  connect(): Promise<{ publicKey: { toBase58(): string } }>;
  signAndSendTransaction(tx: unknown): Promise<{ signature: string }>;
};

export type Wallet = {
  name: string;
  icon: string | null;
  std?: StdWallet;
  legacy?: LegacyProvider;
};

const CHAIN = "solana:mainnet";

function usable(w: StdWallet) {
  return (
    !!w.features?.["standard:connect"] &&
    !!w.features?.["solana:signAndSendTransaction"] &&
    (w.chains?.some((c) => c.startsWith("solana:")) ?? false)
  );
}

/** Watch for wallets; calls back with the current list whenever one registers. */
export function watchWallets(onChange: (wallets: Wallet[]) => void): () => void {
  const found = new Map<string, StdWallet>();
  const emit = () => {
    const list: Wallet[] = [...found.values()].map((std) => ({ name: std.name, icon: std.icon ?? null, std }));
    // wallets that predate the standard
    const w = window as unknown as Record<string, any>;
    const legacy: [string, any][] = [
      ["Phantom", w.phantom?.solana?.isPhantom ? w.phantom.solana : null],
      ["Solflare", w.solflare?.isSolflare ? w.solflare : null],
      ["OKX Wallet", w.okxwallet?.solana ?? null],
      ["Backpack", w.backpack?.solana ?? null],
    ];
    for (const [name, p] of legacy) if (p && !list.some((x) => x.name.toLowerCase().startsWith(name.toLowerCase().split(" ")[0]))) list.push({ name, icon: null, legacy: p });
    if (!list.length && w.solana?.signAndSendTransaction) list.push({ name: "Solana wallet", icon: null, legacy: w.solana });
    onChange(list);
  };
  const api = {
    register: (...wallets: StdWallet[]) => {
      for (const s of wallets) if (usable(s)) found.set(s.name, s);
      emit();
      return () => {
        for (const s of wallets) found.delete(s.name);
        emit();
      };
    },
  };
  const onRegister = (e: Event) => {
    try {
      (e as CustomEvent<(a: typeof api) => void>).detail(api);
    } catch {
      /* a broken wallet shouldn't break the page */
    }
  };
  window.addEventListener("wallet-standard:register-wallet", onRegister);
  try {
    window.dispatchEvent(new CustomEvent("wallet-standard:app-ready", { detail: api }));
  } catch {
    /* ignore */
  }
  emit();
  // some extensions inject late
  const t = setTimeout(emit, 800);
  return () => {
    clearTimeout(t);
    window.removeEventListener("wallet-standard:register-wallet", onRegister);
  };
}

export type Checkout = { reference: string; amount: number; mint: string; decimals: number; recipient: string; url: string };

/**
 * Pay a checkout from a browser wallet: a USDC transferChecked to the
 * recipient, with the checkout's reference key attached so the server can
 * find this exact payment on-chain.
 */
export async function payWith(wallet: Wallet, co: Checkout, rpcUrl: string): Promise<string> {
  const [{ Connection, PublicKey, Transaction }, spl] = await Promise.all([import("@solana/web3.js"), import("@solana/spl-token")]);
  let owner: InstanceType<typeof PublicKey>;
  let account: WalletAccount | null = null;
  if (wallet.std) {
    const res = await wallet.std.features["standard:connect"].connect();
    const accounts: readonly WalletAccount[] = res?.accounts ?? wallet.std.accounts;
    account = accounts.find((a) => a.chains?.includes(CHAIN)) ?? accounts[0] ?? null;
    if (!account) throw new Error("The wallet didn't share an account.");
    owner = new PublicKey(account.publicKey ?? account.address);
  } else {
    const { publicKey } = await wallet.legacy!.connect();
    owner = new PublicKey(publicKey.toBase58());
  }
  const mint = new PublicKey(co.mint);
  const to = new PublicKey(co.recipient);
  const from = spl.getAssociatedTokenAddressSync(mint, owner, true);
  const connection = new Connection(rpcUrl, "confirmed");

  // a clear message instead of a failed simulation when the wallet has no USDC
  const bal = await connection.getTokenAccountBalance(from).catch(() => null);
  const need = BigInt(Math.round(co.amount * 10 ** co.decimals));
  if (!bal || BigInt(bal.value.amount) < need) throw new Error(`NO_USDC:${bal?.value.uiAmountString ?? "0"}`);

  const ix = spl.createTransferCheckedInstruction(from, mint, spl.getAssociatedTokenAddressSync(mint, to, true), owner, need, co.decimals);
  ix.keys.push({ pubkey: new PublicKey(co.reference), isSigner: false, isWritable: false });
  const { blockhash } = await connection.getLatestBlockhash();
  const tx = new Transaction({ feePayer: owner, recentBlockhash: blockhash }).add(ix);

  if (wallet.std && account) {
    const chain = wallet.std.chains.includes(CHAIN) ? CHAIN : wallet.std.chains.find((c) => c.startsWith("solana:")) ?? CHAIN;
    const [out] = await wallet.std.features["solana:signAndSendTransaction"].signAndSendTransaction({
      account,
      chain,
      transaction: tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
      options: { commitment: "confirmed" },
    });
    return typeof out?.signature === "string" ? out.signature : "";
  }
  const { signature } = await wallet.legacy!.signAndSendTransaction(tx);
  return signature;
}

/** Open a page inside a wallet app's own browser (mobile). */
export function openInWalletLinks(pageUrl: string): { name: string; href: string }[] {
  const u = encodeURIComponent(pageUrl);
  const ref = encodeURIComponent(new URL(pageUrl).origin);
  return [
    { name: "Phantom", href: `https://phantom.app/ul/browse/${u}?ref=${ref}` },
    { name: "OKX Wallet", href: `https://web3.okx.com/download?deeplink=${encodeURIComponent(`okx://wallet/dapp/url?dappUrl=${u}`)}` },
    { name: "Solflare", href: `https://solflare.com/ul/v1/browse/${u}?ref=${ref}` },
    { name: "Backpack", href: `https://backpack.app/ul/v1/browse/${u}?ref=${ref}` },
  ];
}
