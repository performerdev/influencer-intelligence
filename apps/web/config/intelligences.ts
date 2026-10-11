/**
 * The 10 launch intelligences.
 * `color`: the brain's own color (equal-lightness palette, OKLCH L 0.80 C 0.13,
 * so none shouts louder on black). `avatar`: optional PFP in public/brains/,
 * rendered as a living pixel portrait; without one, the generated particle
 * signature is shown in the brain's color.
 */
export type IntelligenceConfig = {
  /** stable public code, ii-01 … ii-10 */
  code: `ii-${string}`;
  /** X handle without the @ */
  handle: string;
  displayName: string;
  color: string;
  avatar?: string;
};

/** displayName stays empty here: it is filled from the live X profile at ingest time. */
export const intelligences: IntelligenceConfig[] = [
  { code: "ii-01", handle: "blknoiz06", displayName: "", color: "#66C8FF" },
  { code: "ii-02", handle: "mert", displayName: "", color: "#FEA668" },
  { code: "ii-03", handle: "MEADGod", displayName: "", color: "#FF9B93" },
  { code: "ii-04", handle: "MustStopMurad", displayName: "", color: "#A5B6FF" },
  { code: "ii-05", handle: "a1lon9", displayName: "", color: "#99D079" },
  { code: "ii-06", handle: "zachxbt", displayName: "", color: "#54D8B1" },
  { code: "ii-07", handle: "cz_binance", displayName: "", color: "#D8BD51" },
  { code: "ii-08", handle: "nikitabier", displayName: "", color: "#D7A6FC" },
  { code: "ii-09", handle: "theunipcs", displayName: "", color: "#2AD5E5", avatar: "/brains/theunipcs.webp" },
  { code: "ii-10", handle: "Cupseyy", displayName: "", color: "#F99BD1" },
];
