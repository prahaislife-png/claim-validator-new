-- ============================================================
-- Claim Validation Portal – Initial Schema
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ─── PROFILES ────────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid        references auth.users(id) on delete cascade primary key,
  email       text        not null,
  role        text        not null default 'user' check (role in ('admin', 'user')),
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid        references auth.users(id)
);

-- ─── ACTIVITY LOGS ───────────────────────────────────────────
create table if not exists public.activity_logs (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        references auth.users(id) on delete set null,
  email       text,
  action      text        not null,
  -- known actions: login | logout | claim_submission | file_upload |
  --                analysis_run | result_view | report_download
  metadata    jsonb       not null default '{}',
  created_at  timestamptz not null default now()
);

-- ─── CLAIM SUBMISSIONS ───────────────────────────────────────
create table if not exists public.claim_submissions (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        references auth.users(id) on delete set null,
  email          text,
  partner_id     text,
  partner_name   text,
  request_number text,
  claim_data     jsonb       not null default '{}',
  document_count int         not null default 0,
  decision       text,
  confidence     int,
  created_at     timestamptz not null default now()
);

-- ─── INDEXES ─────────────────────────────────────────────────
create index if not exists activity_logs_user_id_idx  on public.activity_logs (user_id);
create index if not exists activity_logs_action_idx   on public.activity_logs (action);
create index if not exists activity_logs_created_idx  on public.activity_logs (created_at desc);
create index if not exists claim_submissions_user_idx on public.claim_submissions (user_id);
create index if not exists claim_submissions_date_idx on public.claim_submissions (created_at desc);

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────
alter table public.profiles         enable row level security;
alter table public.activity_logs    enable row level security;
alter table public.claim_submissions enable row level security;

-- DROP existing policies so this script is idempotent
do $$ begin
  drop policy if exists "profiles_self_select"         on public.profiles;
  drop policy if exists "profiles_admin_select"        on public.profiles;
  drop policy if exists "profiles_admin_insert"        on public.profiles;
  drop policy if exists "profiles_admin_update"        on public.profiles;
  drop policy if exists "logs_self_select"             on public.activity_logs;
  drop policy if exists "logs_admin_select"            on public.activity_logs;
  drop policy if exists "logs_service_insert"          on public.activity_logs;
  drop policy if exists "submissions_self_select"      on public.claim_submissions;
  drop policy if exists "submissions_admin_select"     on public.claim_submissions;
  drop policy if exists "submissions_service_insert"   on public.claim_submissions;
end $$;

-- PROFILES
create policy "profiles_self_select"   on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_admin_select"  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "profiles_admin_insert"  on public.profiles for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "profiles_admin_update"  on public.profiles for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ACTIVITY LOGS
-- All writes go through service-role API routes — no client inserts needed.
-- Reads: own rows only for users, all rows for admins.
create policy "logs_self_select"   on public.activity_logs for select
  using (auth.uid() = user_id);

create policy "logs_admin_select"  on public.activity_logs for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Allow service-role inserts (bypasses RLS, listed here for documentation)
-- Service role key is used server-side and bypasses all RLS automatically.

-- CLAIM SUBMISSIONS
create policy "submissions_self_select" on public.claim_submissions for select
  using (auth.uid() = user_id);

create policy "submissions_admin_select" on public.claim_submissions for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ─── TRIGGER: auto-populate profiles on signup (optional helper) ──
-- Not used here because signup is admin-only. Profiles are inserted
-- manually by the admin API route after auth.admin.createUser().

-- ─── SEED: First admin user ───────────────────────────────────────
-- After running this migration, create the first admin in Supabase Auth
-- (Dashboard → Authentication → Users → Invite), then run:
--
--   insert into public.profiles (id, email, role, is_active)
--   values ('<AUTH_USER_UUID>', '<YOUR_EMAIL>', 'admin', true);
--
-- See SUPABASE_SETUP.md for full instructions.
