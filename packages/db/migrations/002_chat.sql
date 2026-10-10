-- Chat: anonymous rate limiting and answer cache lookups.
alter table messages add column if not exists client_hash text;
alter table chats add column if not exists influencer_ids integer[];
create index if not exists messages_client_time on messages (client_hash, created_at) where role = 'user';
create index if not exists messages_time on messages (created_at desc);
