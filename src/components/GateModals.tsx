import React, { useState } from 'react';
import {
  ArrowRight,
  CreditCard,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  User as UserIcon,
  X,
  Zap,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { QaagaLogo } from './BrandIcons';
import type {
  AuthUser,
  CreditSummary,
  PaymentMethodType,
  RechargePackageDTO,
} from '../types/qaaga';

export function AuthGateModal({
  open,
  reasonFeature,
  onClose,
  onAuthenticated,
}: {
  open: boolean;
  reasonFeature: string | null;
  onClose: () => void;
  onAuthenticated?: () => void;
}) {
  const { loginWithEmail, registerWithEmail, loginWithGoogle } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

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
      onClose();
      onAuthenticated?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
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
      onClose();
      onAuthenticated?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Quick sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setBusy(true);
    try {
      await loginWithGoogle();
      onClose();
      onAuthenticated?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-[2px]">
      <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <QaagaLogo className="w-8 h-8" />
            <div>
              <h2 className="font-heading font-extrabold text-lg text-slate-900 dark:text-white leading-tight">
                {reasonFeature
                  ? `Login Required for ${reasonFeature}`
                  : mode === 'login'
                  ? 'Sign in to QAAGA AGENT'
                  : 'Create QAAGA Account'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {reasonFeature
                  ? 'Free text chat works without login. Sign in to unlock all other AI commands.'
                  : 'Access your AI tools, credits, and 30-day subscription.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
            aria-label="Close login modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {reasonFeature && (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-3.5 py-2.5 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              Please sign in or register to run{' '}
              <strong>{reasonFeature}</strong>. You can continue basic text chat
              anytime on the front page.
            </span>
          </div>
        )}

        {/* Mode Switcher */}
        <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              mode === 'login'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400'
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
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Register Account
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Full Name
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your Full Name"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-600"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {mode === 'login' ? 'Email or Username' : 'Email Address'}
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
                    ? 'you@example.com, user, or admin'
                    : 'you@example.com'
                }
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
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
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 px-3 py-2 text-xs font-medium text-rose-700 dark:text-rose-300">
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
                  {mode === 'login' ? 'Sign In' : 'Create Account'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={handleGoogle}
            className="w-full py-2 px-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
          >
            Continue with Google
          </button>
        </form>

        {/* Quick Sign-In Helpers */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <p className="text-[11px] font-medium text-slate-400">
            Quick Demo Accounts
          </p>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => quickLogin('admin', 'admin')}
              className="text-left px-2.5 py-2 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/30 hover:bg-emerald-50 cursor-pointer"
            >
              <div className="text-[11px] font-bold text-emerald-900 dark:text-emerald-300">
                Admin Panel
              </div>
              <div className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 truncate">
                admin / admin
              </div>
            </button>

            <button
              type="button"
              onClick={() => quickLogin('user', 'user')}
              className="text-left px-2.5 py-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30 hover:bg-amber-50 cursor-pointer"
            >
              <div className="text-[11px] font-bold text-amber-900 dark:text-amber-300">
                User (0 Cr)
              </div>
              <div className="text-[10px] font-mono text-amber-700 dark:text-amber-400 truncate">
                user / user
              </div>
            </button>

            <button
              type="button"
              onClick={() => quickLogin('tanvir@qaaga.ai', 'User@12345')}
              className="text-left px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              <div className="text-[11px] font-bold text-slate-900 dark:text-white">
                Active (80 Cr)
              </div>
              <div className="text-[10px] font-mono text-slate-500 truncate">
                tanvir@qaaga.ai
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RechargeGateModal({
  open,
  reasonMessage,
  user,
  credits,
  packages,
  onClose,
  onProceedToRecharge,
}: {
  open: boolean;
  reasonMessage: string | null;
  user: AuthUser;
  credits: CreditSummary;
  packages: RechargePackageDTO[];
  onClose: () => void;
  onProceedToRecharge: (pkgBdt: number, method: PaymentMethodType) => void;
}) {
  const activePackages = packages.filter((p) => p.active);
  const [selectedBdt, setSelectedBdt] = useState<number>(
    activePackages[1]?.amountBdt || activePackages[0]?.amountBdt || 50
  );
  const [method, setMethod] = useState<PaymentMethodType>('bKash');

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-[2px]">
      <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-heading font-extrabold text-lg text-slate-900 dark:text-white">
                Recharge Required to Run Command
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Signed in as <strong>{user.fullName}</strong> · Balance:{' '}
                <strong className="font-mono text-emerald-600">
                  {credits.remaining} cr
                </strong>{' '}
                ·{' '}
                {user.isSubscriptionActive
                  ? `${user.daysRemaining}d active`
                  : 'No active 30-day plan'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
            aria-label="Close recharge prompt"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3.5 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
          {reasonMessage ||
            'Please recharge a 20, 50, 100, or 200 BDT package via bKash, Nagad, or Rocket to activate your 30-day subscription and unlock all QAAGA AGENT AI commands.'}
        </div>

        {/* Select Plan */}
        <div className="space-y-2">
          <p className="text-xs font-heading font-bold text-slate-800 dark:text-slate-200">
            1. Choose 30-Day Recharge Package
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {activePackages.map((pkg) => {
              const active = pkg.amountBdt === selectedBdt;
              return (
                <button
                  key={pkg.id}
                  type="button"
                  onClick={() => setSelectedBdt(pkg.amountBdt)}
                  className={`p-3 rounded-xl border text-center transition-colors cursor-pointer ${
                    active
                      ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  }`}
                >
                  <div className="font-heading font-extrabold text-lg font-mono text-slate-900 dark:text-white">
                    {pkg.amountBdt}
                  </div>
                  <div className="text-[11px] font-semibold text-slate-500">
                    BDT
                  </div>
                  <div className="text-[11px] font-mono font-bold text-emerald-600 mt-1">
                    +{pkg.credits} cr
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Select Payment Method */}
        <div className="space-y-2">
          <p className="text-xs font-heading font-bold text-slate-800 dark:text-slate-200">
            2. Select MFS Payment Method
          </p>
          <div className="grid grid-cols-3 gap-2.5">
            {(['bKash', 'Nagad', 'Rocket'] as const).map((m) => {
              const active = method === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
                    active
                      ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
          >
            Later
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onProceedToRecharge(selectedBdt, method);
            }}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer"
          >
            <CreditCard className="w-4 h-4" />
            <span>Recharge {selectedBdt} BDT Now</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
