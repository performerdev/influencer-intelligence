import type { Metadata } from "next";

import { EarlyMind } from "@/components/early/EarlyMind";

export const metadata: Metadata = {
  title: "Waitlist",
  description: "Get on the ii waitlist: log in with X, three quick tasks, the Waitlist role and a numbered spot.",
  openGraph: { title: "Waitlist · Influencer Intelligence", description: "First in line for what we ship next. One spot per X account." },
};

/** The waitlist: the same page for everyone; where you are in it comes from /api/early in the browser. */
export default function WaitlistPage() {
  return <EarlyMind />;
}
