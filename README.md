# Influencer Intelligence

Every mind on Crypto Twitter, as an open-source AI. Each mind is built only from one person's public posts on X, answers the way they would, and knows every call they made, priced by code.

Live at [ii.plus](https://ii.plus). The docs are at [ii.plus/docs](https://ii.plus/docs) and in [`docs/`](docs).

## Quickstart

```bash
pnpm i
pnpm dev:mock        # local Postgres + mock APIs, no keys; prints how to start the site against it
pnpm test:pipeline   # the whole mind build, end to end, offline
```

To build real minds you need a `.env` (copy `.env.example`): a twitterapi.io key, a DeepSeek key (or any OpenAI-compatible provider) and a Postgres URL.

```bash
pnpm db:migrate
pnpm brain:probe blknoiz06                  # cheap check of every API + cost estimate
pnpm brain:build blknoiz06 --max-usd 15     # ingest → distill → stats → brain → export to brains/
```

## Docs

- [Overview](docs/README.md)
- [How a mind is built](docs/how-a-mind-is-built.md)
- [Calls and the record](docs/calls-and-record.md)
- [How a mind answers](docs/how-a-mind-answers.md)
- [Accounts, limits and Plus](docs/accounts-and-plus.md)
- [Add a mind](docs/add-a-mind.md)
- [Early and $ii](docs/early-and-ii.md)
- [Privacy and removal](docs/privacy-and-removal.md)
- [Run it yourself](docs/run-it-yourself.md)
- [Code map](docs/code-map.md)

## Disclaimer

Unofficial AI models built from public posts. Not affiliated with the people modelled. Not financial advice.

MIT licensed.
