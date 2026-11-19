# How a mind is built

A mind is built in five steps: **ingest → distill → stats → brain → export**. One command runs them all (`pnpm brain:build <handle>`), and every step can also run on its own. Every step is resumable, so a crash or a spending cap stops cleanly and the next run picks up where it left off.

## 1. Ingest: read the posts

Posts are read from X through [twitterapi.io](https://twitterapi.io) (an adapter for the official X API also exists). What is collected:

- **Own posts and quotes**, newest to oldest, in time windows. A quote keeps the quoted post as context.
- **Thread continuations**: the author's replies to themselves.
- **Replies to other people** (optional): only replies that say something, each with the post it answers, fetched for context.

Reposts are never fetched, so they are never paid for. Every page of results stores its cursor in the database right away, which is why ingest can resume. A spending cap per account (`--max-usd`, default $15) pauses the read when it is reached; `--partial` builds from what was collected so far.

## 2. Distill: posts into a mind

The posts are read by a language model (DeepSeek by default; any OpenAI-compatible provider works) in three passes:

1. **Map.** Posts are cut into chronological batches of about 40,000 tokens. For each batch the model writes notes as JSON: worldview, how they reason, risk, narratives (bullish, bearish or mixed), who they respect, who they mock, trading rules with verbatim quotes, voice, explicit calls, and the most characteristic example posts. Every point cites the post IDs it comes from.
2. **Merge.** Only for very large accounts: when all the notes together pass about 220,000 tokens, they are merged first.
3. **Reduce.** The notes become the final files: a one-line summary of how the person operates (12 words at most), `mind.md`, `rules.md`, `voice.md`, a short self-introduction, and about 260 example post IDs that cover their topics and moods.

The instructions say: use only what the posts show, prefer the person's own words, let newer posts outweigh older ones when a view changed, and cite evidence as `(post:ID)` using only IDs that exist. Batch notes are cached, so a rebuild only pays for batches with new posts plus the reduce. All prompts are in [`packages/brain-core/src/prompts.ts`](../packages/brain-core/src/prompts.ts).

Calls found in each batch are checked by code before they are kept. See [Calls and the record](./calls-and-record.md).

## 3. Stats: price every call

Each call is priced at the moment it was made and 1, 7 and 30 days later, from historical price data. No model is involved. See [Calls and the record](./calls-and-record.md#pricing-a-call).

## 4. Brain: assemble the prompt

The brain is the system prompt a mind answers from. It is put together in a fixed order:

1. Rules for answering (answer straight away, in their voice; never invent a number; give a verdict only when asked for a decision; cite posts as `[post:ID]`).
2. Identity: whose brain this is, how many posts it was built from, and over what dates.
3. Mind, rules and voice.
4. Example posts, in their own words (long posts clipped to their opening).
5. Calls: every explicit call, with date, direction, ticker and quote.
6. Stats: hit rates and median moves.

The brain must fit in 50,000 tokens. When it doesn't, it is trimmed in this order: fewer examples (down to 120), then the call list becomes a per-ticker ledger (the full list for a ticker is attached to a question whenever that ticker comes up), and only then is `mind.md` shortened. `calls.json` always stays complete.

Each brain is stored as a new **version**. Answers record which version wrote them.

## 5. Export: the open files

Every brain is written to `brains/ii-XX-handle/`:

| File | What it holds |
| --- | --- |
| `brain.json` | Code, handle, version, model, prompt size, post count and date range, one-line mind, number of calls |
| `identity.md` | Who the brain is |
| `mind.md`, `rules.md`, `voice.md` | The distilled mind |
| `examples.json` | The example posts, as IDs and links |
| `calls.json` | Every call: date, ticker, chain and contract when the post had one, direction, short quote, post ID and link |
| `stats.json` | Every call's prices and returns, and the totals |

Full post texts are never exported, only post IDs and short call quotes, in line with X's terms.

## Weekly refresh

Every Monday a GitHub Actions job ([`.github/workflows/brains.yml`](../.github/workflows/brains.yml)) reads each mind's new posts, extracts calls from them with a cheaper model, and re-prices the whole record. The brain's text stays as it was built; only calls and stats change. A second run later the same day catches anything GitHub skipped and costs almost nothing.

## What it costs

Reading costs $0.15 per 1,000 posts returned. Distilling uses DeepSeek: a fast model for the map pass and a stronger one for the final files. Every API call records its real cost in the `spend` table, and `pnpm brain:status` shows posts, calls, brain version and spend for every mind. Prices live in [`config/pricing.ts`](../config/pricing.ts).
