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

-- Private member details: officers only (row level security below). Student IDs never go in
-- public.members, which anyone can read.
create table if not exists public.member_private (
  member_id   uuid primary key references public.members(id) on delete cascade,
  wsu_id      text not null,
  paid_member boolean not null default false
);
create unique index if not exists member_private_wsu_id_idx on public.member_private (lower(wsu_id));

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

-- Leaderboard: total points per active member, optionally only since a date. Only paid members are
-- ranked; unpaid members are listed with the rank they would have, so they can see where they stand.
drop function if exists public.leaderboard(timestamptz);   -- recreated below; its columns changed once
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
grant execute on function public.is_admin() to anon, authenticated;

-- Look up one member's leaderboard row by exact WSU ID; never returns the ID.
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


-- ---------------------------------------------------------------------------
-- Row Level Security: anyone can read, only admins can write.
-- Don't store anything private (emails, student IDs) — these tables are public.
-- ---------------------------------------------------------------------------

alter table public.members       enable row level security;
alter table public.events        enable row level security;
alter table public.point_entries enable row level security;
alter table public.admins        enable row level security;
alter table public.member_private enable row level security;

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

-- member_private: no public read; admins only.
drop policy if exists "admin only" on public.member_private;
create policy "admin only" on public.member_private
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
