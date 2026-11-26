/**
 * Main and Community minds, and what the person who added a mind gets for it.
 *
 * Main: the launch minds, any mind we build ourselves, and any added mind whose
 * account has at least `mainFollowers` followers on X (re-read every week with the
 * brain, so a mind that crosses the line moves up by itself). An admin can pin a
 * mind to either list from /admin. Everything else added through Add is Community.
 *
 * Builders: every person who talks to a mind you added earns you `perPerson` $ii,
 * up to `capPerMind` per mind, paid to the wallet on your waitlist spot. A person counts once
 * per mind, only when logged in with X, never the builder, and only if their X
 * account is older than `minAccountDays` (so a farm of fresh accounts earns nothing).
 */
export const community = {
  mainFollowers: 100_000,
  perPerson: 100,
  capPerMind: 10_000,
  minAccountDays: 90,
} as const;

export type Tier = "main" | "community";

/** $ii a mind has earned the person who added it. */
export const earnedFor = (people: number) => Math.min(community.capPerMind, Math.max(0, people) * community.perPerson);
