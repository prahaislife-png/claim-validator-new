import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyAdmin } from '@/lib/supabaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const auth = await verifyAdmin(token);
  if (!auth) return res.status(403).json({ error: 'Forbidden' });

  const limit  = Math.min(parseInt(String(req.query.limit  ?? 100)), 500);
  const offset = parseInt(String(req.query.offset ?? 0));
  const action = req.query.action as string | undefined;

  let query = auth.adminClient
    .from('activity_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (action) query = query.eq('action', action);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ logs: data, total: count });
}
