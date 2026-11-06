-- Migration: look up one member's leaderboard row by their exact WSU ID (case-insensitive).
-- Returns name, points, rank and paid status only, never the ID itself; a partial ID matches nothing.
-- Run once in Supabase -> SQL Editor. Safe to re-run. (supabase/schema.sql contains it for new setups.)
create or replace function public.leaderboard_find(id_query text, since timestamptz default null)
returns table (
  member_id    uuid,
  name         text,
  major        text,
  class_year   text,
  total_points bigint,
  rank         bigint,
  paid         boolean
)
language sql stable security definer
set search_path = ''
as $$
  select l.*
  from public.leaderboard(since) l
  join public.member_private mp on mp.member_id = l.member_id
  where lower(mp.wsu_id) = lower(trim(id_query));
$$;

grant execute on function public.leaderboard_find(text, timestamptz) to anon, authenticated;

-- Make the API see the new function right away.
notify pgrst, 'reload schema';
