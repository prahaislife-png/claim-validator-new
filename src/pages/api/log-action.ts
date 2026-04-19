import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyUser } from '@/lib/supabaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const auth = await verifyUser(token);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { action, metadata = {} } = req.body ?? {};
  if (!action) return res.status(400).json({ error: 'Missing action' });

  const { error } = await auth.adminClient.from('activity_logs').insert({
    user_id: auth.user.id,
    email: auth.profile.email,
    action,
    metadata,
  });

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
}
