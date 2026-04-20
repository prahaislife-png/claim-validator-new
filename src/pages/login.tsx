import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Shield, Loader2, AlertTriangle, Eye, EyeOff, ArrowRight } from 'lucide-react';
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
      await new Promise(r => setTimeout(r, 400));
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

      <div
        className="min-h-screen flex items-center justify-center px-4 py-10 relative overflow-hidden"
        style={{
          backgroundImage:
            'radial-gradient(1200px 600px at 10% -10%, rgba(99,102,241,0.08), transparent 60%),' +
            'radial-gradient(900px 500px at 100% 110%, rgba(59,130,246,0.08), transparent 60%),' +
            'linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)',
        }}
      >
        <div className="w-full max-w-[400px] relative">
          {/* Brand */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-700 to-brand-900 shadow-[0_10px_30px_-10px_rgba(30,64,175,0.5)] ring-1 ring-white/40 mb-5">
              <Shield className="w-8 h-8 text-white" strokeWidth={2} />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Claim Validation Portal
            </h1>
            <p className="text-sm text-slate-500 mt-1.5">
              Sign in to access your workspace
            </p>
          </div>

          {/* Card */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_40px_-12px_rgba(15,23,42,0.12)] p-8">
            {error && (
              <div className="flex items-start gap-2 p-3 mb-5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="email" className="block text-xs font-semibold text-slate-700 tracking-wide">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  className="w-full h-11 px-3.5 text-sm text-slate-900 bg-white border border-slate-200 rounded-lg placeholder-slate-400
                             focus:outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10
                             transition-all duration-150"
                  placeholder="you@company.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="block text-xs font-semibold text-slate-700 tracking-wide">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPw ? 'text' : 'password'}
                    className="w-full h-11 pl-3.5 pr-11 text-sm text-slate-900 bg-white border border-slate-200 rounded-lg placeholder-slate-400
                               focus:outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10
                               transition-all duration-150"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-0 w-10 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-r-lg
                               focus:outline-none focus:text-slate-700 transition-colors"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full h-11 inline-flex items-center justify-center gap-2 text-sm font-semibold text-white rounded-lg
                           bg-gradient-to-b from-brand-700 to-brand-900
                           shadow-[0_1px_0_rgba(255,255,255,0.12)_inset,0_8px_20px_-8px_rgba(30,64,175,0.55)]
                           hover:from-brand-800 hover:to-brand-900
                           active:scale-[0.99]
                           focus:outline-none focus:ring-4 focus:ring-brand-600/25
                           disabled:opacity-60 disabled:cursor-not-allowed
                           transition-all duration-150"
              >
                {busy ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</>
                ) : (
                  <>Sign In <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-slate-400 mt-6">
            A project by Govind Amilkanthwar
          </p>
        </div>
      </div>
    </>
  );
}
