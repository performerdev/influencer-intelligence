"use client";

/**
 * Wallet module — one provider, one pay() function. Chain, RPC, token and
 * receiving address all come from config/chain.ts + config/token.ts. Until
 * those are filled in, payments are disabled and the UI says so.
 * No real payment logic lives here until the contracts are provided.
 */
import { createContext, useContext, useMemo, useState } from "react";

import { paymentsEnabled } from "@/config/chain";

type WalletState = {
  enabled: boolean;
  address: string | null;
  connect: () => Promise<void>;
  pay: (amountUsd: number) => Promise<{ txHash: string }>;
};

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address] = useState<string | null>(null);
  const value = useMemo<WalletState>(
    () => ({
      enabled: paymentsEnabled,
      address,
      async connect() {
        if (!paymentsEnabled) throw new Error("Payments coming soon");
        // TODO: wire the chain's wallet adapter once config/chain.ts is set.
        throw new Error("Wallet adapter not configured");
      },
      async pay() {
        if (!paymentsEnabled) throw new Error("Payments coming soon");
        throw new Error("Wallet adapter not configured");
      },
    }),
    [address],
  );
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}
