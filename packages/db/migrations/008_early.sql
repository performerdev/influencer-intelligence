-- Early Mind (/early): one early $ii allocation per X account, the three tasks
-- that unlock it, and who invited whom. Plus a small key/value table for the
-- settings the owner edits on /admin (the project's X account, the launch post).

create table if not exists early (
  user_id      integer primary key references users(id) on delete cascade,
  wallet       text,                                   -- Solana address the $ii goes to
  follow_at    timestamptz,                            -- tasks, as the person reported them;
  repost_at    timestamptz,                            -- re-checked before the snapshot
  reply_at     timestamptz,
  reply_url    text,
  referred_by  integer references users(id) on delete set null,
  number       integer unique,                         -- E-0001…, given when all three tasks are done
  done_at      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists early_referred_by on early (referred_by);
-- one wallet, one allocation
create unique index if not exists early_wallet on early (wallet) where wallet is not null;
create sequence if not exists early_number;

create table if not exists settings (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);
