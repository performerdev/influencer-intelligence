// Bundles preview/hero-preview.tsx + compiled Tailwind into one self-contained HTML file.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "preview/dist");
mkdirSync(out, { recursive: true });

execFileSync(
  resolve(root, "node_modules/.bin/tailwindcss"),
  ["-i", "styles/globals.css", "-o", "preview/dist/styles.css", "--minify"],
  { cwd: root, stdio: "inherit" },
);

const js = await esbuild.build({
  entryPoints: [resolve(root, "preview/hero-preview.tsx")],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  write: false,
  jsx: "automatic",
  alias: { "next/link": resolve(root, "preview/link-shim.tsx") },
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
  logOverride: { "unsupported-directive": "silent" },
});

const css = readFileSync(resolve(out, "styles.css"), "utf8");
const code = js.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const icon = readFileSync(resolve(root, "public/icon.svg"), "utf8");

const html = `<!doctype html>
<html lang="en" class="js">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>Influencer Intelligence</title>
<meta name="theme-color" content="#050506" />
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(icon)}" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap" />
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script>${code}</script>
</body>
</html>`;

writeFileSync(resolve(out, "index.html"), html);

// Same page without the document skeleton, for hosts that wrap it themselves.
const fragment = `<title>Influencer Intelligence</title>
<script>document.documentElement.classList.add("js")</script>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap" />
<style>${css}</style>
<div id="root"></div>
<script>${code}</script>
`;
writeFileSync(resolve(out, "hero-preview.html"), fragment);
console.log(`preview → preview/dist/index.html (${(html.length / 1024).toFixed(0)} kB)`);
