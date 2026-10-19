-- Member onboarding + alumni directory (site/onboarding.html, members.html, profile.html).
-- Run once in the Supabase SQL editor for project ngkhztjoxznpfwtbgkvr.
-- Every signed-in member can read every profile and role; each member can only
-- create, edit or delete their own.

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  first_name   text not null check (length(trim(first_name)) > 0),
  last_name    text not null check (length(trim(last_name)) > 0),
  gmail        text not null check (gmail ~* '^[^@\s]+@(gmail\.com|googlemail\.com|outlook\.com|hotmail\.com|live\.com|msn\.com|outlook\.co\.uk|hotmail\.co\.uk|live\.co\.uk|yahoo\.com|ymail\.com|rocketmail\.com|yahoo\.co\.uk|yahoo\.ca|yahoo\.co\.in|icloud\.com|me\.com|mac\.com|aol\.com|proton\.me|protonmail\.com|pm\.me|gmx\.com|gmx\.net|mail\.com|zoho\.com|fastmail\.com|hey\.com|tutanota\.com|yandex\.com|qq\.com|163\.com|126\.com|naver\.com)$'),  -- personal providers only; keep in sync with PERSONAL_DOMAINS in site/auth.js
  linkedin_url text not null check (linkedin_url ~* '^https://([a-z]{2,3}\.)?linkedin\.com/\S+$'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.experiences (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  industry    text not null,
  position    text not null,
  firm        text not null,
  start_month date not null,
  end_month   date,                       -- null means "Present"
  created_at  timestamptz not null default now(),
  check (end_month is null or end_month >= start_month)
);
create index if not exists experiences_user_id_idx on public.experiences (user_id);

-- Keep updated_at current
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

alter table public.profiles    enable row level security;
alter table public.experiences enable row level security;

create policy "members read profiles"  on public.profiles for select to authenticated using (true);
create policy "own profile insert"     on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "own profile update"     on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "own profile delete"     on public.profiles for delete to authenticated using ((select auth.uid()) = id);

create policy "members read roles"     on public.experiences for select to authenticated using (true);
create policy "own roles insert"       on public.experiences for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own roles update"       on public.experiences for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own roles delete"       on public.experiences for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.profiles, public.experiences to authenticated;

-- Role location (added after launch). Nullable so roles saved before it still load;
-- the site requires it for every new or edited role.
alter table public.experiences add column if not exists location text;

-- Class year (added after launch), stored as the graduation year and shown as
-- "Class of 2028". Nullable so profiles saved before it still load; the site asks
-- for it at sign-up and whenever a profile is edited.
alter table public.profiles add column if not exists class_year smallint
  check (class_year between 2000 and 2100);

-- Board role (added after launch), asked at sign-up. Null for members who aren't
-- on the board.
alter table public.profiles add column if not exists board_role text
  check (board_role in ('President', 'Head of Research', 'Head of Education', 'Head of Operations'));

-- Advisor type (added after launch), asked at sign-up. Null for members who aren't
-- club advisors.
alter table public.profiles add column if not exists advisor_type text
  check (advisor_type in ('Alumni Advisor', 'UChicago Advisor'));
