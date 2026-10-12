import { notFound } from "next/navigation";

import { AdminButton } from "@/components/admin/AdminButton";
import { currentUser } from "@/lib/server/auth";
import { sql } from "@/lib/server/data";
import { dailyBudgetUsd, isAdmin, spentTodayUsd } from "@/lib/server/ops";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin", robots: { index: false } };

const usd = (x: number | string | null) => `$${Number(x ?? 0).toFixed(2)}`;
const ago = (d: Date | string) => {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  return s < 90 ? `${Math.round(s)}s` : s < 5400 ? `${Math.round(s / 60)}m` : s < 172800 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`;
};

/** Owner-only dashboard: usage, spend against the daily cap, errors, removal requests, paid builds. */
export default async function Admin() {
  const user = await currentUser().catch(() => null);
  if (!isAdmin(user)) notFound();
  const db = sql();
  // each block has its own time limit, so one slow query can't take the page down (and the log says which)
  const q = <T,>(name: string, p: PromiseLike<T>, fallback: unknown): Promise<T> => {
    const t0 = Date.now();
    return Promise.race([
      Promise.resolve(p).then((r) => (Array.isArray(r) ? ([...r] as T) : r)),
      new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000)),
    ])
      .then((r) => {
        if (Date.now() - t0 > 2000) console.warn(`admin ${name}: ${Date.now() - t0}ms`);
        return r;
      })
      .catch((err) => {
        console.error(`admin ${name}:`, (err as Error)?.message ?? err);
        return fallback as T;
      });
  };

  // one at a time: the Supabase transaction pooler stalls when one function pipelines many queries at once
  const today = await q("today", 
      db<{ messages: number; asked_users: number; asked_guests: number; new_users: number }[]>`
        select
          (select count(*)::int from messages where role = 'user' and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc') as messages,
          (select count(distinct user_id)::int from messages where role = 'user' and user_id is not null and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc') as asked_users,
          (select count(distinct client_hash)::int from messages where role = 'user' and user_id is null and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc') as asked_guests,
          (select count(*)::int from users where created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc') as new_users`,
      [],
    );
  const days = await q("days", 
      db<{ day: string; messages: number; people: number; chat_usd: string; other_usd: string; signups: number }[]>`
        with d as (select generate_series(date_trunc('day', now() at time zone 'utc') - interval '13 days', date_trunc('day', now() at time zone 'utc'), interval '1 day') as day)
        select to_char(d.day, 'Mon DD') as day,
          (select count(*)::int from messages m where m.role = 'user' and m.created_at >= d.day at time zone 'utc' and m.created_at < (d.day + interval '1 day') at time zone 'utc') as messages,
          (select count(distinct coalesce(m.user_id::text, m.client_hash))::int from messages m where m.role = 'user' and m.created_at >= d.day at time zone 'utc' and m.created_at < (d.day + interval '1 day') at time zone 'utc') as people,
          (select coalesce(sum(usd), 0) from spend s where s.kind = 'llm' and s.meta->>'step' in ('chat', 'group') and s.at >= d.day at time zone 'utc' and s.at < (d.day + interval '1 day') at time zone 'utc') as chat_usd,
          (select coalesce(sum(usd), 0) from spend s where not (s.kind = 'llm' and coalesce(s.meta->>'step', '') in ('chat', 'group')) and s.at >= d.day at time zone 'utc' and s.at < (d.day + interval '1 day') at time zone 'utc') as other_usd,
          (select count(*)::int from users u where u.created_at >= d.day at time zone 'utc' and u.created_at < (d.day + interval '1 day') at time zone 'utc') as signups
        from d order by d.day desc`,
      [],
    );
  const spendToday = await q("spendToday", spentTodayUsd(), 0);
  const users = await q("users", 
      db<{ total: number; plus: number; paid_7d: number; revenue_7d: string }[]>`
        select (select count(*)::int from users) as total,
          (select count(*)::int from users where plus_until > now()) as plus,
          (select count(*)::int from payments where status = 'paid' and paid_at > now() - interval '7 days') as paid_7d,
          (select coalesce(sum(amount_usd), 0) from payments where status = 'paid' and paid_at > now() - interval '7 days') as revenue_7d`,
      [],
    );
  const takedowns = await q("takedowns", db<{ id: string; handle: string; proof_url: string; contact: string | null; reason: string | null; note: string | null; status: string; created_at: Date }[]>`
        select id, handle, proof_url, contact, reason, note, status, created_at from takedown_requests order by (status = 'open') desc, created_at desc limit 50`, []);
  const errors = await q("errors", db<{ id: string; at: Date; source: string; route: string | null; message: string }[]>`select id, at, source, route, message from errors order by at desc limit 40`, []);
  const jobs = await q("jobs", db<{ id: string; handle: string; status: string; quote_usd: string | null; error: string | null; created_at: Date; who: string | null }[]>`
        select j.id, j.handle, j.status, j.quote_usd, j.error, j.created_at, u.handle as who from jobs j left join users u on u.id = j.user_id
        where j.kind = 'add_brain' and j.status <> 'awaiting_payment' order by j.created_at desc limit 30`, []);
  const brains = await q("brains", db<{ code: string; handle: string; hidden: boolean; added: boolean }[]>`select code, handle, coalesce(hidden, false) as hidden, added_by is not null as added from influencers order by code`, []);
  const shares = await q("shares", db<{ n: number; claimed: number; views: number }[]>`select count(*)::int as n, count(claimed_at)::int as claimed, coalesce(sum(views), 0)::int as views from shares`, []);


  const t = today[0];
  const u = users[0];
  const cap = dailyBudgetUsd();
  const cell = "px-3 py-2";
  return (
    <div className="mx-auto max-w-[1100px] px-gutter pb-24 pt-[calc(var(--ii-topbar-h)+32px)]">
      <h1 className="text-h2">Admin</h1>

      <section className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Model spend today", `${usd(spendToday)} / ${usd(cap)}`, Math.min(1, spendToday / cap)],
          ["Questions today", String(t?.messages ?? "—"), null],
          ["People today", t ? `${t.asked_users} users · ${t.asked_guests} guests` : "—", null],
          ["Users", u ? `${u.total} · ${u.plus} Plus · +${t?.new_users ?? 0} today` : "—", null],
          ["Revenue 7d", u ? `${usd(u.revenue_7d)} · ${u.paid_7d} payments` : "—", null],
          ["Shares", shares[0] ? `${shares[0].n} · ${shares[0].claimed} posted · ${shares[0].views} views` : "—", null],
        ].map(([k, v, bar]) => (
          <div key={k as string} className="rounded-panel border border-line bg-panel p-4">
            <p className="label-mono">{k}</p>
            <p className="mt-2 font-pixel text-body text-ceramic">{v}</p>
            {bar != null && (
              <div className="mt-3 h-1.5 bg-line">
                <div className="h-full" style={{ width: `${(bar as number) * 100}%`, background: (bar as number) > 0.85 ? "var(--ii-verdict-sell)" : "var(--ii-particle)" }} />
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="mt-12">
        <h2 className="text-h3">Last 14 days</h2>
        <div className="mt-4 overflow-x-auto rounded-panel border border-line">
          <table className="w-full min-w-[560px] text-left font-mono text-xs">
            <thead className="text-muted">
              <tr className="border-b border-line">
                {["Day", "Questions", "People", "Signups", "Chat spend", "Builds + other"].map((h) => (
                  <th key={h} className={`${cell} font-normal`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="text-particle">
              {days.map((d) => (
                <tr key={d.day} className="border-b border-line last:border-0">
                  <td className={cell}>{d.day}</td>
                  <td className={cell}>{d.messages}</td>
                  <td className={cell}>{d.people}</td>
                  <td className={cell}>{d.signups}</td>
                  <td className={cell}>{usd(d.chat_usd)}</td>
                  <td className={cell}>{usd(d.other_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-h3">Removal requests</h2>
        {takedowns.length === 0 ? (
          <p className="mt-3 text-sm text-muted">None.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {takedowns.map((r) => {
              const isAccount = r.handle.startsWith("account:");
              const brain = brains.find((b) => b.handle.toLowerCase() === r.handle.toLowerCase());
              return (
                <li key={r.id} className={`rounded-panel border border-line p-4 ${r.status === "open" ? "bg-panel" : "opacity-60"}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-pixel text-sm text-ceramic">
                      {isAccount ? `Delete account data · ${r.handle.slice(8)}` : `@${r.handle}`} <span className="text-muted">· {r.note ?? "—"} · {ago(r.created_at)} ago · {r.status}</span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {brain && <AdminButton action={brain.hidden ? "unhide" : "hide"} handle={brain.handle} label={brain.hidden ? "Show brain again" : "Hide brain"} confirm={!brain.hidden} />}
                      <AdminButton action={r.status === "open" ? "takedown-handled" : "takedown-reopen"} id={r.id} label={r.status === "open" ? "Mark handled" : "Reopen"} />
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-particle">Contact: {r.contact ?? "—"}</p>
                  <p className="mt-1 break-all text-xs text-particle">
                    Proof:{" "}
                    {/^https?:\/\//.test(r.proof_url) ? (
                      <a href={r.proof_url} target="_blank" rel="noopener noreferrer" className="underline decoration-line-hover underline-offset-4">
                        {r.proof_url}
                      </a>
                    ) : (
                      r.proof_url
                    )}
                  </p>
                  {r.reason && <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{r.reason}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-12">
        <h2 className="text-h3">Paid builds</h2>
        {jobs.length === 0 ? (
          <p className="mt-3 text-sm text-muted">None yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-panel border border-line">
            <table className="w-full min-w-[640px] text-left font-mono text-xs">
              <tbody className="text-particle">
                {jobs.map((j) => (
                  <tr key={j.id} className="border-b border-line last:border-0">
                    <td className={cell}>@{j.handle}</td>
                    <td className={cell}>{j.status}</td>
                    <td className={cell}>{j.quote_usd ? `${Number(j.quote_usd)} USDC` : "—"}</td>
                    <td className={cell}>by @{j.who ?? "?"}</td>
                    <td className={cell}>{ago(j.created_at)} ago</td>
                    <td className={`${cell} max-w-[260px] truncate text-muted`} title={j.error ?? ""}>{j.error ?? ""}</td>
                    <td className={cell}>
                      {j.status === "failed" && (
                        <span className="flex gap-2">
                          <AdminButton action="job-retry" id={j.id} label="Retry" />
                          <AdminButton action="job-refunded" id={j.id} label="Mark refunded" />
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-12">
        <h2 className="text-h3">Brains</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {brains.map((b) => (
            <span key={b.code} className={`inline-flex items-center gap-2 rounded-panel border border-line px-3 py-1.5 font-mono text-xs ${b.hidden ? "text-muted line-through" : "text-particle"}`}>
              {b.code} @{b.handle}
              {b.added ? " · added" : ""}
              <AdminButton action={b.hidden ? "unhide" : "hide"} handle={b.handle} label={b.hidden ? "show" : "hide"} confirm={!b.hidden} small />
            </span>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-h3">Errors</h2>
          {errors.length > 0 && <AdminButton action="errors-clear" label="Clear older than 1h" small />}
        </div>
        {errors.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No errors logged.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-panel border border-line font-mono text-xs">
            {errors.map((e) => (
              <li key={e.id} className="flex gap-3 px-3 py-2">
                <span className="w-12 shrink-0 text-muted">{ago(e.at)}</span>
                <span className="w-14 shrink-0 text-muted">{e.source}</span>
                <span className="w-40 shrink-0 truncate text-particle">{e.route ?? ""}</span>
                <span className="min-w-0 break-words text-ceramic">{e.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
