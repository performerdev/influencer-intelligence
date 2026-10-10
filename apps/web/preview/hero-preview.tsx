/**
 * Standalone build of the real home stage (hero + intelligences) — the same
 * components the Next app renders, bundled into one HTML file for review.
 * Build: pnpm preview:hero
 */
import { createRoot } from "react-dom/client";

import { HomeStage } from "@/components/home/HomeStage";
import { SmoothScroll } from "@/components/layout/SmoothScroll";
import { TopBar } from "@/components/layout/TopBar";
import { getIntelligences } from "@/lib/intelligences";
import { WalletProvider } from "@/modules/wallet";

createRoot(document.getElementById("root")!).render(
  <WalletProvider>
    <SmoothScroll />
    <TopBar />
    <main className="relative">
      <HomeStage intelligences={getIntelligences()} />
    </main>
    <footer className="mx-auto max-w-site px-gutter pb-16 pt-8">
      <p className="font-mono text-xs text-muted">Preview · deliverables 1–2 (design system + hero). Screens 3–6 come next.</p>
    </footer>
  </WalletProvider>,
);
