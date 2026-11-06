-- One-time fix: replace a hand-made, EMPTY public.members table with the one schema.sql creates.
-- It stops without changing anything if members or point_entries holds any rows.
-- After it succeeds: run supabase/schema.sql again, then db/supabase_import.sql.
begin;

do $$
begin
  if exists (select 1 from public.members) then
    raise exception 'public.members has rows; nothing was changed.';
  end if;
  if to_regclass('public.point_entries') is not null
     and exists (select 1 from public.point_entries) then
    raise exception 'public.point_entries has rows; nothing was changed.';
  end if;
end $$;

drop table if exists public.member_private;
drop table if exists public.point_entries;   -- empty (checked above); schema.sql recreates it linked to the new members
drop table public.members cascade;           -- empty (checked above)

commit;
