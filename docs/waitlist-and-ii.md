# The waitlist and $ii

**$ii** is the project's token. It is **not live yet**: there is no contract address, and the site shows "not live yet" wherever the contract would be ([`apps/web/config/token.ts`](../apps/web/config/token.ts)). Any address that claims to be $ii before it appears on the site is not.

## The waitlist

Before launch, spots on the waitlist are handed out on `/waitlist` by **Waitlist Mind** (ii-00), a scripted chat that works like the other minds ([`apps/web/lib/server/early.ts`](../apps/web/lib/server/early.ts), [`apps/web/config/early.ts`](../apps/web/config/early.ts)). The waitlist gives a role and a place in line, not tokens.

1. **Log in with X.** One spot per X account.
2. **Add a Solana wallet** for your spot. The address is checked to be a real wallet (not a program address).
3. **Three tasks on X:** follow the project's account, like and repost the launch post, and reply to it.

A wallet and all three tasks: you get the **Waitlist role** and the next spot number (#0001, #0002, …), and a card to post on X.

Each person on the list gets an invite link (`/e/<handle>`). Friends who open it and finish the three tasks are counted on your spot. The first invite a person opens is the one that counts.

Adding a mind earns $ii on its own: see [What you get for adding one](./add-a-mind.md#what-you-get-for-adding-one). It goes to the wallet on your waitlist spot, so join the waitlist to lock it in.

## What is checked

Tasks are saved when you report them, and every task is **re-checked before doors open**; undo one and you lose the spot. The date goes out on the project's X account first. Nothing on this page uses the model, so it costs nothing to run.

The project's X account and the launch post are set on the admin page, not in code. People who joined when this page was called Early are on the waitlist with the same number.
