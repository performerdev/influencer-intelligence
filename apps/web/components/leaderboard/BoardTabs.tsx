import { AppLink } from "@/components/ui/AppLink";

/** The leaderboard has two sides: who calls best (minds) and what got called (coins). */
export function BoardTabs({ active }: { active: "minds" | "coins" }) {
  const tabs = [
    { id: "minds", href: "/leaderboard", label: "Minds" },
    { id: "coins", href: "/coins", label: "Coins" },
  ] as const;
  return (
    <nav aria-label="Leaderboard" className="flex w-fit border border-line font-pixel text-xs">
      {tabs.map((t, i) => (
        <AppLink
          key={t.id}
          href={t.href}
          aria-current={active === t.id ? "page" : undefined}
          className={`px-3 py-1.5 transition-colors duration-fast ${i ? "border-l border-line" : ""} ${active === t.id ? "bg-ceramic text-void" : "text-muted hover:text-ceramic"}`}
        >
          {t.label}
        </AppLink>
      ))}
    </nav>
  );
}
