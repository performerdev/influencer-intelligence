-- Supabase puts every table in the public schema on its Data API (REST), where
-- the anon and authenticated roles had full rights: anyone holding the
-- project's anon key could read, change or wipe any table.
--
-- This project never uses that API. The site and the jobs talk to Postgres
-- directly as the role that owns the tables, which row-level security doesn't
-- apply to. So: row-level security on for every table, with no policies (the
-- Data API sees no rows), and the API roles lose their grants. Idempotent.
--
-- A table added later is covered too: migrate() turns row-level security on
-- for any public table that lacks it (packages/db/src/index.ts).

do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and not rowsecurity loop
    begin
      execute format('alter table public.%I enable row level security', t.tablename);
    exception when others then
      raise notice 'row-level security not set on %: %', t.tablename, sqlerrm;
    end;
  end loop;

  -- only on Supabase (plain Postgres has no such roles)
  if exists (select 1 from pg_roles where rolname = 'anon') and exists (select 1 from pg_roles where rolname = 'authenticated') then
    begin
      execute 'revoke all on all tables in schema public from anon, authenticated';
      execute 'revoke all on all sequences in schema public from anon, authenticated';
      execute 'revoke all on all functions in schema public from anon, authenticated';
      execute 'alter default privileges in schema public revoke all on tables from anon, authenticated';
      execute 'alter default privileges in schema public revoke all on sequences from anon, authenticated';
      execute 'alter default privileges in schema public revoke all on functions from anon, authenticated';
    exception when others then
      raise notice 'API grants left as they were: %', sqlerrm;
    end;
  end if;
end $$;
