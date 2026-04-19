import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import clsx from 'clsx';
import {
  Shield, Users, Activity, BarChart3, Plus, UserCheck, UserX,
  LogIn, FileSearch, Download, Eye, Loader2, AlertTriangle,
  ChevronLeft, RefreshCw, CheckCircle, X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { Profile, ActivityLog } from '@/lib/supabase';

// ─── Types ──────────────────────────────────────────────────

type UserWithMeta = Profile & { last_login: string | null };

type Stats = {
  totalUsers: number;
  activeUsers: number;
  totalLogins: number;
  totalSubmissions: number;
  recentActivity: ActivityLog[];
  mostActive: { email: string; count: number }[];
};

// ─── Helpers ────────────────────────────────────────────────

const ACTION_LABELS: Record<string, { label: string; Icon: React.ComponentType<{ className?: string }>; cls: string }> = {
  login:           { label: 'Login',           Icon: LogIn,      cls: 'badge-info' },
  logout:          { label: 'Logout',          Icon: Activity,   cls: 'badge-neutral' },
  analysis_run:    { label: 'Analysis Run',    Icon: FileSearch, cls: 'badge-success' },
  claim_submission:{ label: 'Claim Submitted', Icon: FileSearch, cls: 'badge-success' },
  result_view:     { label: 'Result Viewed',   Icon: Eye,        cls: 'badge-neutral' },
  report_download: { label: 'Report Download', Icon: Download,   cls: 'badge-info' },
  file_upload:     { label: 'File Upload',     Icon: Plus,       cls: 'badge-neutral' },
  user_created:    { label: 'User Created',    Icon: UserCheck,  cls: 'badge-success' },
  user_updated:    { label: 'User Updated',    Icon: UserCheck,  cls: 'badge-warning' },
};

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString();
}

function fmtRelative(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 60_000)   return 'just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

async function authFetch(url: string, token: string, options: RequestInit = {}) {
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
}

// ─── Main component ──────────────────────────────────────────

type AdminTab = 'dashboard' | 'users' | 'activity';

export default function AdminPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const [tab, setTab]       = useState<AdminTab>('dashboard');
  const [token, setToken]   = useState('');

  useEffect(() => {
    if (!loading) {
      if (!user || !profile) { router.replace('/login'); return; }
      if (profile.role !== 'admin') { router.replace('/'); return; }
    }
  }, [user, profile, loading, router]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setToken(session?.access_token ?? '');
    });
  }, []);

  if (loading || !profile || profile.role !== 'admin') return null;

  return (
    <>
      <Head>
        <title>Admin · Claim Validation Portal</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
          <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/')} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-700 to-brand-900 flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold text-slate-900 leading-tight">Admin Dashboard</h1>
                <p className="text-xs text-slate-500">{profile.email}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-[1400px] mx-auto px-6 py-6 space-y-5">
          {/* Tabs */}
          <div className="flex gap-1 bg-white rounded-xl border border-slate-200 p-1 w-fit shadow-sm">
            {([
              ['dashboard', 'Dashboard', BarChart3],
              ['users',     'Users',     Users],
              ['activity',  'Activity',  Activity],
            ] as const).map(([key, label, Icon]) => (
              <button key={key} onClick={() => setTab(key)}
                className={clsx('tab-btn flex items-center gap-1.5', tab === key && 'active')}>
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>

          {tab === 'dashboard' && <DashboardTab token={token} />}
          {tab === 'users'     && <UsersTab     token={token} adminId={user!.id} />}
          {tab === 'activity'  && <ActivityTab  token={token} />}
        </main>
      </div>
    </>
  );
}

// ─── Dashboard Tab ───────────────────────────────────────────

function DashboardTab({ token }: { token: string }) {
  const [stats, setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await authFetch('/api/admin/stats', token);
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setStats(data);
    } catch { setError('Failed to load stats'); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;
  if (error)   return <ErrorBox msg={error} />;
  if (!stats)  return null;

  const statCards = [
    { label: 'Total Users',       value: stats.totalUsers,       tone: 'brand'   as const },
    { label: 'Active Users',      value: stats.activeUsers,      tone: 'emerald' as const },
    { label: 'Total Logins',      value: stats.totalLogins,      tone: 'violet'  as const },
    { label: 'Claims Submitted',  value: stats.totalSubmissions, tone: 'amber'   as const },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(c => <BigStatCard key={c.label} {...c} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Most active users */}
        <div className="card">
          <div className="card-header">
            <div className="icon-tile bg-gradient-to-br from-violet-500 to-violet-700">
              <Users className="w-4 h-4 text-white" />
            </div>
            <h3 className="section-title">Most Active Users</h3>
          </div>
          <div className="card-body divide-y divide-slate-100">
            {stats.mostActive.length === 0
              ? <p className="text-sm text-slate-500 py-2">No data yet.</p>
              : stats.mostActive.map((u, i) => (
                <div key={u.email} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-brand-100 text-brand-700 text-[11px] font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className="text-sm text-slate-800 truncate max-w-[180px]">{u.email}</span>
                  </div>
                  <span className="badge-info">{u.count} claims</span>
                </div>
              ))}
          </div>
        </div>

        {/* Recent activity */}
        <div className="card lg:col-span-2">
          <div className="card-header justify-between">
            <div className="flex items-center gap-3">
              <div className="icon-tile bg-gradient-to-br from-emerald-500 to-emerald-700">
                <Activity className="w-4 h-4 text-white" />
              </div>
              <h3 className="section-title">Recent Activity</h3>
            </div>
            <button onClick={load} className="p-1.5 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          <div className="card-body divide-y divide-slate-100">
            {stats.recentActivity.slice(0, 10).map(log => {
              const info = ACTION_LABELS[log.action] ?? { label: log.action, Icon: Activity, cls: 'badge-neutral' };
              return (
                <div key={log.id} className="flex items-center gap-3 py-2.5">
                  <info.Icon className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-800 truncate">{log.email ?? '—'}</p>
                    <p className="text-xs text-slate-500">{info.label}</p>
                  </div>
                  <span className="text-xs text-slate-400 whitespace-nowrap">{fmtRelative(log.created_at)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Users Tab ───────────────────────────────────────────────

function UsersTab({ token, adminId }: { token: string; adminId: string }) {
  const [users, setUsers]     = useState<UserWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res  = await authFetch('/api/admin/users', token);
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setUsers(data.users);
    } catch { setError('Failed to load users'); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const toggleActive = async (id: string, is_active: boolean) => {
    await authFetch('/api/admin/users', token, {
      method: 'PATCH',
      body: JSON.stringify({ id, is_active: !is_active }),
    });
    load();
  };

  if (loading) return <Spinner />;
  if (error)   return <ErrorBox msg={error} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">{users.length} user{users.length !== 1 ? 's' : ''}</p>
        <button onClick={() => setShowCreate(true)} className="btn-primary h-9 px-4 text-sm">
          <Plus className="w-4 h-4" /> Add User
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Email', 'Role', 'Status', 'Last Login', 'Created', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-medium text-slate-900">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={u.role === 'admin' ? 'badge-info' : 'badge-neutral'}>{u.role}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={u.is_active ? 'badge-success' : 'badge-error'}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{fmtDate(u.last_login)}</td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{fmtDate(u.created_at)}</td>
                  <td className="px-4 py-3">
                    {u.id !== adminId && (
                      <button
                        onClick={() => toggleActive(u.id, u.is_active)}
                        className={clsx('btn-secondary h-8 px-3 text-xs',
                          !u.is_active && 'text-emerald-700 border-emerald-300 hover:bg-emerald-50')}
                      >
                        {u.is_active ? <><UserX className="w-3 h-3" /> Deactivate</> : <><UserCheck className="w-3 h-3" /> Activate</>}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <CreateUserModal token={token} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />
      )}
    </div>
  );
}

function CreateUserModal({ token, onClose, onCreated }: { token: string; onClose: () => void; onCreated: () => void }) {
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole]       = useState<'user' | 'admin'>('user');
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const res  = await authFetch('/api/admin/users', token, {
        method: 'POST',
        body: JSON.stringify({ email, password, role }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      onCreated();
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-2xl">
        <div className="card-header justify-between">
          <div className="flex items-center gap-3">
            <div className="icon-tile bg-gradient-to-br from-brand-500 to-brand-700">
              <Plus className="w-4 h-4 text-white" />
            </div>
            <h2 className="section-title text-base">Create User</h2>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="card-body space-y-4">
          {error && <ErrorBox msg={error} />}
          <div>
            <label className="label">Email</label>
            <input className="input-field" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input-field" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
          </div>
          <div>
            <label className="label">Role</label>
            <select className="input-field" value={role} onChange={e => setRole(e.target.value as 'user' | 'admin')}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={busy} className="btn-primary flex-1">
              {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : <>Create User</>}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Activity Tab ────────────────────────────────────────────

function ActivityTab({ token }: { token: string }) {
  const [logs, setLogs]       = useState<ActivityLog[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [filter, setFilter]   = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (filter) params.set('action', filter);
      const res  = await authFetch(`/api/admin/activity?${params}`, token);
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setLogs(data.logs);
      setTotal(data.total);
    } catch { setError('Failed to load activity'); }
    finally { setLoading(false); }
  }, [token, filter]);

  useEffect(() => { load(); }, [load]);

  const allActions = Object.keys(ACTION_LABELS);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select
          className="input-field w-48"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        >
          <option value="">All actions</option>
          {allActions.map(a => (
            <option key={a} value={a}>{ACTION_LABELS[a].label}</option>
          ))}
        </select>
        <span className="text-sm text-slate-500">{total} records</span>
        <button onClick={load} className="btn-secondary h-9 px-3">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {loading ? <Spinner /> : error ? <ErrorBox msg={error} /> : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Timestamp', 'User', 'Action', 'Details'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map(log => {
                  const info = ACTION_LABELS[log.action] ?? { label: log.action, Icon: Activity, cls: 'badge-neutral' };
                  const meta = log.metadata && Object.keys(log.metadata).length > 0
                    ? JSON.stringify(log.metadata).slice(0, 80)
                    : null;
                  return (
                    <tr key={log.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{fmtDate(log.created_at)}</td>
                      <td className="px-4 py-3 text-slate-800 max-w-[200px] truncate">{log.email ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={clsx('badge', info.cls)}>{info.label}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 max-w-xs truncate">{meta ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Stat card ───────────────────────────────────────────────

type Tone = 'brand' | 'emerald' | 'violet' | 'amber';
const TONE_MAP: Record<Tone, string> = {
  brand:   'from-brand-50 to-brand-100 border-brand-200 text-brand-800',
  emerald: 'from-emerald-50 to-emerald-100 border-emerald-200 text-emerald-800',
  violet:  'from-violet-50 to-violet-100 border-violet-200 text-violet-800',
  amber:   'from-amber-50 to-amber-100 border-amber-200 text-amber-800',
};

function BigStatCard({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  return (
    <div className={clsx('rounded-xl border p-5 bg-gradient-to-br shadow-sm', TONE_MAP[tone])}>
      <p className="text-xs font-semibold uppercase tracking-wider opacity-75">{label}</p>
      <p className="text-3xl font-bold mt-1 tracking-tight">{value.toLocaleString()}</p>
    </div>
  );
}

// ─── Shared primitives ───────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {msg}
    </div>
  );
}
