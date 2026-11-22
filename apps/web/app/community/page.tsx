import type { Metadata } from "next";

import { CommunityBrowser } from "@/components/community/CommunityBrowser";
import { Ticker } from "@/components/early/Ticker";
import { AppLink } from "@/components/ui/AppLink";
import { community } from "@/config/community";
import { formatCount, isCommunity } from "@/lib/intelligences";
import { loadIntelligences } from "@/lib/server/data";

export const revalidate = 600;
export const metadata: Metadata = {
  title: "Community minds",
  description: "Minds people added to Influencer Intelligence: any account on X, built from every public post. Open source.",
};

export default async function CommunityPage() {
  const minds = (await loadIntelligences()).filter(isCommunity);
  return (
    <div className="mx-auto max-w-site px-gutter pb-24 pt-[calc(var(--ii-topbar-h)+40px)]">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <h1 className="text-h2">Community minds</h1>
          <p className="mt-3 max-w-[60ch] text-body text-particle">
            Minds people added. Anyone on X, built from every public post. At {formatCount(community.mainFollowers)} followers a mind moves up to the main list.
          </p>
        </div>
        <AppLink href="/add" className="btn-ceramic shrink-0">
          + Add a mind
        </AppLink>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-panel border border-dashed border-line px-4 py-3 font-pixel text-xs text-particle">
        <span>
          Added a mind? Every person who talks to it gets you{" "}
          <span className="text-ceramic">
            +{community.perPerson} <Ticker />
          </span>
          , up to {community.capPerMind.toLocaleString("en-US")} per mind.
        </span>
        <AppLink href="/account#your-minds" className="link-quiet">
          Your minds <span className="arrow">↗</span>
        </AppLink>
      </div>

      <div className="mt-8">
        <CommunityBrowser minds={minds} />
      </div>
    </div>
  );
}
