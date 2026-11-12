/** Early $ii allocations, handed out by Early Mind on /early. Amounts are in $ii. */
export const early = {
  /** for the three tasks: follow, like + repost, reply */
  base: 10_000,
  /** for each invited friend who gets in */
  perInvite: 1_000,
  maxInvites: 10,
  /** cookie set by an invite link (/e/<handle>) */
  refCookie: "ii_ref",
} as const;

export const earlyCode = (n: number) => `E-${String(n).padStart(4, "0")}`;
