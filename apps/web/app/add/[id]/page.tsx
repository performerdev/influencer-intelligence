import { notFound } from "next/navigation";

import { BuildProgress } from "@/components/add/BuildProgress";
import { loadJob } from "@/lib/server/jobs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Building a brain", robots: { index: false } };

export default async function BuildPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await loadJob(id).catch(() => null);
  if (!job) notFound();
  return (
    <div className="mx-auto max-w-[760px] px-gutter pb-24 pt-[calc(var(--ii-topbar-h)+40px)]">
      <h1 className="text-h2">@{job.handle}&apos;s brain</h1>
      <div className="mt-10">
        <BuildProgress initial={job} />
      </div>
    </div>
  );
}
