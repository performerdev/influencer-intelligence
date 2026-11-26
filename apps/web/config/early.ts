/**
 * The waitlist on /waitlist, run by Waitlist Mind (ii-00): log in with X, add a
 * wallet, three tasks on X → the Waitlist role and a spot number. No $ii here.
 * (The code and the table keep the old name, `early`.)
 */
export const early = {
  /** cookie set by an invite link (/e/<handle>) */
  refCookie: "ii_ref",
} as const;

/** A spot on the waitlist: #0001, #0002, … */
export const earlyCode = (n: number) => `#${String(n).padStart(4, "0")}`;
