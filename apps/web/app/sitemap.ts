import type { MetadataRoute } from "next";

import { DOC_PAGES } from "@/lib/docs";
import { loadIntelligences } from "@/lib/server/data";

export const revalidate = 3600;

/** The public pages, every mind's chat and track record, and the docs. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = (process.env.SITE_URL || "https://ii.plus").replace(/\/$/, "");
  const minds = await loadIntelligences().catch(() => []);
  const pages = ["/", "/leaderboard", "/coins", "/community", "/add", "/waitlist", "/group", "/docs"];
  return [
    ...pages.map((p) => ({ url: `${site}${p === "/" ? "" : p}`, changeFrequency: "daily" as const, priority: p === "/" ? 1 : 0.7 })),
    ...minds.flatMap((m) => [
      { url: `${site}/i/${m.handle}`, changeFrequency: "weekly" as const, priority: 0.8 },
      { url: `${site}/brain/${m.handle}`, changeFrequency: "weekly" as const, priority: 0.6 },
    ]),
    ...DOC_PAGES.filter((d) => d.slug).map((d) => ({ url: `${site}/docs/${d.slug}`, changeFrequency: "monthly" as const, priority: 0.4 })),
  ];
}
