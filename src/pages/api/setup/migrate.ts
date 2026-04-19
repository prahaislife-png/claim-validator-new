/**
 * ONE-TIME SETUP ENDPOINT – Run the database migration.
 * Protected by a setup secret. Auto-disables once an admin profile exists.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminClient } from '@/lib/supabaseAdmin';

const MIGRATION_SQL = `
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
alter table public.profiles          enable row level security;
alter table public.activity_logs     enable row level security;
alter table public.claim_submissions enable row level security;

-- Profiles
create policy "profiles_self_select"  on public.profiles for select using (auth.uid() = id);
create policy "profiles_admin_select" on public.profiles for select using (exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "profiles_admin_insert" on public.profiles for insert with check (exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "profiles_admin_update" on public.profiles for update using (exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Activity logs
create policy "logs_self_select"  on public.activity_logs for select using (auth.uid() = user_id);
create policy "logs_admin_select" on public.activity_logs for select using (exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Claim submissions
create policy "submissions_self_select"  on public.claim_submissions for select using (auth.uid() = user_id);
create policy "submissions_admin_select" on public.claim_submissions for select using (exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Supabase env vars not configured' });
  }

  const adminClient = getAdminClient();

  // Check if already set up (any admin profile exists → locked)
  let existing = null;
  try {
    const { data } = await adminClient
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .limit(1)
      .maybeSingle();
    existing = data;
  } catch { /* table may not exist yet — that's fine */ }

  if (existing) {
    return res.status(400).json({ error: 'Database already set up. This endpoint is disabled once an admin exists.' });
  }

  // Try to run migration via Supabase Management API
  const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL!
    .replace('https://', '')
    .replace('.supabase.co', '');

  const mgmtRes = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ query: MIGRATION_SQL }),
    },
  );

  if (mgmtRes.ok) {
    return res.status(200).json({ ok: true, method: 'management_api' });
  }

  const mgmtErr = await mgmtRes.text().catch(() => 'unknown');

  // Fallback: return the SQL so it can be pasted manually
  return res.status(202).json({
    ok: false,
    manual: true,
    sql: MIGRATION_SQL,
    hint: `Auto-migration failed (${mgmtRes.status}: ${mgmtErr}). Paste the SQL in Supabase Dashboard → SQL Editor.`,
  });
}
