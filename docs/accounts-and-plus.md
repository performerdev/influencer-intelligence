# Accounts, limits and Plus

## Log in with X

Accounts use X's own login (OAuth 2.0 with PKCE), with no third-party auth service ([`apps/web/lib/server/auth.ts`](../apps/web/lib/server/auth.ts)).

- Only two permissions are asked for: read posts and read the profile. **Never email**, and the site can't post for you.
- The access token X returns is used once, to read your profile, and is not stored.
- You stay logged in with one signed session cookie (30 days). A second, short-lived cookie protects the login step.

Logging in keeps your chats and gives you a session budget.

## Limits are in real cost

Limits are measured in what answers actually cost on the model, not in message counts. A short question costs a fraction of a cent; a long group debate costs more. One message is typically $0.003 to $0.02. The meter in the app shows what was used ([`apps/web/config/plans.ts`](../apps/web/config/plans.ts)).

| | Guest | Free | Plus |
| --- | --- | --- | --- |
| Messages | 1 a day, then log in | Session of $0.10 every 4 hours | Session of $0.60 every 4 hours (6× free) |
| Answer length | | Up to 900 tokens | Up to 1,600 tokens |
| Group debate rounds | | No | Yes |
| Chat history | | Last 7 days | Everything |
| Price | Free | Free | $10 for 30 days |

Plus has a fair-use ceiling of $8 of model cost per 30 days; past it, sessions fall back to the free size until the period renews.

The site also has a daily ceiling on total model spend for chats and groups (`DAILY_BUDGET_USD`). When it is reached, new questions wait until the next UTC day.

Guests are limited by a salted hash of their IP address. The address itself is never stored.

## A free session for sharing

Share any answer (see [Sharing an answer](./how-a-mind-answers.md#sharing-an-answer)) and post the link on X: the site checks your latest posts, and if the link is there, your session resets and runs for at least 2 more hours. Once a day per account.

## Paying in USDC

Plus and [Add a mind](./add-a-mind.md) are paid in USDC on Solana, straight from your wallet, with [Solana Pay](https://docs.solanapay.com) ([`apps/web/lib/server/plus.ts`](../apps/web/lib/server/plus.ts), [`apps/web/lib/server/solana.ts`](../apps/web/lib/server/solana.ts)):

1. A checkout gets a random **reference key**, tied to one account.
2. Your wallet adds that key to the USDC transfer.
3. The site finds the transfer on Solana by that key, checks it on-chain (right token, right recipient, enough USDC) and turns Plus on.

Paying from an exchange or any wallet without Solana Pay works too: every checkout has its own exact amount, a few hundredths of a cent apart (for example 10.0371 USDC), and a transfer of exactly that amount after the checkout started is matched to it. Sent a different amount? Paste the transaction signature instead.

The site never sees your wallet's keys. Solana is public, so the transfer and the paying address are visible on-chain to anyone.

Plus is planned to be paid in [$ii](./early-and-ii.md) once the token is live.
