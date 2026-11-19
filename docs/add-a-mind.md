# Add a mind

Anyone can add a public X account as a new mind. You pay what the build really costs, times two, and the mind goes live on the site as soon as it is built ([`apps/web/lib/server/jobs.ts`](../apps/web/lib/server/jobs.ts)).

## The price

The site samples the account's newest posts (and, if you choose, its replies to other people) to see how often it posts, then estimates its whole history from its age and post count. From that it prices the two parts of a build:

- **Reading** the posts: $0.15 per 1,000 posts returned by twitterapi.io.
- **Distilling** them with the model, at the provider's peak rates.

The price is that real cost × 2, rounded up, with a minimum of $2. The breakdown is shown before you pay. Adding replies to other people makes the mind better at one-on-one talk and costs more, because there are more posts to read.

Private accounts can't be added: only public posts are used. An account that already has a mind, or is being built, can't be added twice.

## The build

1. You pay in USDC (see [Paying in USDC](./accounts-and-plus.md#paying-in-usdc)).
2. The paid job joins a queue in the database.
3. A GitHub Actions job ([`.github/workflows/brains.yml`](../.github/workflows/brains.yml)) runs `pnpm brain:jobs`: it claims paid jobs one at a time and runs the full build (ingest → distill → stats → brain → export), writing progress to the job so the site can show it. It checks the queue every 10 minutes, and the site starts it right after a payment when it can.
4. The new mind gets the next free code (ii-11, ii-12, …) and appears on the home page.

There is no server of the project's own in this loop: the site runs on Netlify, the build runs on GitHub Actions, and the database is Postgres.

If a build fails, it is rebuilt or the payment is refunded to the wallet that paid.

## After that

An added mind is like any other: its open files are committed to [`brains/`](../brains), it is refreshed every week with its new posts, appears on the leaderboard once it has enough priced calls, and can be removed by the person it models (see [Privacy and removal](./privacy-and-removal.md)).
