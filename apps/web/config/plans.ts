/**
 * Plans and limits. Budgets are in real model cost (USD), not message counts:
 * a short question costs a fraction of a cent, a long debate more — the meter
 * shows what was actually used. One message is typically $0.003–0.02.
 */
export const plans = {
  /** not logged in: one message, then "log in with X" */
  guest: { label: "Guest", messages: 1, windowHours: 24 },
  free: {
    label: "Free",
    sessionUsd: 0.1,
    sessionHours: 4,
    maxAnswerTokens: 900,
    debate: false,
    historyDays: 7,
  },
  plus: {
    label: "Plus",
    priceUsd: 10,
    days: 30,
    sessionUsd: 0.6, // 6× free
    sessionHours: 4,
    /** fair-use ceiling per 30-day period; past it, Plus falls back to the free session size */
    periodCapUsd: 8,
    maxAnswerTokens: 1600,
    debate: true,
    historyDays: null as number | null, // forever
  },
} as const;

export type PlanName = "guest" | "free" | "plus";
