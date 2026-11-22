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
4. The new mind gets the next free code (ii-11, ii-12, …) and appears on the site: in the main list or in Community (below).

There is no server of the project's own in this loop: the site runs on Netlify, the build runs on GitHub Actions, and the database is Postgres.

If a build fails, it is rebuilt or the payment is refunded to the wallet that paid.

## Main and Community

The minds the project builds itself are the **main list**. An added mind joins the main list too if its account has **100,000 followers or more**; otherwise it goes to **Community** ([`/community`](https://ii.plus/community), and its own section in the app). Follower counts are read again every week with the posts, so a Community mind that crosses 100,000 moves up by itself. An admin can pin a mind to either list ([`apps/web/config/community.ts`](../apps/web/config/community.ts)).

Community minds work like any other in a chat, in groups (pick them under Community), in the tools and on the leaderboard. **All minds** asks the main list only.

## What you get for adding one

- **+100 $ii for every person who talks to your mind**, up to 10,000 $ii per mind, added to your [Early allocation](./early-and-ii.md). A person counts once per mind, only when logged in with X, never you, and only if their X account is older than 90 days, so fresh accounts can't farm it. An All minds turn where your mind had nothing to say doesn't count.
- **"Added by @you"** on the mind's card and pages. You can switch it off on your account page.

Your minds, the people each one has answered and what you've earned are on your account page.

## After that

An added mind is like any other: its open files are committed to [`brains/`](../brains), it is refreshed every week with its new posts, appears on the leaderboard once it has enough priced calls, and can be removed by the person it models (see [Privacy and removal](./privacy-and-removal.md)).
