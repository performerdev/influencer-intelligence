-- Influencer Intelligence — initial schema.
-- Post texts live only here (X's terms don't allow redistributing them);
-- the public repo gets post IDs only.

create table if not exists influencers (
  id                 serial primary key,
  code               text not null unique,            -- ii-01 …
  handle             text not null,
  x_user_id          text,
  display_name       text,
  bio                text,
  followers          integer,
  statuses_count     integer,                          -- X's own count, includes replies + reposts
  account_created_at timestamptz,
  profile_fetched_at timestamptz,
  posts_parsed       integer not null default 0,       -- real count of stored posts
  posts_per_day      real,                             -- last 90 days
  first_post_at      timestamptz,
  last_post_at       timestamptz,
  one_line_mind      text,                             -- written by the distill step
  status             text not null default 'pending',  -- pending | ingesting | distilling | ready | failed
  created_at         timestamptz not null default now()
);
create unique index if not exists influencers_handle_lower on influencers (lower(handle));

create table if not exists posts (
  id              text primary key,                    -- X post id
  influencer_id   integer not null references influencers(id) on delete cascade,
  kind            text not null check (kind in ('post', 'quote', 'thread')),
  text            text not null,
  created_at      timestamptz not null,
  conversation_id text,
  in_reply_to_id  text,
  quoted_id       text,
  quoted_author   text,
  quoted_text     text,
  likes           integer,
  reposts         integer,
  replies         integer,
  quotes          integer,
  views           bigint,
  lang            text,
  raw             jsonb,
  fetched_at      timestamptz not null default now()
);
create index if not exists posts_influencer_time on posts (influencer_id, created_at);

-- Resumable ingest: one row per influencer and phase.
create table if not exists ingest_state (
  influencer_id  integer not null references influencers(id) on delete cascade,
  phase          text not null,                        -- timeline | search | threads | refresh
  cursor         text,
  window_until   bigint,                               -- unix seconds, search phase
  done           boolean not null default false,
  pages          integer not null default 0,
  tweets_billed  integer not null default 0,
  kept           integer not null default 0,
  updated_at     timestamptz not null default now(),
  primary key (influencer_id, phase)
);

create table if not exists distill_notes (
  influencer_id  integer not null references influencers(id) on delete cascade,
  batch_key      text not null,                        -- first_id..last_id:count, so changed batches re-run
  batch_index    integer not null,
  notes          jsonb not null,
  model          text not null,
  created_at     timestamptz not null default now(),
  primary key (influencer_id, batch_key)
);

create table if not exists calls (
  id             serial primary key,
  influencer_id  integer not null references influencers(id) on delete cascade,
  post_id        text not null references posts(id) on delete cascade,
  ticker         text not null,
  chain          text,
  address        text,
  direction      text not null check (direction in ('buy', 'sell', 'hold')),
  called_at      timestamptz not null,
  quote          text not null,
  unique (influencer_id, post_id, ticker, direction)
);
create index if not exists calls_influencer on calls (influencer_id, called_at);

create table if not exists stats (
  influencer_id  integer primary key references influencers(id) on delete cascade,
  data           jsonb not null,
  computed_at    timestamptz not null
);

-- Versioned brains: the exact files and the exact prompt the model sees.
create table if not exists brains (
  id             serial primary key,
  influencer_id  integer not null references influencers(id) on delete cascade,
  version        integer not null,
  files          jsonb not null,                       -- mind, rules, voice, identity, calls, stats, example_ids
  prompt         text not null,
  prompt_tokens  integer not null,
  model          text not null,
  posts_from     timestamptz,
  posts_to       timestamptz,
  created_at     timestamptz not null default now(),
  unique (influencer_id, version)
);

create table if not exists chats (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null default 'single',       -- single | room
  created_at     timestamptz not null default now()
);

create table if not exists messages (
  id             bigserial primary key,
  chat_id        uuid not null references chats(id) on delete cascade,
  role           text not null check (role in ('user', 'assistant')),
  influencer_id  integer references influencers(id) on delete set null,
  brain_version  integer,                              -- what "Open the brain" shows
  content        text not null,
  verdict        text check (verdict in ('BUY', 'SELL', 'HOLD', 'PASS')),
  refs           jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists messages_chat on messages (chat_id, id);

create table if not exists jobs (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null,                        -- add_brain | refresh
  handle         text not null,
  status         text not null default 'queued',       -- queued | parsing | distilling | ready | failed
  progress       jsonb not null default '{}'::jsonb,
  quote_usd      numeric,
  paid_tx        text,
  error          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists takedown_requests (
  id             uuid primary key default gen_random_uuid(),
  handle         text not null,
  proof_url      text not null,
  status         text not null default 'open',
  created_at     timestamptz not null default now()
);

-- Every paid API call, so real cost is always known.
create table if not exists spend (
  id             bigserial primary key,
  influencer_id  integer references influencers(id) on delete set null,
  kind           text not null,                        -- twitterapi | llm | price
  units          numeric not null,                     -- tweets billed / tokens
  usd            numeric not null,
  meta           jsonb,
  at             timestamptz not null default now()
);
