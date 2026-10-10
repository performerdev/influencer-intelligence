/**
 * JS mirror of styles/tokens.css — used by GSAP timelines, WebGL shaders and
 * canvas renderers, which can't read CSS custom properties cheaply per frame.
 */

export const color = {
  void: "#050506",
  panel: "#0C0C0E",
  line: "#18181B",
  lineHover: "#3A3A3F",
  ceramic: "#F2F1EC",
  particle: "#B9B8B2",
  muted: "#6B6B70",
  /** verdict chips only */
  buy: "#7CFF6B",
  sell: "#FF4D4D",
} as const;

/** GSAP ease names, matched to the CSS curves in tokens.css */
export const ease = {
  inOut: "power2.inOut",
  out: "power3.out",
  outStrong: "power4.out",
  expo: "expo.out",
  back: "back.out(2)",
} as const;

/** seconds — GSAP units */
export const dur = {
  instant: 0.12,
  fast: 0.2,
  base: 0.25,
  slow: 0.35,
} as const;

/** The hero choreography, in seconds from the end of the preloader. */
export const heroTimeline = {
  preloaderLine: 0.6, // line draws across
  preloaderContract: 0.45, // line contracts into the dot
  solidRise: 0.6, // 0.0–0.6  solid "i" rises 12px and settles
  copyStart: 0.6, // 0.6–2.2  points stream out and assemble
  copyEnd: 2.2,
  headlineStart: 2.2, // 2.2–2.9  headline mask reveal
  headlineWordStagger: 0.06,
  followOffset: 0.15, // subtitle, then buttons
  riseDistancePx: 12,
} as const;

/** Idle + interaction parameters for the particle "i". */
export const particle = {
  count: 20_000,
  breatheAmplitude: 0.006, // fraction of logo height
  breathePeriod: 6, // seconds, loops seamlessly
  repelRadiusPx: 120,
  springDamping: 0.12,
} as const;
