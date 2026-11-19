import "server-only";

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { site } from "@/config/site";

/**
 * The docs: the Markdown files in the repository's docs/ folder, read at build
 * time and drawn by components/docs. The same files read on GitHub, so links
 * between them are written as "./page.md" and links into the code as
 * "../path"; both are turned into site links here.
 *
 * Only the Markdown the docs use is understood: headings (#, ##, ###),
 * paragraphs, lists (one level of nesting), tables, fenced code, **bold**,
 * `code` and [links](…). Text is never treated as HTML.
 */

/** Pages in reading order. "" is /docs (docs/README.md). */
export const DOC_PAGES = [
  { slug: "", file: "README.md", nav: "Overview" },
  { slug: "how-a-mind-is-built", file: "how-a-mind-is-built.md", nav: "How a mind is built" },
  { slug: "calls-and-record", file: "calls-and-record.md", nav: "Calls and the record" },
  { slug: "how-a-mind-answers", file: "how-a-mind-answers.md", nav: "How a mind answers" },
  { slug: "accounts-and-plus", file: "accounts-and-plus.md", nav: "Accounts, limits and Plus" },
  { slug: "add-a-mind", file: "add-a-mind.md", nav: "Add a mind" },
  { slug: "early-and-ii", file: "early-and-ii.md", nav: "Early and $ii" },
  { slug: "privacy-and-removal", file: "privacy-and-removal.md", nav: "Privacy and removal" },
  { slug: "run-it-yourself", file: "run-it-yourself.md", nav: "Run it yourself" },
  { slug: "code-map", file: "code-map.md", nav: "Code map" },
] as const;

export type DocPage = (typeof DOC_PAGES)[number];

export type Inline =
  | { t: "text"; v: string }
  | { t: "strong"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "link"; href: string; external: boolean; c: Inline[] };

export type ListItem = { c: Inline[]; children: Block[] };

export type Block =
  | { t: "h"; level: 1 | 2 | 3; id: string; c: Inline[]; text: string }
  | { t: "p"; c: Inline[] }
  | { t: "list"; ordered: boolean; items: ListItem[] }
  | { t: "table"; head: Inline[][]; rows: Inline[][][] }
  | { t: "code"; lang: string; v: string };

export type Doc = { page: DocPage; title: string; description: string; blocks: Block[]; toc: { id: string; text: string }[]; sourceUrl: string };

const REPO = site.githubUrl;

function docsDir(): string | null {
  // pages are built at deploy, so nothing here is traced into the server bundle
  const root = /*turbopackIgnore: true*/ process.cwd();
  for (const dir of [join(root, "..", "..", "docs"), join(root, "docs")]) if (existsSync(/*turbopackIgnore: true*/ join(dir, "README.md"))) return dir;
  return null;
}

/** GitHub's heading anchors: lower case, punctuation dropped, spaces to hyphens. */
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 _-]/g, "")
    .trim()
    .replace(/ /g, "-");

/** A link as written for GitHub → where it goes on the site. */
function resolveHref(raw: string): { href: string; external: boolean } {
  const [path, hash] = raw.split("#") as [string, string | undefined];
  const anchor = hash ? `#${hash}` : "";
  if (!path && hash) return { href: anchor, external: false };
  const live = path.match(/^https?:\/\/(?:www\.)?ii\.plus(\/.*)?$/);
  if (live) return { href: `${live[1] || "/"}${anchor}`, external: false };
  if (/^https?:\/\//.test(path)) return { href: raw, external: true };
  const doc = path.match(/^(?:\.\/)?([a-z0-9-]+|README)\.md$/i);
  if (doc) {
    const page = DOC_PAGES.find((p) => p.file.toLowerCase() === `${doc[1]}.md`.toLowerCase());
    if (page) return { href: `/docs${page.slug ? `/${page.slug}` : ""}${anchor}`, external: false };
  }
  if (path === "." || path === "./") return { href: `${REPO}/tree/main/docs`, external: true };
  if (path.startsWith("../")) return { href: `${REPO}/blob/main/${path.slice(3)}${anchor}`, external: true };
  return { href: raw, external: /^https?:/.test(raw) };
}

/** **bold**, `code` and [text](href); everything else is text. */
export function inline(src: string): Inline[] {
  const out: Inline[] = [];
  const re = /`([^`]+)`|\*\*(.+?)\*\*|\[((?:[^\]`]|`[^`]*`)+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m.index > last) out.push({ t: "text", v: src.slice(last, m.index) });
    if (m[1] != null) out.push({ t: "code", v: m[1] });
    else if (m[2] != null) out.push({ t: "strong", c: inline(m[2]) });
    else out.push({ t: "link", ...resolveHref(m[4]), c: inline(m[3]) });
    last = re.lastIndex;
  }
  if (last < src.length) out.push({ t: "text", v: src.slice(last) });
  return out;
}

export const plain = (xs: Inline[]): string => xs.map((x) => (x.t === "text" || x.t === "code" ? x.v : plain(x.c))).join("");

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => inline(c.trim()));

const LIST = /^(\s*)([-*]|\d+\.)\s+(.*)$/;

/** Block structure of one Markdown file. */
export function parse(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      const body: string[] = [];
      for (i++; i < lines.length && !/^```\s*$/.test(lines[i]); i++) body.push(lines[i]);
      i++;
      blocks.push({ t: "code", lang: fence[1], v: body.join("\n") });
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const c = inline(h[2].trim());
      const text = plain(c);
      blocks.push({ t: "h", level: h[1].length as 1 | 2 | 3, id: slugify(text), c, text });
      i++;
      continue;
    }
    if (line.trim().startsWith("|") && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1] ?? "") && (lines[i + 1] ?? "").includes("-")) {
      const head = cells(line);
      const rows: Inline[][][] = [];
      for (i += 2; i < lines.length && lines[i].trim().startsWith("|"); i++) rows.push(cells(lines[i]));
      blocks.push({ t: "table", head, rows });
      continue;
    }
    const li = line.match(LIST);
    if (li && li[1].length === 0) {
      const ordered = /\d/.test(li[2]);
      const items: ListItem[] = [];
      let cur: { text: string[]; sub: string[] } | null = null;
      const flush = () => {
        if (cur) items.push({ c: inline(cur.text.join(" ")), children: cur.sub.length ? parse(cur.sub.join("\n")) : [] });
      };
      for (; i < lines.length; i++) {
        const l = lines[i];
        const m = l.match(LIST);
        if (m && m[1].length === 0 && /\d/.test(m[2]) === ordered) {
          flush();
          cur = { text: [m[3]], sub: [] };
        } else if (cur && l.trim() && /^\s+/.test(l)) {
          // indented: a nested list, or the item's text going on
          if (LIST.test(l) || cur.sub.length) cur.sub.push(l.replace(/^\s{2,4}/, ""));
          else cur.text.push(l.trim());
        } else if (!l.trim() && cur && /^\s+\S/.test(lines[i + 1] ?? "")) {
          continue;
        } else break;
      }
      flush();
      blocks.push({ t: "list", ordered, items });
      continue;
    }
    const para: string[] = [];
    for (; i < lines.length && lines[i].trim() && !/^(#{1,3}\s|```|\|)/.test(lines[i]) && !(LIST.test(lines[i]) && !/^\s/.test(lines[i])); i++) para.push(lines[i].trim());
    if (para.length) blocks.push({ t: "p", c: inline(para.join(" ")) });
    else i++;
  }
  return blocks;
}

/** One page, ready to draw. null when its file is missing. */
export function loadDoc(slug: string): Doc | null {
  const page = DOC_PAGES.find((p) => p.slug === slug);
  const dir = docsDir();
  if (!page || !dir) return null;
  const file = join(/*turbopackIgnore: true*/ dir, page.file);
  if (!existsSync(/*turbopackIgnore: true*/ file)) return null;
  const blocks = parse(readFileSync(/*turbopackIgnore: true*/ file, "utf8"));
  const h1 = blocks.find((b): b is Extract<Block, { t: "h" }> => b.t === "h" && b.level === 1);
  const first = blocks.find((b): b is Extract<Block, { t: "p" }> => b.t === "p");
  const description = first ? plain(first.c).replace(/\s+/g, " ").slice(0, 200) : "";
  return {
    page,
    title: h1?.text ?? page.nav,
    description: description.length >= 200 ? `${description.slice(0, description.lastIndexOf(" "))}…` : description,
    blocks: blocks.filter((b) => b !== h1),
    toc: blocks.filter((b): b is Extract<Block, { t: "h" }> => b.t === "h" && b.level === 2).map((b) => ({ id: b.id, text: b.text })),
    sourceUrl: `${REPO}/blob/main/docs/${page.file}`,
  };
}
