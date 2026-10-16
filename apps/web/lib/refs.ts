const ID = String.raw`(?:post:\s*)?\d{8,20}`;
const ID_GROUP = new RegExp(String.raw`\s*[([]\s*${ID}(?:\s*[,;]\s*${ID})*\s*[)\]]`, "g");
const LOOSE_ID = new RegExp(String.raw`(?:\s*[,;])?\s*(?:post:\s*\d{6,}|\b\d{15,20}\b)`, "g");

/**
 * Brain files cite their source posts by id: "(post:123…, post:456…)", "(123…, 456…)", "post:123…".
 * Useful for the model, noise for a reader — drop every id and tidy the punctuation left behind.
 */
export function stripCitations(text: string): string {
  return text
    .replace(ID_GROUP, "")
    .replace(LOOSE_ID, "")
    .replace(/\(\s*[,;]?\s*\)|\[\s*[,;]?\s*\]/g, "")
    .replace(/\(\s*[,;]\s*/g, "(")
    .replace(/\s+from notes:\s*/gi, " ")
    .replace(/[ \t]+([.,;:!?)])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+$/gm, "");
}

/**
 * Models sometimes merge citations: "[post:1, 2]", "[post:1; post:2]", "[post: 1]".
 * Split them into one "[post:ID]" marker per post so every reference renders and resolves.
 */
export function normalizeRefs(text: string): string {
  return text.replace(/\[post:\s*(\d+(?:\s*[,;]\s*(?:post:)?\s*\d+)*)\s*\]/g, (_, ids: string) =>
    ids
      .split(/[,;]/)
      .map((id) => `[post:${id.replace(/\D/g, "")}]`)
      .join(""),
  );
}
