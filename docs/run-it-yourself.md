# Run it yourself

Everything that runs ii.plus is in this repository. You need Node 22 and pnpm 10.

## The site, with no keys

```bash
pnpm i
pnpm dev:mock     # in-process Postgres + mock APIs; builds a mind from a fake account
```

Leave it running. It prints a command that starts the site against the mock stack in a second terminal (`… pnpm dev`). The site opens at http://localhost:3000 with real-shaped data, and nothing leaves your machine.

Two more checks that need no keys and no network:

```bash
pnpm test:pipeline   # the whole build, end to end, against mock APIs
pnpm test:pricing    # the call-pricing rules against mock price sources
```

## Building real minds

Copy `.env.example` to `.env` and fill in:

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | Postgres. A Supabase session pooler URL (port 5432) works |
| `TWITTERAPI_IO_KEY` | [twitterapi.io](https://twitterapi.io) key, to read posts |
| `DEEPSEEK_API_KEY` | [DeepSeek](https://platform.deepseek.com) key, to distill and to answer |
| `PRICE_API_BASE` | Historical prices. Default: DefiLlama's free coins API |

Any OpenAI-compatible model provider works instead of DeepSeek: set `LLM_BASE_URL` and `LLM_API_KEY`. Model names always come from the environment (`LLM_MODEL_MAP`, `LLM_MODEL_DISTILL`, `LLM_MODEL_CHAT`), never from code.

Then:

```bash
pnpm db:migrate                             # create the tables
pnpm brain:probe blknoiz06                  # test every API with a few cheap requests, estimate the cost
pnpm brain:build blknoiz06 --max-usd 15     # ingest → distill → stats → brain → export to brains/
pnpm brain:status                           # posts, calls, brain version and real spend per mind
```

### Pipeline commands

| Command | What it does |
| --- | --- |
| `pnpm brain:probe <handle>` | Cheap check of every API, and a cost estimate |
| `pnpm brain:ingest <handle> [--max-usd 15] [--refresh] [--no-threads]` | Read posts only |
| `pnpm brain:distill <handle> [--fresh]` | Distill only (`--fresh` ignores cached batch notes) |
| `pnpm brain:stats <handle>` | Re-price every call. Free |
| `pnpm brain:reassemble <handle>` | Rebuild the prompt from stored files. Free |
| `pnpm brain:export [handle]` | Write the open files to `brains/` |
| `pnpm brain:build <handle> [--max-usd 15] [--partial] [--replies]` | All of the above |
| `pnpm brain:build <handle> --refresh` | Weekly refresh: new posts, new calls, fresh prices |
| `pnpm brain:jobs` | Run paid Add builds from the queue |
| `pnpm brain:status` | Report for every mind |

`<handle>` can also be a code (`ii-01`) or `--all`.

## Running it in production

ii.plus runs on three services, with no server of its own:

- **Netlify** builds and hosts the site ([`apps/web/netlify.toml`](../apps/web/netlify.toml)): base directory is the repository root, package directory `apps/web`.
- **Postgres** on Supabase. The site uses the transaction pooler (port 6543), the jobs use the session pooler (port 5432).
- **GitHub Actions** builds and refreshes minds ([`brains.yml`](../.github/workflows/brains.yml)) and backs up the database ([`backup.yml`](../.github/workflows/backup.yml)). Repository secrets: `TWITTERAPI_IO_KEY`, `DEEPSEEK_API_KEY`, `DATABASE_URL`.

Site environment variables (set in Netlify):

| Variable | |
| --- | --- |
| `DATABASE_URL_POOLED` | Postgres transaction pooler URL |
| `DEEPSEEK_API_KEY` | Model key |
| `X_CLIENT_ID`, `X_CLIENT_SECRET` | Log in with X (OAuth 2.0). Callback: `<site>/api/auth/x/callback` |
| `TWITTERAPI_IO_KEY` | Fresh posts in answers, Add quotes, share checks |
| `SITE_URL` | The public address |
| `SESSION_SECRET` | Signs the session cookie. If unset, derived from the database URL |
| `ADMIN_HANDLES` | X handles allowed on `/admin`, comma-separated |
| `DAILY_BUDGET_USD` | Daily ceiling on chat model spend (default 50) |
| `NEXT_PUBLIC_PLUS_RECIPIENT` | Solana wallet that receives USDC payments |
| `GITHUB_DISPATCH_TOKEN` | Optional: starts a paid build right after payment instead of within 10 minutes |
| `SOLANA_RPC_URL`, `LLM_MODEL_CHAT`, `CHAT_SALT` | Optional |

## Contributing

Issues and pull requests are welcome on GitHub. Before sending one, run `pnpm typecheck` and, for pipeline changes, `pnpm test:pipeline`. A new mind for the site doesn't need a pull request: anyone can [add one](./add-a-mind.md).
