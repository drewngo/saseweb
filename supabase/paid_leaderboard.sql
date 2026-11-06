-- Migration: rank only paid members on the leaderboard; list unpaid members with their would-be rank.
-- Run once in Supabase -> SQL Editor. Safe to re-run. (supabase/schema.sql already contains this for new setups.)
drop function if exists public.leaderboard(timestamptz);   -- its return columns change, so it must be recreated

create or replace function public.leaderboard(since timestamptz default null)
returns table (
  member_id    uuid,
  name         text,
  major        text,
  class_year   text,
  total_points bigint,
  rank         bigint,   -- among paid members only; for an unpaid member, the rank they would have if they paid
  paid         boolean
)
language sql stable security definer   -- reads paid_member from member_private; exposes nothing else from it
set search_path = ''
as $$
  with totals as (
    select
      m.id,
      m.name,
      m.major,
      m.class_year,
      coalesce(sum(p.points), 0)::bigint as total_points,
      coalesce(bool_or(mp.paid_member), false) as paid
    from public.members m
    left join public.point_entries p
      on p.member_id = m.id
     and (since is null or p.awarded_at >= since)
    left join public.member_private mp on mp.member_id = m.id
    where m.active
    group by m.id
  )
  select
    t.id, t.name, t.major, t.class_year, t.total_points,
    1 + (select count(*) from totals o where o.paid and o.total_points > t.total_points) as rank,
    t.paid
  from totals t
  order by t.total_points desc, t.name;
$$;

grant execute on function public.leaderboard(timestamptz) to anon, authenticated;
