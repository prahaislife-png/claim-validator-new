import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyAdmin } from '@/lib/supabaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const auth = await verifyAdmin(token);
  if (!auth) return res.status(403).json({ error: 'Forbidden' });

  const { adminClient } = auth;

  const [
    { count: totalUsers },
    { count: activeUsers },
    { count: totalLogins },
    { count: totalSubmissions },
    { data: recentActivity },
    { data: topSubmitters },
  ] = await Promise.all([
    adminClient.from('profiles').select('*', { count: 'exact', head: true }),
    adminClient.from('profiles').select('*', { count: 'exact', head: true }).eq('is_active', true),
    adminClient.from('activity_logs').select('*', { count: 'exact', head: true }).eq('action', 'login'),
    adminClient.from('claim_submissions').select('*', { count: 'exact', head: true }),
    adminClient
      .from('activity_logs')
      .select('id, email, action, metadata, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
    adminClient
      .from('claim_submissions')
      .select('email')
      .order('created_at', { ascending: false }),
  ]);

  // Build most-active-users map from submissions
  const submissionCounts: Record<string, number> = {};
  for (const s of topSubmitters ?? []) {
    if (s.email) submissionCounts[s.email] = (submissionCounts[s.email] ?? 0) + 1;
  }
  const mostActive = Object.entries(submissionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([email, count]) => ({ email, count }));

  return res.status(200).json({
    totalUsers:      totalUsers  ?? 0,
    activeUsers:     activeUsers ?? 0,
    totalLogins:     totalLogins ?? 0,
    totalSubmissions: totalSubmissions ?? 0,
    recentActivity:  recentActivity ?? [],
    mostActive,
  });
}
