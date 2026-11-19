# Early and $ii

**$ii** is the project's token. It is **not live yet**: there is no contract address, and the site shows "not live yet" wherever the contract would be ([`apps/web/config/token.ts`](../apps/web/config/token.ts)). Any address that claims to be $ii before it appears on the site is not.

## Early Mind

Before launch, early allocations of $ii are handed out on `/early` by **Early Mind** (ii-00), a scripted chat that works like the other minds ([`apps/web/lib/server/early.ts`](../apps/web/lib/server/early.ts), [`apps/web/config/early.ts`](../apps/web/config/early.ts)).

1. **Log in with X.** One allocation per X account.
2. **Add a Solana wallet** for the allocation. The address is checked to be a real wallet (not a program address).
3. **Three tasks on X:** follow the project's account, like and repost the launch post, and reply to it.

All three tasks and a wallet: you are in, and you get the next early-mind number (E-0001, E-0002, …).

| | $ii |
| --- | --- |
| For the three tasks | 10,000 |
| For each invited friend who gets in | +1,000 |
| Invites counted | up to 10 |
| Most per account | 20,000 |

Each early mind gets an invite link (`/e/<handle>`). A friend who opens it and finishes all three tasks counts toward your bonus. The first invite a person opens is the one that counts.

## What is checked

Tasks are saved when you report them, and every task is **re-checked before the snapshot**. Allocations are final at the snapshot; its date is announced on the project's X account first. Nothing on this page uses the model, so it costs nothing to run.

The project's X account and the launch post are set on the admin page, not in code.
