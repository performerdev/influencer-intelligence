import { TakedownForm } from "@/components/account/TakedownForm";
import { LegalPage } from "@/components/layout/LegalPage";
import { loadIntelligences } from "@/lib/server/data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Remove a brain", description: "Ask for a brain to be removed, or for your account data to be deleted." };

export default async function Takedown() {
  const handles = (await loadIntelligences()).map((i) => i.handle);
  return (
    <LegalPage
      title="Remove a brain"
      intro="If you are one of the people modelled here — or represent them — and want your brain taken down, tell us below. Every request is read by a person; nothing is removed automatically."
    >
      <TakedownForm handles={handles} />
    </LegalPage>
  );
}
