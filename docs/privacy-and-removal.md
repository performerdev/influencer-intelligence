# Privacy and removal

The site keeps as little as it needs to work. It runs no ads, no trackers and no analytics. The legal text is on the [Privacy](https://ii.plus/privacy) and [Terms](https://ii.plus/terms) pages; this page explains the same things from the code's side.

## What is stored

| What | Why |
| --- | --- |
| Your public X profile: account id, handle, display name, profile picture | Your account. No email, ever |
| Your questions and the answers | So you can reopen your chats, and to measure usage. Free accounts see the last 7 days, Plus sees everything |
| A salted hash of the IP address of visitors who aren't logged in | Guest limits. The address itself is never stored |
| The real model cost of each answer | Session limits are measured in it |
| A payment's reference key and transaction signature | To match a payment to its checkout |
| Your waitlist wallet and task progress | Your waitlist spot |

Cookies: one signed session cookie (30 days), and a short-lived one during login. Nothing else.

Shared answers are public at a random link and show only the question and the answer, not your account.

## Who processes data

- **DeepSeek** writes the answers: your question and the mind's brain are sent to it.
- **Netlify** hosts the site. **Supabase** hosts the Postgres database.
- **twitterapi.io** reads public posts to build and refresh minds.
- **DefiLlama, DexScreener, GeckoTerminal, CoinGecko, Yahoo Finance, Stooq and RugCheck** provide prices and coin data. No personal data is sent to them.
- **Solana RPC providers** check payments on-chain.

## The people the minds are built from

Minds are built only from public posts, and anyone can see exactly what each one contains: its files are public in [`brains/`](../brains). Full post texts are never published, only post IDs and short quotes of calls.

If you are one of the people modelled and want your mind removed, use the [removal form](https://ii.plus/takedown). A person reads every request, usually within 72 hours, and replies at the contact you give.

## Deleting your account

Send a request through the same form, choosing "Delete my account data", from the X account you log in with. Your account and chats are deleted. Payment records on Solana are public and can't be erased by anyone.

## The database

The site and the build jobs talk to Postgres directly. Supabase also offers a public REST API over the same tables; this project doesn't use it, so it is shut: every table has row-level security on with no policies, and the API's roles have no rights on any table ([`packages/db/migrations/009_lock_data_api.sql`](../packages/db/migrations/009_lock_data_api.sql)). Tables added later get the same treatment when migrations run.

## Backups

The database is backed up every week by a GitHub Actions job ([`.github/workflows/backup.yml`](../.github/workflows/backup.yml)). Because this repository is public, the dump is **encrypted before it leaves the runner**, with the database URL itself as the key: whoever can open a backup could already read the live database.
