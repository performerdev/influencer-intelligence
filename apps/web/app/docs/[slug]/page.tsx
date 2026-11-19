import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocAnchors } from "@/components/docs/DocAnchors";
import { DocView } from "@/components/docs/DocView";
import { DOC_PAGES, loadDoc } from "@/lib/docs";

// Every page is built at deploy from its file in docs/; there are no others.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return DOC_PAGES.filter((p) => p.slug).map((p) => ({ slug: p.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const doc = loadDoc((await params).slug);
  return doc ? { title: `${doc.title} · Docs`, description: doc.description } : {};
}

export default async function DocPage({ params }: Props) {
  const doc = loadDoc((await params).slug);
  if (!doc) notFound();
  return (
    <>
      <DocView doc={doc} />
      <DocAnchors />
    </>
  );
}
