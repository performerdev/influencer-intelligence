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
