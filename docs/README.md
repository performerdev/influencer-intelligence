# Influencer Intelligence

Influencer Intelligence (ii) turns well-known Crypto Twitter accounts into AI models you can talk to. Each one is a **mind**: an AI built only from that person's public posts on X, which answers the way they would and knows every call they made.

These docs explain how the whole thing works, from reading posts to pricing calls to answering a question. Everything described here is in this repository, under the MIT license.

## What a mind is

A mind is a set of plain files, not a fine-tuned model:

- **mind.md**: how the person thinks: worldview, how they decide, risk attitude, narratives, who they respect and mock.
- **rules.md**: their trading rules in their own words (entry, exit, sizing, averaging, hold time, risk), each with a quote and the post it came from.
- **voice.md**: how they write: rhythm, slang, recurring phrases, humor, how they argue.
- **calls.json**: every explicit buy, sell or hold they posted, with the post it came from.
- **stats.json**: what happened to the price after each call, computed by code.

When you ask a question, these files become the model's instructions, and the model answers in that person's voice. The files for every launch mind are public in [`brains/`](../brains).

## Principles

- **Built from public posts only.** No private data, no outside knowledge about the person.
- **Numbers come from code, not the AI.** Prices, returns and hit rates are computed from historical price data. The model may only repeat numbers it was given.
- **Everything is checkable.** Every rule and call points to the post it came from. Under any answer you can open the exact brain the AI was given.
- **Unofficial.** No mind is affiliated with the person it models, and nothing here is financial advice.

## Read next

| Page | What it covers |
| --- | --- |
| [How a mind is built](./how-a-mind-is-built.md) | Reading posts, distilling them, building the brain, exporting the files |
| [Calls and the record](./calls-and-record.md) | What counts as a call, how calls are priced, the leaderboard |
| [How a mind answers](./how-a-mind-answers.md) | One question, step by step; group chats; coin checks |
| [Accounts, limits and Plus](./accounts-and-plus.md) | Log in with X, usage limits, paying in USDC |
| [Add a mind](./add-a-mind.md) | Anyone can add an account; how the price is set |
| [The waitlist and $ii](./waitlist-and-ii.md) | The waitlist, its role and spots, and the $ii token |
| [Privacy and removal](./privacy-and-removal.md) | What is stored, who processes it, how to remove a brain |
| [Run it yourself](./run-it-yourself.md) | Local setup, the pipeline CLI, deploying |
| [Code map](./code-map.md) | Where everything lives in the repository |
