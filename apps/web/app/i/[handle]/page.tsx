import { notFound } from "next/navigation";

import { ParticleSignature } from "@/components/particles/ParticleSignature";
import { getIntelligences } from "@/lib/intelligences";

/** Placeholder until deliverable 4 (the chat) lands — keeps card links from 404-ing. */
export default async function IntelligencePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const it = getIntelligences().find((i) => i.handle === handle);
  if (!it) notFound();
  return (
    <section className="mx-auto flex min-h-[100svh] max-w-site flex-col items-center justify-center px-gutter pt-topbar text-center">
      <ParticleSignature handle={it.handle} postsParsed={it.postsParsed} postsPerDay={it.postsPerDay} size={200} />
      <p className="mt-8 font-mono text-xs text-muted">{it.code}</p>
      <h1 className="mt-1 text-h2 font-medium">@{it.handle}</h1>
      <p className="mt-3 max-w-[52ch] text-sm text-muted">
        Unofficial AI model built from public posts. Not affiliated with @{it.handle}. Not financial advice.
      </p>
      <p className="mt-8 text-particle">The chat arrives in the next build step.</p>
    </section>
  );
}

export function generateStaticParams() {
  return getIntelligences().map((i) => ({ handle: i.handle }));
}
