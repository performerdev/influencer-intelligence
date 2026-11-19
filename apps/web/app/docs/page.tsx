import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocAnchors } from "@/components/docs/DocAnchors";
import { DocView } from "@/components/docs/DocView";
import { loadDoc } from "@/lib/docs";

// Built once at deploy from docs/README.md.
export const dynamic = "force-static";

export function generateMetadata(): Metadata {
  const doc = loadDoc("");
  return { title: "Docs", description: doc?.description || "How Influencer Intelligence works, from reading posts to answering a question. Open source." };
}

export default function DocsHome() {
  const doc = loadDoc("");
  if (!doc) notFound();
  return (
    <>
      <DocView doc={doc} />
      <DocAnchors />
    </>
  );
}
