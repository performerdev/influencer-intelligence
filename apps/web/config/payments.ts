/**
 * Plus is paid in USDC on Solana (Solana Pay transfer request with a reference
 * key, verified on-chain). The receiving wallet comes from env so it can be
 * set in Netlify without a code change; while it's empty the UI says
 * "Payments coming soon".
 */
export const payments = {
  chain: "solana" as const,
  token: "USDC" as const,
  /** USDC SPL mint on Solana mainnet */
  mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  decimals: 6,
  recipient: process.env.NEXT_PUBLIC_PLUS_RECIPIENT ?? "",
  label: "Influencer Intelligence",
  /** shown under the checkout */
  note: "Soon Plus will be paid in our own token only.",
};

export const plusPaymentsEnabled = () => Boolean(payments.recipient);
