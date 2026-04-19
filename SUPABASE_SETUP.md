# Supabase Setup Guide

## 1. Create a Supabase Project
1. Go to https://supabase.com and create a new project.
2. Note your **Project URL** and **API keys** from  
   *Settings → API*.

## 2. Configure Environment Variables
Copy `.env.example` to `.env.local` and fill in:
```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>   ← never expose publicly
```
Add the same three variables in **Vercel → Project → Settings → Environment Variables**.

## 3. Run the Migration
1. In the Supabase Dashboard, open **SQL Editor**.
2. Paste the contents of `supabase/migrations/001_initial.sql` and click **Run**.

## 4. Disable Public Sign-Up
1. Go to *Authentication → Providers → Email*.
2. Toggle **"Confirm email"** ON (recommended).
3. Go to *Authentication → Settings* and set  
   **"Enable sign ups"** to **OFF**.  
   Only users created by an admin (via the Admin page) can access the app.

## 5. Create the First Admin User
Since sign-up is disabled, create the first admin manually:

### Via Supabase Dashboard
1. Go to *Authentication → Users → Add User*.
2. Set email + password, click **Create**.
3. Copy the new user's **UUID**.
4. In the SQL Editor run:
```sql
insert into public.profiles (id, email, role, is_active)
values ('<UUID>', '<YOUR_EMAIL>', 'admin', true);
```

### Via Admin API (once app is running)
Once the first admin is set up, all subsequent users can be created from  
`/admin` inside the app.

## 6. Verify
- Visit your app URL — you should see the login page.
- Log in with the admin credentials you just created.
- Navigate to `/admin` to access the admin dashboard.

## Table Overview
| Table | Purpose |
|---|---|
| `profiles` | User accounts with `role` (`admin`/`user`) and `is_active` flag |
| `activity_logs` | Every tracked action with timestamp, user, and metadata |
| `claim_submissions` | Each claim run: who, what, decision, confidence |

## RLS Summary
- **profiles**: users see only their own row; admins see all rows.
- **activity_logs**: users see only their own logs; admins see all.
- **claim_submissions**: users see only their own; admins see all.
- All writes (inserts) go through server-side API routes using the  
  service-role key, which bypasses RLS automatically.
