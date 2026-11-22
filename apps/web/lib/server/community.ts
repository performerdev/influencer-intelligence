import "server-only";

import { earnedFor } from "@/config/community";
import type { Intelligence } from "@/lib/intelligences";

import { loadIntelligences, peopleByMind, sql } from "./data";

export type BuiltMind = Intelligence & { people: number; earned: number };

/** The minds this person added through Add (live ones), with what each has earned them. */
export async function mindsAddedBy(userId: number): Promise<BuiltMind[]> {
  const rows = await sql()<{ code: string }[]>`select code from influencers where added_by = ${userId} and not coalesce(hidden, false) order by created_at`;
  if (!rows.length) return [];
  const all = await loadIntelligences();
  return rows
    .map((r) => all.find((i) => i.code === r.code))
    .filter((i): i is Intelligence => !!i)
    .map((i) => ({ ...i, people: i.people ?? 0, earned: earnedFor(i.people ?? 0) }));
}

/** $ii earned for minds added, for the Early allocation: total and per person, by user id. */
export async function builderEarnings(): Promise<Map<number, { minds: number; earned: number }>> {
  const [rows, reach] = await Promise.all([sql()<{ id: number; added_by: number }[]>`select id, added_by from influencers where added_by is not null and not coalesce(hidden, false)`, peopleByMind()]);
  const out = new Map<number, { minds: number; earned: number }>();
  for (const r of rows) {
    const cur = out.get(r.added_by) ?? { minds: 0, earned: 0 };
    out.set(r.added_by, { minds: cur.minds + 1, earned: cur.earned + earnedFor(reach.get(r.id) ?? 0) });
  }
  return out;
}

export async function builderEarningsOf(userId: number): Promise<{ minds: number; earned: number }> {
  return (await builderEarnings()).get(userId) ?? { minds: 0, earned: 0 };
}

/** "Added by @you" on or off for the minds this person added. */
export async function setShowAddedBy(userId: number, on: boolean) {
  await sql()`update users set show_added_by = ${on} where id = ${userId}`;
}

/** Has this person finished Early (wallet + three tasks)? Builder $ii lands on that allocation. */
export async function earlyDone(userId: number): Promise<boolean> {
  const [r] = await sql()<{ n: number | null }[]>`select number as n from early where user_id = ${userId}`.catch(() => []);
  return r?.n != null;
}
