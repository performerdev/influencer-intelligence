-- Accounts (log in with X), usage sessions, chat history, Plus payments.
create table if not exists users (
  id                 serial primary key,
  x_id               text not null unique,
  handle             text not null,
  name               text,
  avatar_url         text,
  plus_until         timestamptz,                  -- Plus while this is in the future
  plus_spent_usd     numeric(10,4) not null default 0, -- real model cost used in the current Plus period
  session_started_at timestamptz,                  -- usage session (4h) start
  session_spent_usd  numeric(10,4) not null default 0,
  created_at         timestamptz not null default now(),
  last_seen_at       timestamptz not null default now()
);

alter table chats add column if not exists user_id integer references users(id) on delete set null;
alter table chats add column if not exists updated_at timestamptz not null default now();
create index if not exists chats_user_recent on chats (user_id, updated_at desc) where user_id is not null;

alter table messages add column if not exists user_id integer references users(id) on delete set null;
alter table messages add column if not exists cost_usd numeric(10,5) not null default 0;

create table if not exists payments (
  id            serial primary key,
  user_id       integer not null references users(id) on delete cascade,
  reference     text not null unique,              -- Solana Pay reference key (base58)
  chain         text not null default 'solana',
  token         text not null default 'USDC',
  amount_usd    numeric(10,2) not null,
  recipient     text not null,
  status        text not null default 'pending' check (status in ('pending', 'paid', 'expired')),
  signature     text unique,
  created_at    timestamptz not null default now(),
  paid_at       timestamptz
);
create index if not exists payments_user on payments (user_id, created_at desc);
