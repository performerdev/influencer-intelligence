import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { VerdictChip, type Verdict } from "@/components/chat/bits";
import { BrainAvatar } from "@/components/particles/BrainAvatar";
import { AppLink } from "@/components/ui/AppLink";
import { findIntelligence } from "@/lib/server/data";
import { loadShare } from "@/lib/server/share";
import { normalizeRefs } from "@/lib/refs";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

const plain = (s: string) => normalizeRefs(s).replace(/\s*\[post:\d+\]/g, "").trim();
const clip = (s: string, n: number) => (Array.from(s).length > n ? `${Array.from(s).slice(0, n).join("").trimEnd()}…` : s);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const s = await loadShare(id).catch(() => null);
  if (!s) return {};
  const title = s.question ? `@${s.handle}'s brain on “${clip(s.question, 70)}”` : `@${s.handle}'s brain`;
  const description = clip(plain(s.answer).replace(/\s+/g, " "), 180);
  return {
    title,
    description,
    openGraph: { title, description, type: "article" },
    twitter: { card: "summary_large_image", title, description },
    robots: { index: false },
  };
}

/** A shared answer: one question, one answer, and a way to ask the brain yourself. */
export default async function SharePage({ params }: Props) {
  const { id } = await params;
  const s = await loadShare(id, true).catch(() => null);
  if (!s) notFound();
  const it = await findIntelligence(s.handle);
  return (
    <div className="mx-auto max-w-[720px] px-gutter pb-24 pt-[calc(var(--ii-topbar-h)+40px)]">
      <div className="flex items-center gap-4">
        {it && <BrainAvatar it={it} size={72} />}
        <div className="min-w-0">
          <p className="font-mono text-xs" style={{ color: it?.color }}>{s.code}</p>
          <h1 className="truncate font-pixel text-h3">@{s.handle}&apos;s brain</h1>
          <p className="text-xs text-muted">Unofficial AI model built from public posts · not @{s.handle} · not financial advice</p>
        </div>
      </div>

      {s.question && (
        <div className="mt-10 flex justify-end">
          <p className="max-w-[85%] whitespace-pre-wrap rounded-panel border border-line bg-panel px-4 py-3 text-body">{s.question}</p>
        </div>
      )}
      <div className="mt-6">
        <p className="whitespace-pre-wrap text-body leading-relaxed text-ceramic">{plain(s.answer)}</p>
        {s.verdict && (
          <div className="mt-4">
            <VerdictChip verdict={s.verdict as Verdict} />
          </div>
        )}
        {s.others.length > 0 && <p className="mt-4 text-xs text-muted">From a group chat with {s.others.map((h) => `@${h}`).join(", ")}.</p>}
      </div>

      <div className="mt-12 flex flex-wrap items-center gap-3 border-t border-line pt-8">
        <AppLink href={`/i/${s.handle}`} className="btn-ceramic">
          Ask @{s.handle} yourself →
        </AppLink>
        <AppLink href="/#intelligences" className="btn-line">
          See all intelligences
        </AppLink>
      </div>
    </div>
  );
}
