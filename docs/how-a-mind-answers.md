# How a mind answers

This page follows one question from the chat box to the answer ([`apps/web/app/api/chat/route.ts`](../apps/web/app/api/chat/route.ts)).

## One question, step by step

1. **Limits.** The site checks that you may ask: guests get one message a day, logged-in users spend a session budget (see [Accounts, limits and Plus](./accounts-and-plus.md)). There is also a daily ceiling on what the whole site spends on the model.
2. **History.** The last 16 messages of the chat are loaded from the database, never from the browser, and only from your own chats.
3. **The brain.** The mind's brain (see [How a mind is built](./how-a-mind-is-built.md#4-brain-assemble-the-prompt)) is the system prompt. It is identical for every message, so the provider's prompt cache applies and long brains stay cheap.
4. **What is attached to this turn only:**
   - **Calls on record.** For every ticker you mention (or mentioned in the previous question), the mind's complete list of calls on it, with quotes.
   - **Live data.** What the brain can't know from its posts: prices right now, and what the person posted since the brain was built (cached for 2 hours). Both are labelled as live data. If a lookup fails, the block is simply left out.
   - **Cards.** A short list of live cards the mind may place in its answer.
5. **The answer** streams back word by word.
6. **Checks after the answer:**
   - A verdict line is read off the end (see below).
   - Every `[post:ID]` the answer cites is resolved to a real post. Only posts this brain really contains survive: a call, an example, or a post cited in its mind or rules.
   - The answer is stored with the brain version that wrote it and its real cost.

If the same first question was asked of the same brain version within the last hour, the stored answer is reused instead of asking the model again.

## The rules a mind follows

The rules open every brain ([`packages/brain-core/src/prompts.ts`](../packages/brain-core/src/prompts.ts)). In short:

- Answer straight away, in the person's voice, with no preamble or disclaimer. The site already labels every mind as unofficial and not financial advice.
- Past calls and numbers come only from the brain's calls and stats, or from the calls attached to the question. Never invent a call, price, date or return. No data means saying there is no data.
- If the brain has nothing on a topic, say so in their voice.
- Give a verdict only when asked for a decision (buy, sell, hold, ape, fade): one last line, `VERDICT: BUY`, `SELL`, `HOLD` or `PASS`.
- Asked sincerely whether it is the real person: say plainly that it is their AI brain, built from their posts.
- If someone is about to risk money they can't afford to lose, tell them.

## Cards

A mind can put a tag on its own line, and the site draws a live card there from its own data. The model only places the card; the numbers in it come from code.

| Tag | Card |
| --- | --- |
| `[[calls:TICKER]]` | The coin's price chart with every call the mind made on it |
| `[[coin:TICKER]]` | The coin right now: price, 24h, market cap, distance from its top |
| `[[compare:A,B,C]]` | Two to four coins side by side, with the mind's calls on each |
| `[[record]]` | The mind's whole record: hit rate, median moves, best and worst calls |
| `[[rule:entry]]` | The mind's written rules on entry (also `exit`, `sizing`, `risk`, `hold`, `averaging`), with the posts |

## Open the brain

Under any answer you can open the exact brain the model saw: the full system prompt and the brain files, in the version that wrote that answer ([`apps/web/app/api/brain/[handle]/route.ts`](../apps/web/app/api/brain/[handle]/route.ts)).

## Group chat

Two to four minds in one room ([`apps/web/app/api/group/route.ts`](../apps/web/app/api/group/route.ts)):

- You ask once; the site returns who speaks and in which order. Starting a message with `@ii-04` or `@handle` asks only those minds.
- Each mind answers in turn, with its own brain as the system prompt and the conversation so far attached, so it can answer the others.
- **Debate rounds**, where the minds go back and forth, are a Plus feature.

## Check a coin, rate my bag

Two tools ask a mind to judge real, live coins the way it picks them ([`apps/web/lib/server/tools.ts`](../apps/web/lib/server/tools.ts)):

- **Check a coin.** Paste a ticker, a contract address, or a DexScreener, pump.fun, Birdeye, GMGN or Solscan link. The site fetches live market data, where the price stands against its own history, and on Solana a RugCheck risk report. The mind says whether it would buy.
- **Rate my bag.** List your holdings (with shares, or split evenly). The mind says what it would do with each.

Each is one model call. Everything the mind says is checked against its brain before it is shown: cited posts must be its own, "similar coins" must be coins it really called, quoted rules must really be in its rules. Numbers come from code.

## Sharing an answer

Any answer can be shared as a public page at a random link (`/s/<id>`). The page shows only the question and the answer, never the account that asked. Posting the link on X earns a free 2-hour session, once a day.
