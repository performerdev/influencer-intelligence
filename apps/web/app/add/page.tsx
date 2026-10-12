import { AddFlow } from "@/components/add/AddFlow";
import { MARKUP } from "../../../../config/pricing";
import { addConfigured } from "@/lib/server/jobs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add a brain", description: "Clone any public mind on X. You pay the real API cost × 2, shown as a breakdown; it's live as soon as it's built." };

export default async function AddPage({ searchParams }: { searchParams: Promise<{ handle?: string }> }) {
  const { handle } = await searchParams;
  return (
    <div className="mx-auto max-w-[760px] px-gutter pb-24 pt-[calc(var(--ii-topbar-h)+40px)]">
      <h1 className="text-h2">Add a brain</h1>
      <p className="mt-4 max-w-[60ch] text-lead text-particle">
        Any public X account. We read every post, distill how the person thinks, and publish the brain the moment it&apos;s built — open source, like the rest. You pay the real API cost × {MARKUP}, shown line by line before you pay.
      </p>
      <div className="mt-10">
        <AddFlow enabled={addConfigured()} initialHandle={handle ?? ""} />
      </div>
    </div>
  );
}
