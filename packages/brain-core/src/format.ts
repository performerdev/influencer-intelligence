export type PostRow = {
  id: string;
  kind: "post" | "quote" | "thread";
  text: string;
  created_at: Date;
  quoted_author: string | null;
  quoted_text: string | null;
  likes: number | null;
  reposts: number | null;
  views: number | null;
};

export const day = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

const clean = (s: string) => s.replace(/\s+/g, " ").replace(/https:\/\/t\.co\/\w+/g, "").trim();

/** One post as one compact line for the model. */
export function formatPost(p: PostRow): string {
  const text = clean(p.text);
  if (p.kind === "quote") {
    const q = clean(p.quoted_text ?? "").slice(0, 280);
    return `[${p.id}] ${day(p.created_at)} · quote of @${p.quoted_author ?? "?"}: «${q}» → ${text}`;
  }
  return `[${p.id}] ${day(p.created_at)} · ${p.kind === "thread" ? "thread" : "post"} · ${text}`;
}

/** Normalize for verbatim checks. */
export const norm = (s: string) => clean(s).toLowerCase();
