"use client";

import { usePathname } from "next/navigation";

import { AppLink } from "@/components/ui/AppLink";
import { site } from "@/config/site";

/** Site footer on content pages (chat and group are full-screen apps and don't get one). */
export function Footer() {
  const path = usePathname() ?? "/";
  if (path.startsWith("/i/") || path.startsWith("/group")) return null;
  return (
    <footer className="relative z-10 border-t border-line">
      <div className="mx-auto flex max-w-site flex-col gap-4 px-gutter py-8 font-pixel text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>Unofficial AI models built from public posts · not affiliated with the people modelled · not financial advice</p>
        <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Footer">
          <AppLink href="/privacy" className="hover:text-ceramic">Privacy</AppLink>
          <AppLink href="/terms" className="hover:text-ceramic">Terms</AppLink>
          <AppLink href="/takedown" className="hover:text-ceramic">Remove a brain</AppLink>
          <a href={site.githubUrl} target="_blank" rel="noopener noreferrer" className="hover:text-ceramic">GitHub</a>
        </nav>
      </div>
    </footer>
  );
}
