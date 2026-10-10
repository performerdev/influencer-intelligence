-- Replies to other people (opt-in per account) and the post each one answers.
alter table posts drop constraint if exists posts_kind_check;
alter table posts add constraint posts_kind_check check (kind in ('post', 'quote', 'thread', 'reply'));
alter table posts add column if not exists reply_to_author text;
alter table posts add column if not exists reply_to_text text;
create index if not exists posts_reply_parent_missing on posts (influencer_id) where kind = 'reply' and reply_to_text is null;
