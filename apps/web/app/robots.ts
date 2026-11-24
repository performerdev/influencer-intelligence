import type { MetadataRoute } from "next";

/** Crawl the public pages; keep crawlers out of the API, checkouts, accounts and admin. */
export default function robots(): MetadataRoute.Robots {
  const site = (process.env.SITE_URL || "https://ii.plus").replace(/\/$/, "");
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/pay/", "/account", "/admin", "/add/", "/e/"] },
    sitemap: `${site}/sitemap.xml`,
  };
}
