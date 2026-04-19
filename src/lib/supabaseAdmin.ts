import { createClient } from '@supabase/supabase-js';

export function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function verifyAdmin(token: string) {
  const adminClient = getAdminClient();
  const { data: { user }, error } = await adminClient.auth.getUser(token);
  if (error || !user) return null;

  const { data: profile } = await adminClient
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin' || !profile.is_active) return null;
  return { user, adminClient };
}

export async function verifyUser(token: string) {
  const adminClient = getAdminClient();
  const { data: { user }, error } = await adminClient.auth.getUser(token);
  if (error || !user) return null;

  const { data: profile } = await adminClient
    .from('profiles')
    .select('id, email, role, is_active')
    .eq('id', user.id)
    .single();

  if (!profile || !profile.is_active) return null;
  return { user, profile, adminClient };
}
