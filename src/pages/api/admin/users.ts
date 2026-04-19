import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyAdmin, getAdminClient } from '@/lib/supabaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const auth = await verifyAdmin(token);
  if (!auth) return res.status(403).json({ error: 'Forbidden' });

  const { adminClient } = auth;

  // ── GET: list all users with last login ─────────────────────
  if (req.method === 'GET') {
    const { data: profiles, error } = await adminClient
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });

    // Attach last login from activity_logs
    const { data: lastLogins } = await adminClient
      .from('activity_logs')
      .select('user_id, created_at')
      .eq('action', 'login')
      .order('created_at', { ascending: false });

    const lastLoginMap: Record<string, string> = {};
    for (const log of lastLogins ?? []) {
      if (log.user_id && !lastLoginMap[log.user_id]) {
        lastLoginMap[log.user_id] = log.created_at;
      }
    }

    const enriched = (profiles ?? []).map(p => ({
      ...p,
      last_login: lastLoginMap[p.id] ?? null,
    }));

    return res.status(200).json({ users: enriched });
  }

  // ── POST: create a new user ─────────────────────────────────
  if (req.method === 'POST') {
    const { email, password, role = 'user' } = req.body ?? {};
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: 'invalid role' });

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError) return res.status(400).json({ error: createError.message });

    const { error: profileError } = await adminClient.from('profiles').insert({
      id: created.user.id,
      email,
      role,
      is_active: true,
      created_by: auth.user.id,
    });
    if (profileError) return res.status(500).json({ error: profileError.message });

    // Log the action
    await adminClient.from('activity_logs').insert({
      user_id: auth.user.id,
      email: auth.user.email,
      action: 'user_created',
      metadata: { created_email: email, role },
    });

    return res.status(201).json({ user: { id: created.user.id, email, role, is_active: true } });
  }

  // ── PATCH: update user (deactivate/reactivate/change role) ──
  if (req.method === 'PATCH') {
    const { id, is_active, role } = req.body ?? {};
    if (!id) return res.status(400).json({ error: 'id required' });

    const updates: Record<string, unknown> = {};
    if (is_active !== undefined) updates.is_active = is_active;
    if (role !== undefined) updates.role = role;

    const { error } = await adminClient.from('profiles').update(updates).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });

    await adminClient.from('activity_logs').insert({
      user_id: auth.user.id,
      email: auth.user.email,
      action: 'user_updated',
      metadata: { target_id: id, ...updates },
    });

    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
