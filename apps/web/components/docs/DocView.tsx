import { Fragment } from "react";

import { AppLink } from "@/components/ui/AppLink";
import { DOC_PAGES, type Block, type Doc, type Inline } from "@/lib/docs";

/** A real monospace for code: the site's "mono" is the pixel face, which is hard to read in a command. */
const MONO = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" };
const LINK = "text-ceramic underline decoration-line-hover underline-offset-4 transition-colors duration-fast hover:decoration-ceramic";

function Text({ c }: { c: Inline[] }) {
  return (
    <>
      {c.map((x, i) => {
        if (x.t === "text") return <Fragment key={i}>{x.v}</Fragment>;
        if (x.t === "code") return <code key={i} style={MONO} className="rounded-[3px] bg-panel px-1 py-0.5 text-[0.86em] text-ceramic">{x.v}</code>;
        if (x.t === "strong") return <strong key={i} className="font-medium text-ceramic"><Text c={x.c} /></strong>;
        return x.external ? (
          <a key={i} href={x.href} target="_blank" rel="noopener noreferrer" className={LINK}>
            <Text c={x.c} />
          </a>
        ) : (
          <AppLink key={i} href={x.href} className={LINK}>
            <Text c={x.c} />
          </AppLink>
        );
      })}
    </>
  );
}

function Blocks({ blocks, nested }: { blocks: Block[]; nested?: boolean }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.t) {
          case "h":
            return b.level === 2 ? (
              <h2 key={i} id={b.id} className="mt-14 scroll-mt-[calc(var(--ii-topbar-h)+24px)] font-pixel text-h3 text-ceramic first:mt-0">
                <a href={`#${b.id}`} className="group">
                  <Text c={b.c} />
                  <span aria-hidden className="ml-2 text-muted opacity-0 transition-opacity duration-fast group-hover:opacity-100">#</span>
                </a>
              </h2>
            ) : (
              <h3 key={i} id={b.id} className="mt-9 scroll-mt-[calc(var(--ii-topbar-h)+24px)] text-body font-medium text-ceramic">
                <Text c={b.c} />
              </h3>
            );
          case "p":
            return (
              <p key={i} className={nested ? "mt-2" : "mt-4"}>
                <Text c={b.c} />
              </p>
            );
          case "list": {
            const L = b.ordered ? "ol" : "ul";
            return (
              <L key={i} className={`${nested ? "mt-2" : "mt-4"} space-y-2 pl-5 marker:text-muted ${b.ordered ? "list-decimal marker:font-pixel" : "list-disc"}`}>
                {b.items.map((it, k) => (
                  <li key={k} className="pl-1">
                    <Text c={it.c} />
                    {it.children.length > 0 && <Blocks blocks={it.children} nested />}
                  </li>
                ))}
              </L>
            );
          }
          case "table":
            return (
              <div key={i} className="mt-5 overflow-x-auto rounded-card border border-line">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr>
                      {b.head.map((c, k) => (
                        <th key={k} scope="col" className="whitespace-nowrap border-b border-line bg-panel px-3.5 py-2.5 font-pixel text-xs font-normal text-muted">
                          <Text c={c} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, k) => (
                      <tr key={k} className="border-b border-line last:border-0">
                        {r.map((c, j) => (
                          <td key={j} className={`px-3.5 py-2.5 align-top ${j === 0 ? "text-ceramic" : "text-particle"}`}>
                            <Text c={c} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "code":
            return (
              <pre key={i} style={MONO} className="mt-5 overflow-x-auto rounded-card border border-line bg-panel px-4 py-3.5 text-[13px] leading-relaxed text-ceramic">
                <code style={MONO}>{b.v}</code>
              </pre>
            );
        }
      })}
    </>
  );
}

/**
 * One docs page: the list of pages on the left (a row of chips on a phone),
 * the page in the middle, "On this page" on the right on wide screens.
 */
export function DocView({ doc }: { doc: Doc }) {
  const at = DOC_PAGES.findIndex((p) => p.slug === doc.page.slug);
  const prev = DOC_PAGES[at - 1];
  const next = DOC_PAGES[at + 1];
  const href = (slug: string) => `/docs${slug ? `/${slug}` : ""}`;
  return (
    <div className="mx-auto max-w-site px-gutter pb-28 pt-[calc(var(--ii-topbar-h)+32px)] md:pt-[calc(var(--ii-topbar-h)+48px)]">
      <div className="grid gap-8 md:grid-cols-[208px_minmax(0,1fr)] md:gap-12 xl:grid-cols-[208px_minmax(0,720px)_minmax(0,200px)] xl:justify-between">
        <nav aria-label="Docs" className="min-w-0 md:sticky md:top-[calc(var(--ii-topbar-h)+48px)] md:self-start">
          <p className="hidden font-pixel text-xs text-muted md:block">Docs</p>
          <ul className="-mx-gutter flex gap-1.5 overflow-x-auto px-gutter pb-1 md:mx-0 md:mt-3 md:flex-col md:gap-0.5 md:overflow-visible md:px-0 md:pb-0">
            {DOC_PAGES.map((p) => {
              const on = p.slug === doc.page.slug;
              return (
                <li key={p.slug} className="shrink-0">
                  <AppLink
                    href={href(p.slug)}
                    aria-current={on ? "page" : undefined}
                    className={`flex items-center gap-2 whitespace-nowrap rounded-chip border px-3 py-1.5 font-pixel text-sm transition-colors duration-fast md:border-transparent md:px-2 ${
                      on ? "border-line-hover bg-panel text-ceramic" : "border-line text-particle hover:text-ceramic"
                    }`}
                  >
                    <i aria-hidden className={`hidden h-1.5 w-1.5 shrink-0 md:block ${on ? "bg-ceramic" : "bg-transparent"}`} />
                    {p.nav}
                  </AppLink>
                </li>
              );
            })}
          </ul>
          <a href={doc.sourceUrl.replace(/\/blob\/main\/docs\/.*$/, "")} target="_blank" rel="noopener noreferrer" className="mt-6 hidden items-center gap-1 px-2 font-pixel text-xs text-muted transition-colors duration-fast hover:text-particle md:inline-flex">
            Source on GitHub <span aria-hidden>↗</span>
          </a>
        </nav>

        <article className="min-w-0 text-body leading-relaxed text-particle">
          <h1 className="text-h2 font-medium text-ceramic [text-wrap:balance]">{doc.title}</h1>
          <div className="[&>p:first-child]:text-lead">
            <Blocks blocks={doc.blocks} />
          </div>

          <div className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
            <a href={doc.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-pixel text-xs text-muted transition-colors duration-fast hover:text-particle">
              Edit this page on GitHub <span aria-hidden>↗</span>
            </a>
            <span className="flex gap-2">
              {prev && (
                <AppLink href={href(prev.slug)} className="btn-line h-10 gap-2 px-4 text-sm">
                  <span aria-hidden>←</span> {prev.nav}
                </AppLink>
              )}
              {next && (
                <AppLink href={href(next.slug)} className="btn-line h-10 gap-2 px-4 text-sm">
                  {next.nav} <span aria-hidden>→</span>
                </AppLink>
              )}
            </span>
          </div>
        </article>

        {doc.toc.length > 1 && (
          <aside aria-label="On this page" className="hidden xl:sticky xl:top-[calc(var(--ii-topbar-h)+48px)] xl:block xl:self-start">
            <p className="font-pixel text-xs text-muted">On this page</p>
            <ul className="mt-3 space-y-2 border-l border-line pl-4 text-sm">
              {doc.toc.map((t) => (
                <li key={t.id}>
                  <a href={`#${t.id}`} className="text-particle transition-colors duration-fast hover:text-ceramic">
                    {t.text}
                  </a>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    </div>
  );
}
