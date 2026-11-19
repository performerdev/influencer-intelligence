# Calls and the record

A **call** is an explicit position the person states or tells readers to take on a specific asset: bought, buying, added, aped, holding, sold, trimmed, took profit, shorting, exited. News, price commentary and "watching this" are not calls.

Every mind's calls are public: on its brain page on the site, and in `calls.json` and `stats.json` in [`brains/`](../brains).

## How a call is found

The model reads the posts and lists calls (see [How a mind is built](./how-a-mind-is-built.md#2-distill-posts-into-a-mind)). Code then checks each one before it is kept ([`packages/brain-core/src/calls.ts`](../packages/brain-core/src/calls.ts)):

- the post must exist in that person's posts;
- the direction must be buy, sell or hold;
- the quote must really be in the post. If it isn't, the post's own opening words are used instead;
- duplicates (same post, ticker and direction) are dropped;
- a contract address is taken from the post text by code, never by the model;
- categories, stablecoins and sports bets that were taken for tickers are left out.

## Pricing a call

Each call is priced when it was made, and again 1, 7 and 30 days later ([`packages/stats/`](../packages/stats)). Free sources only, no keys:

| Asset | Where the price comes from |
| --- | --- |
| Well-known coins | [DefiLlama](https://defillama.com) coins API, by a curated ticker list |
| A coin with its contract address in the post | DexScreener finds the token, DefiLlama prices it by address |
| A coin named only by ticker | DexScreener finds tokens with exactly that symbol that already traded on the call's date; the most liquid wins. GeckoTerminal fills gaps from pool candles |
| A ticker no list knows | CoinGecko's full list, biggest market cap first, taking the first coin that had a price on the call's date |
| Stocks, ETFs, metals | Daily closes from Yahoo Finance, with Stooq as a fallback. A call on a closed day uses the last close before it |

Because a coin that didn't exist yet can't be the one meant, a 2018 call on a ticker never lands on a 2025 coin with the same name. Matches made by ticker or symbol alone are marked on the site as **approximate**, since they may be a namesake. Each priced call records which price id was used, so every match can be checked.

## How a call is scored

- **Returns are signed in the call's favor.** A sell call followed by a drop counts as positive. Hold calls are measured like buys.
- **Hit rate** is the share of priced calls whose signed return after N days is above zero.
- **Median and mean move** are taken over the same calls.
- **Bad data is dropped.** A price that jumps 20× either way within a day of the call is treated as a launch-day placeholder, and the next candidate is tried. If none passes, the call stays unpriced.
- **Hold time** pairs a buy with the next sell of the same ticker. Only calls with an exit post count.

The numbers are computed by code and stamped with the time they were computed. The model never calculates them; in chat it may only repeat what it was given.

## The leaderboard

The leaderboard ranks minds by how often the price moved the call's way within 7 days (or 30, switchable), then by the median move. A mind with fewer than 20 priced calls is listed but not ranked, because so few calls say little. Each mind links to its full record, and best and worst calls link to the posts on X.

## Coin pages

Every coin any mind called has a page: who called it, when and at what price, where each mind stands on it now, and every call drawn on the price chart. These pages are rebuilt from the same priced record.

## Refresh

The record is re-priced every week, when new posts are read (see [Weekly refresh](./how-a-mind-is-built.md#weekly-refresh)). Re-pricing alone is free: `pnpm brain:stats <handle>`.
