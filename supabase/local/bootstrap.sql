-- SOMENTE PARA AMBIENTE LOCAL/TESTE.
-- Recria os objetos que o Supabase já fornece (papéis da API e schema
-- "extensions"), para que as mesmas migrações rodem num Postgres comum.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists extensions;
grant usage on schema public to anon, authenticated;
