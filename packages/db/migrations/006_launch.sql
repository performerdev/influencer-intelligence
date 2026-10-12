-- Launch: takedown requests (handled by hand), errors log, shares, fresh posts,
-- paid "Add a brain" jobs, brains added by users.

-- Takedown requests: stored, read and acted on by a person — nothing is removed automatically.
alter table takedown_requests add column if not exists contact     text;
alter table takedown_requests add column if not exists reason      text;
alter table takedown_requests add column if not exists note        text;
alter table takedown_requests add column if not exists client_hash text;
alter table takedown_requests add column if not exists user_id     integer references users(id) on delete set null;
alter table takedown_requests add column if not exists handled_at  timestamptz;

-- Server and browser errors, for the admin page.
create table if not exists errors (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  source      text not null,             -- server | client
  route       text,
  message     text not null,
  detail      text,
  user_id     integer,
  client_hash text
);
create index if not exists errors_at on errors (at desc);

-- Shared answers: /s/<id> pages and their cards.
create table if not exists shares (
  id          text primary key,
  message_id  bigint not null references messages(id) on delete cascade,
  user_id     integer references users(id) on delete set null,
  client_hash text,
  views       integer not null default 0,
  claimed_at  timestamptz,               -- posted on X for the free 2-hour session
  created_at  timestamptz not null default now()
);
create unique index if not exists shares_message on shares (message_id);
alter table users add column if not exists share_bonus_at timestamptz;

-- Latest posts since the brain was built, fetched at chat time and cached.
create table if not exists recent_posts (
  influencer_id integer primary key references influencers(id) on delete cascade,
  fetched_at    timestamptz not null,
  posts         jsonb not null
);

-- Brains added by users.
alter table influencers add column if not exists avatar_url text;
alter table influencers add column if not exists color      text;
alter table influencers add column if not exists added_by   integer references users(id) on delete set null;
alter table influencers add column if not exists hidden     boolean not null default false;

alter table jobs add column if not exists user_id       integer references users(id) on delete set null;
alter table jobs add column if not exists influencer_id integer references influencers(id) on delete set null;
alter table jobs add column if not exists profile       jsonb;
alter table jobs add column if not exists breakdown     jsonb;
alter table jobs add column if not exists max_usd       numeric;
alter table jobs add column if not exists paid_at       timestamptz;
alter table jobs add column if not exists started_at    timestamptz;
alter table jobs add column if not exists finished_at   timestamptz;
create index if not exists jobs_status on jobs (status, created_at);

alter table payments add column if not exists purpose text not null default 'plus';
alter table payments add column if not exists job_id  uuid references jobs(id) on delete set null;

create index if not exists spend_at on spend (at);
