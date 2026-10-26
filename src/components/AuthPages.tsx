import React, { useState } from 'react';
import {
  ArrowRight,
  Clock,
  Lock,
  Mail,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  User as UserIcon,
  Loader2,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { QaagaLogo } from './BrandIcons';
import type { AuthUser } from '../types/qaaga';

export function AuthPortal() {
  const { loginWithEmail, registerWithEmail, loginWithGoogle } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        await loginWithEmail(email, password);
      } else {
        await registerWithEmail(fullName, email, password);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setBusy(true);
    try {
      await loginWithGoogle();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    } finally {
      setBusy(false);
    }
  };

  const quickLogin = async (presetEmail: string, presetPass: string) => {
    setMode('login');
    setEmail(presetEmail);
    setPassword(presetPass);
    setError(null);
    setBusy(true);
    try {
      await loginWithEmail(presetEmail, presetPass);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Quick sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-white text-slate-900">
      {/* Left Brand & Architecture Showcase (Dark Navy) */}
      <div className="lg:w-[46%] bg-[#0A1124] text-white p-8 sm:p-12 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-3">
            <QaagaLogo className="w-9 h-9" />
            <span className="font-heading font-extrabold text-xl tracking-tight">
              QAAGA AGENT
            </span>
          </div>

          <h1 className="mt-10 font-heading font-extrabold text-3xl sm:text-4xl leading-[1.18] tracking-tight [text-wrap:balance]">
            Enterprise Multimodal AI with Prepaid Credit Governance.
          </h1>
          <p className="mt-4 text-slate-300 text-[15px] leading-relaxed max-w-md">
            Stream code, analyze PDFs & images, run grounded web research, and
            converse with neural voice—backed by 30-day carry-forward
            subscriptions and verified MFS recharges.
          </p>

          <div className="mt-8 space-y-3.5 text-[13.5px] text-slate-300 border-t border-slate-800 pt-6 max-w-md">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong className="text-white">Administrator-Verified Access:</strong>{' '}
                New registrations remain pending until approved by an administrator.
              </span>
            </div>
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong className="text-white">Append-Only Credit Ledger:</strong>{' '}
                Atomic credit reservations, automatic failure refunds, and unused credit carry-forward.
              </span>
            </div>
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong className="text-white">bKash · Nagad · Rocket Billing:</strong>{' '}
                20, 50, 100 & 200 BDT packages with 30-day validity renewal.
              </span>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-slate-800/80 text-xs text-slate-400 flex flex-wrap items-center justify-between gap-2">
          <span>QAAGA AGENT Independent AI Platform</span>
          <span>Prepaid Credits · 30-Day Carry-Forward</span>
        </div>
      </div>

      {/* Right Authentication Form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 bg-slate-50/60">
        <div className="w-full max-w-md space-y-6">
          <div>
            <h2 className="font-heading font-extrabold text-2xl text-slate-900">
              {mode === 'login'
                ? 'Sign in to QAAGA AGENT'
                : 'Create your QAAGA account'}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {mode === 'login'
                ? 'Enter your credentials or sign in with Google to continue.'
                : 'New accounts start in PENDING status until approved by an administrator.'}
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-200/70">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Register Account
            </button>
          </div>

          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl border border-slate-200/90 p-6 space-y-4 shadow-2xs"
          >
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Tanvir Ahmed"
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:bg-white focus:border-emerald-600"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {mode === 'login' ? 'Email or Admin ID' : 'Email Address'}
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={mode === 'login' ? 'text' : 'email'}
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={
                    mode === 'login'
                      ? 'you@company.com or admin'
                      : 'you@company.com'
                  }
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:bg-white focus:border-emerald-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  minLength={mode === 'register' ? 6 : 1}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:bg-white focus:border-emerald-600"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs font-medium text-rose-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-55 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>
                    {mode === 'login' ? 'Sign In' : 'Submit Registration'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-2.5 text-slate-400">or</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGoogle}
              disabled={busy}
              className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 text-sm font-semibold flex items-center justify-center gap-2.5 transition-colors cursor-pointer"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>
          </form>

          {/* 1-Click Seeded Reference Account Switcher for Instant Evaluation */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 space-y-2.5">
            <p className="text-[11.5px] font-semibold text-slate-500">
              Quick Demo Role Sign-In (Ready-to-Test Accounts)
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => quickLogin('admin', 'admin')}
                className="text-left px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 transition-colors cursor-pointer"
              >
                <div className="text-xs font-bold text-emerald-900">
                  Admin Panel
                </div>
                <div className="text-[11px] font-mono text-emerald-700 truncate">
                  admin / admin
                </div>
              </button>

              <button
                type="button"
                onClick={() => quickLogin('tanvir@qaaga.ai', 'User@12345')}
                className="text-left px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <div className="text-xs font-bold text-slate-900">
                  User Profile
                </div>
                <div className="text-[11px] font-mono text-slate-500 truncate">
                  tanvir@qaaga.ai
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  quickLogin('nusrat.jahan@example.com', 'Pending@12345')
                }
                className="text-left px-3 py-2 rounded-xl border border-amber-200/80 bg-amber-50/30 hover:bg-amber-50/60 transition-colors cursor-pointer"
              >
                <div className="text-xs font-bold text-amber-900">
                  Pending Approval
                </div>
                <div className="text-[11px] font-mono text-amber-700 truncate">
                  nusrat.jahan@...
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  quickLogin('arif.hossain@example.com', 'Expired@12345')
                }
                className="text-left px-3 py-2 rounded-xl border border-rose-200/80 bg-rose-50/30 hover:bg-rose-50/60 transition-colors cursor-pointer"
              >
                <div className="text-xs font-bold text-rose-900">
                  Expired Plan
                </div>
                <div className="text-[11px] font-mono text-rose-700 truncate">
                  arif.hossain@...
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Shown when user.status === 'PENDING' or 'SUSPENDED'
 */
export function AccountApprovalGate({
  user,
  onRefreshStatus,
  onLogout,
}: {
  user: AuthUser;
  onRefreshStatus: () => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const [checking, setChecking] = useState(false);

  const isPending = user.status === 'PENDING';

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-sm p-8 text-center space-y-5">
        <div
          className={`w-14 h-14 rounded-2xl mx-auto flex items-center justify-center ${
            isPending
              ? 'bg-amber-50 text-amber-600'
              : 'bg-rose-50 text-rose-600'
          }`}
        >
          {isPending ? (
            <Clock className="w-7 h-7" />
          ) : (
            <ShieldAlert className="w-7 h-7" />
          )}
        </div>

        <div>
          <h1 className="font-heading font-extrabold text-2xl text-slate-900">
            {isPending
              ? 'Account Pending Administrator Approval'
              : 'Account Currently Suspended'}
          </h1>
          <p className="text-sm text-slate-600 mt-2 leading-relaxed">
            {isPending
              ? `Hello ${user.fullName}, your registration (${user.email}) has been submitted. For security and credit governance, new QAAGA AGENT accounts remain locked until an administrator approves them.`
              : `Your account (${user.email}) has been suspended by a platform administrator. Please contact support for assistance.`}
          </p>
        </div>

        <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-4 text-left text-xs text-slate-600 space-y-1.5">
          <div className="flex justify-between">
            <span>Account Email</span>
            <span className="font-mono font-semibold text-slate-900">
              {user.email}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Verification Status</span>
            <span
              className={`font-semibold ${
                isPending ? 'text-amber-600' : 'text-rose-600'
              }`}
            >
              {user.status}
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            type="button"
            disabled={checking}
            onClick={async () => {
              setChecking(true);
              await onRefreshStatus();
              setChecking(false);
            }}
            className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
            <span>Check Approval Status</span>
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="py-2.5 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
