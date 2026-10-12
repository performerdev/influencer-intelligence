import { notFound } from "next/navigation";

import { PayPanel } from "@/components/account/PlusCheckout";
import { payments } from "@/config/payments";
import { checkoutInfo } from "@/lib/server/plus";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pay for Plus", robots: { index: false } };

/**
 * A checkout opened inside a wallet app's browser (no login there): pay from
 * the wallet right on this page. The reference in the URL is the checkout.
 */
export default async function PayPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const info = await checkoutInfo(ref);
  if (!info) notFound();
  return (
    <main className="mx-auto max-w-[640px] px-gutter pb-24 pt-[calc(var(--ii-topbar-h)+40px)]">
      <h1 className="text-h3">{info.purpose === "add" ? info.label : "Plus"} · {info.amount} USDC</h1>
      <div className="mt-8">
        <PayPanel co={info} />
      </div>
      <p className="mt-8 font-pixel text-xs text-muted">{payments.note}</p>
    </main>
  );
}
