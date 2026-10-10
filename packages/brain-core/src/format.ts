export type PostRow = {
  id: string;
  kind: "post" | "quote" | "thread" | "reply";
  text: string;
  created_at: Date;
  quoted_author: string | null;
  quoted_text: string | null;
  reply_to_author?: string | null;
  reply_to_text?: string | null;
  likes: number | null;
  reposts: number | null;
  views: number | null;
};

export const day = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

const clean = (s: string) => s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "").replace(/\s+/g, " ").replace(/https:\/\/t\.co\/\w+/g, "").trim();

/** One post as one compact line for the model. */
export function formatPost(p: PostRow): string {
  const text = clean(p.text);
  if (p.kind === "quote") {
    const q = Array.from(clean(p.quoted_text ?? "")).slice(0, 280).join(""); // by code point: never cut an emoji in half
    return `[${p.id}] ${day(p.created_at)} · quote of @${p.quoted_author ?? "?"}: «${q}» → ${text}`;
  }
  if (p.kind === "reply") {
    // Drop the leading @handles X prepends to replies; the parent is shown as context instead.
    const own = text.replace(/^(@\w+\s*)+/, "");
    const parent = clean(p.reply_to_text ?? "");
    const ctx = parent ? `: «${Array.from(parent).slice(0, 200).join("")}»` : "";
    return `[${p.id}] ${day(p.created_at)} · reply to @${p.reply_to_author ?? "?"}${ctx} → ${own}`;
  }
  return `[${p.id}] ${day(p.created_at)} · ${p.kind === "thread" ? "thread" : "post"} · ${text}`;
}

/** Normalize for verbatim checks. */
export const norm = (s: string) => clean(s).toLowerCase();
