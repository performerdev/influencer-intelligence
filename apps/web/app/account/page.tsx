import type { Metadata } from "next";

import { LogoutButton } from "@/components/account/LogoutButton";
import { PlusCheckout } from "@/components/account/PlusCheckout";
import { UsageMeter, XGlyph } from "@/components/account/AuthProvider";
import { AppLink } from "@/components/ui/AppLink";
import { payments, plusPaymentsEnabled } from "@/config/payments";
import { plans } from "@/config/plans";
import { currentUser, isPlus, xLoginConfigured } from "@/lib/server/auth";
import { loadIntelligences } from "@/lib/server/data";
import { isAdmin } from "@/lib/server/ops";
import { hasDatabase } from "@/lib/server/data";
import { listChats } from "@/lib/server/history";

export const metadata: Metadata = { title: "Account" };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  "x-not-configured": "Login with X isn't switched on yet.",
  "x-denied": "You cancelled the login on X.",
  "x-state": "That login link expired. Try again.",
  "x-token": "X didn't accept the login. Try again.",
  "x-profile": "Couldn't read your X profile. Try again.",
};

const PERKS = [
  ["Session", "Standard, refills every 4h", `${Math.round(plans.plus.sessionUsd / plans.free.sessionUsd)}× bigger, refills every 4h`],
  ["Group debates", "—", "2 extra rounds where they argue"],
  ["Answers", "Standard length", "Longer, more detailed"],
  ["Chat history", `${plans.free.historyDays} days`, "Forever"],
] as const;

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const user = hasDatabase() ? await currentUser().catch(() => null) : null;
  const chats = user ? await listChats(user).catch(() => []) : [];
  const plus = isPlus(user);
  const colorOf = new Map((await loadIntelligences()).map((i) => [i.handle, i.color]));

  return (
    <div className="mx-auto max-w-[920px] px-gutter pb-24 pt-[calc(var(--ii-topbar-h)+40px)]">
      {error && ERRORS[error] && <p className="mb-6 rounded-panel border border-line bg-panel px-4 py-3 text-sm text-particle">{ERRORS[error]}</p>}

      {!user ? (
        <section>
          <h1 className="text-h2">Your account</h1>
          <p className="mt-3 max-w-[56ch] text-lead text-particle">Log in with X to get a session every 4 hours and keep your chats. X only shares your public profile — no email, no posting.</p>
          {xLoginConfigured() ? (
            <a href="/api/auth/x/login?next=/account" className="btn-ceramic mt-8">
              <XGlyph /> Log in with X
            </a>
          ) : (
            <p className="mt-8 font-pixel text-sm text-muted">Login with X opens shortly.</p>
          )}
        </section>
      ) : (
        <section className="flex flex-wrap items-center gap-5">
          {user.avatar_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatar_url.replace("_normal", "_200x200")} alt="" width={64} height={64} className="h-16 w-16 rounded-panel" style={{ imageRendering: "pixelated" }} />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-h2">@{user.handle}</h1>
            <p className="mt-1 font-pixel text-sm text-muted">
              {plus ? `Plus until ${new Date(user.plus_until!).toISOString().slice(0, 10)}` : "Free plan"}
              {user.name ? ` · ${user.name}` : ""}
            </p>
          </div>
          {isAdmin(user) && (
            <AppLink href="/admin" className="btn-line h-9 px-4">
              Admin
            </AppLink>
          )}
          <LogoutButton />
          <UsageMeter className="w-full" />
        </section>
      )}

      <section id="plus" className="mt-16 scroll-mt-24">
        <h2 className="text-h3">Plus · ${plans.plus.priceUsd} / {plans.plus.days} days</h2>
        <div className="mt-6 overflow-hidden rounded-panel border border-line">
          <table className="w-full text-left text-sm">
            <thead className="font-pixel text-xs text-muted">
              <tr className="border-b border-line">
                <th className="px-4 py-3 font-normal" />
                <th className="px-4 py-3 font-normal">Free</th>
                <th className="px-4 py-3 font-normal text-ceramic">Plus</th>
              </tr>
            </thead>
            <tbody>
              {PERKS.map(([k, f, p]) => (
                <tr key={k} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-pixel text-particle">{k}</td>
                  <td className="px-4 py-3 text-muted">{f}</td>
                  <td className="px-4 py-3 text-ceramic">{p}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">
          Short questions use less of a session than long ones or group debates. Plus includes a generous monthly fair-use limit; past it, sessions return to the standard size until the next period.
        </p>
        <div className="mt-8">
          {!user ? (
            <p className="font-pixel text-sm text-muted">Log in first to go Plus.</p>
          ) : plus ? (
            <div className="space-y-4">
              <p className="font-pixel text-sm text-ceramic">You're on Plus. Paying again adds {plans.plus.days} days.</p>
              <PlusCheckout enabled={plusPaymentsEnabled()} note={payments.note} />
            </div>
          ) : (
            <PlusCheckout enabled={plusPaymentsEnabled()} note={payments.note} />
          )}
        </div>
      </section>

      {user && (
        <section className="mt-16">
          <h2 className="text-h3">Your chats</h2>
          {chats.length === 0 ? (
            <p className="mt-4 text-sm text-muted">
              No chats yet. <AppLink href="/#intelligences" className="text-particle underline decoration-line-hover underline-offset-4">Pick an intelligence</AppLink>.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-line border-y border-line">
              {chats.map((c) => (
                <li key={c.id}>
                  <AppLink
                    href={c.kind === "group" ? `/group?c=${c.id}` : `/i/${c.handles[0]}?c=${c.id}`}
                    className="flex items-baseline gap-4 py-3 transition-colors duration-fast hover:bg-panel"
                  >
                    <span className="w-[42%] shrink-0 truncate font-pixel text-sm sm:w-[32%]">
                      {c.handles.map((h, i) => (
                        <span key={h} style={{ color: colorOf.get(h) }}>
                          {i ? " · " : ""}@{h}
                        </span>
                      ))}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-particle">{c.title}</span>
                    <span className="shrink-0 font-pixel text-xs text-muted">{c.updatedAt.slice(5, 10)}</span>
                  </AppLink>
                </li>
              ))}
            </ul>
          )}
          {!plus && <p className="mt-3 text-xs text-muted">Free keeps the last {plans.free.historyDays} days. Plus keeps everything.</p>}
        </section>
      )}
    </div>
  );
}
