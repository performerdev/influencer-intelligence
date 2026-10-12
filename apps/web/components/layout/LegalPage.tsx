/** Shared frame for Privacy, Terms and the takedown form. */
export function LegalPage({ title, updated, intro, children }: { title: string; updated?: string; intro?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[760px] px-gutter pb-24 pt-[calc(var(--ii-topbar-h)+40px)]">
      <h1 className="text-h2">{title}</h1>
      {updated && <p className="mt-2 font-pixel text-xs text-muted">Last updated {updated}</p>}
      {intro && <div className="mt-6 text-lead text-particle">{intro}</div>}
      <div className="legal mt-10 space-y-8 text-sm leading-relaxed text-particle">{children}</div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-body font-medium text-ceramic">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}
