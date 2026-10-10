/**
 * The 10 launch intelligences. Fill in the real handles before launch.
 * Only the handle text and the generated particle signature are ever shown —
 * never profile photos, faces or brand logos.
 */
export type IntelligenceConfig = {
  /** stable public code, ii-01 … ii-10 */
  code: `ii-${string}`;
  /** X handle without the @ */
  handle: string;
  displayName: string;
};

/** displayName stays empty here: it is filled from the live X profile at ingest time. */
export const intelligences: IntelligenceConfig[] = [
  { code: "ii-01", handle: "blknoiz06", displayName: "" },
  { code: "ii-02", handle: "mert", displayName: "" },
  { code: "ii-03", handle: "MEADGod", displayName: "" },
  { code: "ii-04", handle: "MustStopMurad", displayName: "" },
  { code: "ii-05", handle: "a1lon9", displayName: "" },
  { code: "ii-06", handle: "zachxbt", displayName: "" },
  { code: "ii-07", handle: "cz_binance", displayName: "" },
  { code: "ii-08", handle: "nikitabier", displayName: "" },
  { code: "ii-09", handle: "theunipcs", displayName: "" },
  { code: "ii-10", handle: "Cupseyy", displayName: "" },
];
