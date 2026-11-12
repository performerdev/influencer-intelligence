import type { Metadata } from "next";

import { EarlyMind } from "@/components/early/EarlyMind";

export const metadata: Metadata = {
  title: "Early",
  description: "Early Mind hands out $ii before launch: log in with X, three quick tasks, 10,000 $ii.",
  openGraph: { title: "Early Mind · Influencer Intelligence", description: "Get 10,000 $ii before launch. One allocation per X account." },
};

/** Early $ii: the same page for everyone; where you are in it comes from /api/early in the browser. */
export default function EarlyPage() {
  return <EarlyMind />;
}
