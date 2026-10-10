import type { Config } from "tailwindcss";

/**
 * Tailwind reads every value from styles/tokens.css so the CSS variables stay
 * the single source of truth. Only the logo palette exists — Tailwind's default
 * color set is replaced, not extended, so off-palette colors fail at build time.
 */
const rgb = (name: string) => `rgb(var(--ii-${name}-rgb) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./preview/**/*.{ts,tsx}"],
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      void: rgb("void"),
      panel: rgb("panel"),
      line: rgb("line"),
      "line-hover": rgb("line-hover"),
      ceramic: rgb("ceramic"),
      particle: rgb("particle"),
      muted: rgb("muted"),
      verdict: {
        buy: "var(--ii-verdict-buy)",
        sell: "var(--ii-verdict-sell)",
      },
    },
    fontFamily: {
      sans: ["var(--ii-font-sans)"],
      mono: ["var(--ii-font-mono)"],
    },
    fontSize: {
      display: ["var(--ii-text-display)", { lineHeight: "1.02", letterSpacing: "var(--ii-tracking-display)" }],
      h1: ["var(--ii-text-h1)", { lineHeight: "1.05", letterSpacing: "var(--ii-tracking-display)" }],
      h2: ["var(--ii-text-h2)", { lineHeight: "1.1", letterSpacing: "var(--ii-tracking-display)" }],
      h3: ["var(--ii-text-h3)", { lineHeight: "1.25", letterSpacing: "-0.02em" }],
      lead: ["var(--ii-text-lead)", { lineHeight: "1.55", letterSpacing: "var(--ii-tracking-ui)" }],
      body: ["var(--ii-text-body)", { lineHeight: "1.55", letterSpacing: "var(--ii-tracking-ui)" }],
      sm: ["var(--ii-text-sm)", { lineHeight: "1.5" }],
      xs: ["var(--ii-text-xs)", { lineHeight: "1.5" }],
      label: ["var(--ii-text-label)", { lineHeight: "1.4", letterSpacing: "var(--ii-tracking-label)" }],
    },
    borderRadius: {
      none: "0",
      chip: "var(--ii-radius-chip)",
      input: "var(--ii-radius-input)",
      panel: "var(--ii-radius-panel)",
      card: "var(--ii-radius-card)",
      pill: "var(--ii-radius-pill)",
      full: "9999px",
    },
    // Depth comes from the 3D hero and hairlines, never from shadows.
    boxShadow: { none: "none" },
    extend: {
      maxWidth: { site: "var(--ii-max)" },
      spacing: { gutter: "var(--ii-gutter)", topbar: "var(--ii-topbar-h)" },
      transitionTimingFunction: {
        "ii-in-out": "var(--ii-ease-in-out)",
        "ii-out": "var(--ii-ease-out)",
        "ii-out-strong": "var(--ii-ease-out-strong)",
        "ii-expo": "var(--ii-ease-expo)",
        "ii-back": "var(--ii-ease-back)",
      },
      transitionDuration: {
        instant: "var(--ii-dur-instant)",
        fast: "var(--ii-dur-fast)",
        base: "var(--ii-dur-base)",
        slow: "var(--ii-dur-slow)",
      },
    },
  },
  plugins: [],
};

export default config;
