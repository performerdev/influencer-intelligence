# Code map

A pnpm monorepo: one Next.js app and four packages the pipeline is built from.

## Stack

- **Site:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS. Motion with GSAP and Lenis; the "ii" on the home page is drawn with WebGL.
- **Data:** Postgres, plain SQL migrations, the `postgres` client. No ORM.
- **Model:** any OpenAI-compatible API, DeepSeek by default.
- **Payments:** USDC on Solana with Solana Pay, verified with plain JSON-RPC.
- **Hosting:** Netlify for the site, GitHub Actions for builds and backups.

## Repository

| Path | What |
| --- | --- |
| [`apps/web/`](../apps/web) | The site |
| [`packages/ingest/`](../packages/ingest) | Reading posts: the `XSource` interface, twitterapi.io and official X API adapters, the resumable runner |
| [`packages/brain-core/`](../packages/brain-core) | Model client, every prompt, map/merge/reduce distill, call checks, brain assembly, export |
| [`packages/stats/`](../packages/stats) | Deterministic call pricing: price sources, coin matching, returns, hit rates |
| [`packages/db/`](../packages/db) | Postgres client and SQL migrations |
| [`scripts/cli.ts`](../scripts/cli.ts) | The pipeline CLI (`pnpm brain:*`) and the Add worker |
| [`scripts/dev-mock.ts`](../scripts/dev-mock.ts) | Local stack with no keys |
| [`config/pricing.ts`](../config/pricing.ts) | API prices, for real-cost tracking and Add quotes |
| [`brains/`](../brains) | The open files of every mind |
| [`docs/`](.) | These docs. The site's `/docs` page is built from the same files |
| [`.github/workflows/`](../.github/workflows) | Weekly refresh, Add builds, backups |

## Inside the site

| Path | What |
| --- | --- |
| `apps/web/app/` | Pages and API routes |
| `apps/web/app/api/chat/` | One mind's answer, streamed |
| `apps/web/app/api/group/` | Group chat: speaking order, then one speaker at a time |
| `apps/web/app/api/tools/` | Check a coin, rate my bag |
| `apps/web/app/api/add/`, `api/plus/` | Quotes and checkouts |
| `apps/web/app/api/early/` | Waitlist state and tasks |
| `apps/web/lib/server/` | Server code: auth, limits, live data, payments, jobs, shares, the waitlist (`early.ts`) |
| `apps/web/lib/cards.ts` | The live cards inside answers |
| `apps/web/components/` | UI by area: `app`, `chat`, `group`, `brain`, `coin`, `leaderboard`, `early` (the waitlist), `add`, `account`, `hero` |
| `apps/web/config/` | Plans and limits, the waitlist, token, payments, the launch minds |
| `apps/web/styles/tokens.css` | Design tokens: palette, type scale, radii, motion. The single source for the look |
| `apps/web/lib/logo-geometry.ts` | The "ii" mark as a pixel grid, shared by the WebGL scene, the SVG mark and the favicon |
| `apps/web/lib/brain-render.ts` | The turning pixel brains |

## Database

Tables, from [`packages/db/migrations/`](../packages/db/migrations):

| Table | Holds |
| --- | --- |
| `influencers` | Every mind: code, handle, status, one-line mind |
| `posts`, `ingest_state` | Collected posts, and where each read phase stopped |
| `distill_notes` | Cached notes per map batch |
| `calls`, `stats` | Checked calls and their prices |
| `brains` | Every brain version: files, prompt, size, model |
| `recent_posts` | Posts since a brain was built, cached for live context |
| `users` | Accounts from Log in with X |
| `chats`, `messages`, `shares` | Conversations and shared answers |
| `jobs`, `payments` | Add builds and USDC payments |
| `early` | The waitlist: wallet, tasks, spot, who invited whom |
| `spend`, `errors`, `settings` | Real cost of every API call, error log, admin settings |
| `takedown_requests` | Removal and deletion requests |

## License

MIT. See [`LICENSE`](../LICENSE).
