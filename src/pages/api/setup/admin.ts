/**
 * ONE-TIME SETUP ENDPOINT – Create the first admin user.
 * Only works when zero admin profiles exist.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminClient } from '@/lib/supabaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  if (password.length < 8)  return res.status(400).json({ error: 'password must be at least 8 characters' });

  const adminClient = getAdminClient();

  // Lock once any admin exists
  const { data: existingAdmin, error: checkErr } = await adminClient
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle();

  if (checkErr) {
    return res.status(500).json({ error: 'Database tables not yet created. Run migration first.' });
  }

  if (existingAdmin) {
    return res.status(400).json({ error: 'Admin already exists. Use the admin panel to manage users.' });
  }

  // Create auth user
  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr) return res.status(400).json({ error: createErr.message });

  // Insert admin profile
  const { error: profileErr } = await adminClient.from('profiles').insert({
    id:        created.user.id,
    email,
    role:      'admin',
    is_active: true,
  });

  if (profileErr) {
    // Cleanup: delete the auth user so setup can be re-run
    await adminClient.auth.admin.deleteUser(created.user.id);
    return res.status(500).json({ error: profileErr.message });
  }

  // Log it
  await adminClient.from('activity_logs').insert({
    user_id:  created.user.id,
    email,
    action:   'admin_setup',
    metadata: { setup: true },
  });

  return res.status(201).json({ ok: true, email });
}
