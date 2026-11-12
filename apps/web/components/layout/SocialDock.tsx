"use client";

import { usePathname } from "next/navigation";

import { useAuth } from "@/components/account/AuthProvider";
import { site } from "@/config/site";

/** Where the project lives elsewhere. A link with no address yet shows as "soon". */
export const socials = () => [
  { label: "X", href: site.xUrl },
  { label: "GitHub", href: site.githubUrl },
  { label: "Docs", href: site.docsUrl },
  { label: "Discord", href: site.discordUrl },
];

/**
 * The project's links, docked in the bottom-right corner. On pages with a chat
 * box at the bottom it shows only on wide screens, where the box is centered
 * and the corner is free; on phones the links live in the menu and the footer.
 */
export function SocialDock() {
  const path = usePathname() ?? "/";
  const { me } = useAuth();
  const chat = (path === "/" && !!me?.user) || path.startsWith("/i/") || path.startsWith("/group") || path === "/early";
  return (
    <nav
      aria-label="Project links"
      className={`fixed bottom-[max(16px,env(safe-area-inset-bottom))] right-[max(16px,env(safe-area-inset-right))] z-[45] items-center rounded-chip border border-line bg-void/85 p-1 font-pixel text-xs backdrop-blur-md ${chat ? "hidden xl:flex" : "hidden md:flex"}`}
    >
      {socials().map((s) =>
        s.href ? (
          <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1.5 text-particle transition-colors duration-fast hover:text-ceramic">
            {s.label}
          </a>
        ) : (
          <span key={s.label} title="Soon" className="cursor-default px-2.5 py-1.5 text-muted/60">
            {s.label}
          </span>
        ),
      )}
    </nav>
  );
}
