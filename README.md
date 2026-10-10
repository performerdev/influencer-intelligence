# Influencer Intelligence

Every mind on Crypto Twitter. Cloned in the open.

> Work in progress. Done: design system, hero, and the brain pipeline (ingest → distill → stats → export). Next: chat on real brains. The full README with media lands at launch.

## Quickstart

```bash
pnpm i
pnpm dev            # site → http://localhost:3000
pnpm preview:hero   # one-file HTML build of the hero → apps/web/preview/dist/
```

Append `?slow=4` to the home URL to play the intro 4× slower for review.

## Build the brains

Needs Node 22+, pnpm, and a `.env` (copy `.env.example`): twitterapi.io key, DeepSeek key, Postgres URL (Supabase session pooler works).

```bash
pnpm db:migrate                       # create tables
pnpm brain:probe blknoiz06            # test every API with a few cheap requests + cost estimate
pnpm brain:build blknoiz06 --max-usd 15   # ingest → distill → stats → brain → export to brains/
pnpm brain:build --all --max-usd 15
pnpm brain:status                     # posts, calls, brain version and real spend per intelligence
```

Every step is resumable and cached: ingest stores its cursor after each page, distill caches each map batch, so re-running only pays for what changed. `--max-usd` caps twitterapi.io spend per account; hitting it pauses cleanly.

| Step | What it does |
| --- | --- |
| ingest | Own posts, quotes (with the quoted post as context) and own thread continuations. Reposts and replies to others are dropped. Timeline first, then `until_time` search windows for older history. |
| distill | Chronological map batches → notes; reduce → `mind.md`, `rules.md`, `voice.md`, identity, one-line mind, 200–300 example IDs. Calls are extracted per batch and validated by code (post must exist, quote must be verbatim). |
| stats | Deterministic: price at call and after 1/7/30 days from DefiLlama, hit rate, median hold. No model involved. |
| brain | Fixed-order system prompt (rules, identity, mind, rules, voice, examples, calls, stats) stored as a versioned row, ≤ 50k tokens. |
| export | `brains/ii-XX-handle/` — post IDs and short call quotes only, no full post texts. |

`pnpm test:pipeline` runs the whole thing end-to-end against an in-process Postgres and mock APIs (no keys, no network).

## Where things are

| Path | What |
| --- | --- |
| `apps/web/styles/tokens.css` | Design tokens: palette, type scale, radii, motion. Single source of truth. |
| `apps/web/lib/tokens.ts` | JS mirror of the tokens for GSAP, shaders and canvas. |
| `apps/web/tailwind.config.ts` | Tailwind reads the tokens; the default palette is replaced, not extended. |
| `apps/web/lib/logo-geometry.ts` | The "ii" in world units, shared by the 3D mesh, particles, SVG mark and favicon. |
| `apps/web/components/hero/` | Hero DOM, preloader, R3F scene, particle shader, shared hero state. |
| `apps/web/lib/signature.ts` | Deterministic particle signature per handle (density = posts, speed = posting frequency). |
| `apps/web/components/home/HomeStage.tsx` | Intro choreography and the scroll transition into the 10 cards. |
| `apps/web/config/` | Intelligences, token, chain, site placeholders. |
| `apps/web/modules/wallet/` | Wallet provider + `pay()` stub ("Payments coming soon" until configured). |
| `packages/db/` | Postgres client + SQL migrations. |
| `packages/ingest/` | `XSource` interface, twitterapi.io and official X API adapters, resumable ingest. |
| `packages/brain-core/` | LLM adapter (OpenAI-compatible, DeepSeek default), prompts, map/reduce distill, brain assembly, export. |
| `packages/stats/` | Deterministic call stats from historical prices. |
| `scripts/cli.ts` | The pipeline CLI. |
| `config/pricing.ts` | API prices for real-cost tracking and Add-a-brain quotes. |

## Disclaimer

Unofficial AI models built from public posts. Not affiliated with any influencer. Not financial advice.

MIT licensed.
