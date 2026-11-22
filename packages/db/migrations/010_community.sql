-- Main and Community minds, and rewards for the people who add them.

-- An admin's pin: 'main' or 'community'. Null = by the rule (built by us or 100k+ followers → main).
alter table influencers add column if not exists placement text check (placement in ('main', 'community'));

-- "Added by @you" on the minds you added; on unless you switch it off on /account.
alter table users add column if not exists show_added_by boolean not null default true;
-- When the X account was created, read at login: fresh accounts don't count toward builder rewards.
alter table users add column if not exists x_created_at timestamptz;

-- Counting the different people each mind answered.
create index if not exists messages_mind_people on messages (influencer_id, user_id) where role = 'assistant' and user_id is not null;
