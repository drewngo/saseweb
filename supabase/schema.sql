-- SASE @ Wichita State — database schema
-- Run this once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Safe to re-run: it only creates things that don't exist yet.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  major       text,
  class_year  text,                       -- e.g. "Freshman", "2028"
  active      boolean not null default true, -- inactive members are hidden from the leaderboard
  created_at  timestamptz not null default now()
);

create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  location    text,
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  points      integer not null default 0,  -- default points for attending
  category    text not null default 'general', -- general | professional | social | service | cultural
  created_at  timestamptz not null default now()
);

create table if not exists public.point_entries (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.members(id) on delete cascade,
  event_id    uuid references public.events(id) on delete set null,
  points      integer not null,
  reason      text,
  awarded_at  timestamptz not null default now(),
  awarded_by  uuid references auth.users(id) on delete set null default auth.uid(),
  -- A member can only be credited once per event. Manual entries (event_id null) are unlimited.
  unique (member_id, event_id)
);

create index if not exists point_entries_member_idx on public.point_entries(member_id);
create index if not exists point_entries_awarded_idx on public.point_entries(awarded_at);
create index if not exists events_starts_idx on public.events(starts_at);

-- Officers who may edit data. Add a row here for each officer's Supabase Auth user.
create table if not exists public.admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  note        text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Leaderboard: total points per active member, optionally only since a date.
create or replace function public.leaderboard(since timestamptz default null)
returns table (
  member_id    uuid,
  name         text,
  major        text,
  class_year   text,
  total_points bigint,
  rank         bigint
)
language sql stable security invoker
set search_path = ''
as $$
  select
    m.id,
    m.name,
    m.major,
    m.class_year,
    coalesce(sum(p.points), 0)::bigint as total_points,
    rank() over (order by coalesce(sum(p.points), 0) desc) as rank
  from public.members m
  left join public.point_entries p
    on p.member_id = m.id
   and (since is null or p.awarded_at >= since)
  where m.active
  group by m.id
  order by total_points desc, m.name;
$$;

grant execute on function public.leaderboard(timestamptz) to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security: anyone can read, only admins can write.
-- Don't store anything private (emails, student IDs) — these tables are public.
-- ---------------------------------------------------------------------------

alter table public.members       enable row level security;
alter table public.events        enable row level security;
alter table public.point_entries enable row level security;
alter table public.admins        enable row level security;

do $$
declare t text;
begin
  foreach t in array array['members', 'events', 'point_entries'] loop
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format('create policy "public read" on public.%I for select to anon, authenticated using (true)', t);
    execute format('drop policy if exists "admin write" on public.%I', t);
    execute format('create policy "admin write" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

drop policy if exists "read own admin row" on public.admins;
create policy "read own admin row" on public.admins
  for select to authenticated using (user_id = auth.uid());
