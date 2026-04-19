import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Shield, Loader2, AlertTriangle, Eye, EyeOff, Sparkles } from 'lucide-react';
import { useAuth, logAction } from '@/lib/auth';

export default function LoginPage() {
  const { user, profile, loading, signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState('');
  const [busy, setBusy]         = useState(false);

  useEffect(() => {
    if (!loading && user && profile?.is_active) {
      router.replace('/');
    }
  }, [user, profile, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('Please enter your email and password.'); return; }
    setError('');
    setBusy(true);
    try {
      const { error: signInError } = await signIn(email, password);
      if (signInError) {
        setError('Invalid email or password.');
        return;
      }
      // profile is fetched by auth context — check after a tick
      await new Promise(r => setTimeout(r, 400));
      // log action non-blockingly
      logAction('login', { email });
      router.replace('/');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return null;

  return (
    <>
      <Head>
        <title>Sign In · Claim Validation Portal</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          {/* Logo / brand */}
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-700 to-brand-900 flex items-center justify-center shadow-lg mx-auto mb-4">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Claim Validation Portal</h1>
            <p className="text-sm text-slate-500 mt-1">Sign in to continue</p>
          </div>

          {/* Card */}
          <div className="card">
            <div className="card-body py-7 space-y-4">
              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label">Email</label>
                  <input
                    type="email"
                    className="input-field"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    autoComplete="email"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="label">Password</label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      className="input-field pr-10"
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(v => !v)}
                      className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600"
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button type="submit" disabled={busy} className="btn-primary w-full">
                  {busy
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</>
                    : 'Sign In'}
                </button>
              </form>
            </div>
          </div>

          <p className="text-center text-xs text-slate-400 mt-6">
            <span className="inline-flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Powered by Claude AI · A project by Govind Amilkanthwar
            </span>
          </p>
        </div>
      </div>
    </>
  );
}
