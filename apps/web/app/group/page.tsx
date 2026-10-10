import type { Metadata } from "next";

import { GroupView } from "@/components/group/GroupView";
import { loadIntelligences } from "@/lib/server/data";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "Group",
  description: "Put 2–4 intelligences in one chat and watch them answer and argue with each other.",
};

export default async function GroupPage({ searchParams }: { searchParams: Promise<{ with?: string }> }) {
  const { with: w } = await searchParams;
  const all = await loadIntelligences();
  const available = all.filter((i) => i.distilledAt);
  const wanted = (w ?? "").split(",").map((h) => h.trim().replace(/^@/, "").toLowerCase()).filter(Boolean);
  const initial = wanted
    .map((h) => available.find((i) => i.handle.toLowerCase() === h))
    .filter((i): i is (typeof available)[number] => !!i)
    .slice(0, 4)
    .map((i) => i.handle);
  return <GroupView available={available} initial={initial} />;
}
