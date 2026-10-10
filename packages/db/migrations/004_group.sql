-- Group chat: which debate round an answer belongs to (0 = first answer, 1–2 = debate).
alter table messages add column if not exists round smallint not null default 0;
create index if not exists messages_chat_order on messages (chat_id, id);
