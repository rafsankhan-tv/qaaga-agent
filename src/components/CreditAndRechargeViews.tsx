import React, { useState } from 'react';
import {
  Calendar,
  Copy,
  Check,
  UploadCloud,
  Eye,
  X,
  ArrowRight,
  Loader2,
  CheckCircle2,
  MessageSquare,
  Image as ImageIcon,
  FileText,
  Globe,
  Mic,
} from 'lucide-react';
import type {
  NavSection,
  PaymentMethodType,
  WorkspacePayload,
} from '../types/qaaga';
import { BkashIcon, NagadIcon, RocketIcon } from './BrandIcons';

/* ============================================================================
 * 1. USER CREDIT DASHBOARD & APPEND-ONLY LEDGER
 * ========================================================================== */
export function UserCreditDashboard({
  workspace,
  onNavigate,
}: {
  workspace: WorkspacePayload;
  onNavigate: (nav: NavSection) => void;
}) {
  const { user, credits, ledger } = workspace;

  const totalSpentSum =
    credits.byFeature.chat +
      credits.byFeature.image +
      credits.byFeature.pdf +
      credits.byFeature.search +
      credits.byFeature.voice || 1;

  const featureRows = [
    {
      label: 'AI Chat & Code',
      val: credits.byFeature.chat,
      pct: Math.round((credits.byFeature.chat / totalSpentSum) * 100),
      Icon: MessageSquare,
      bar: 'bg-emerald-600',
    },
    {
      label: 'Images (Gen & Vision)',
      val: credits.byFeature.image,
      pct: Math.round((credits.byFeature.image / totalSpentSum) * 100),
      Icon: ImageIcon,
      bar: 'bg-violet-500',
    },
    {
      label: 'Documents & PDF',
      val: credits.byFeature.pdf,
      pct: Math.round((credits.byFeature.pdf / totalSpentSum) * 100),
      Icon: FileText,
      bar: 'bg-rose-500',
    },
    {
      label: 'Web Search',
      val: credits.byFeature.search,
      pct: Math.round((credits.byFeature.search / totalSpentSum) * 100),
      Icon: Globe,
      bar: 'bg-sky-500',
    },
    {
      label: 'Voice (STT & TTS)',
      val: credits.byFeature.voice,
      pct: Math.round((credits.byFeature.voice / totalSpentSum) * 100),
      Icon: Mic,
      bar: 'bg-amber-500',
    },
  ];

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6 overflow-y-auto h-full">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white tracking-tight">
            Internal Credit & Subscription Dashboard
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Platform-defined internal credits with atomic reservation, carry-forward balance, and 30-day validity.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('recharge')}
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
        >
          <span>Recharge & Extend 30 Days</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
          <p className="text-xs text-slate-500">Total Granted Credits</p>
          <p className="text-2xl font-mono font-extrabold tabular-nums text-slate-900 dark:text-white mt-1">
            {credits.totalGranted}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            Lifetime approved recharges
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
          <p className="text-xs text-slate-500">Used Internal Credits</p>
          <p className="text-2xl font-mono font-extrabold tabular-nums text-amber-600 mt-1">
            {credits.totalUsed}
          </p>
          <p className="text-[11px] text-slate-400 mt-1 tabular-nums">
            Today: {credits.usedToday} / {credits.dailyLimit} daily cap
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
          <p className="text-xs text-slate-500">Remaining Credits</p>
          <p className="text-2xl font-mono font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
            {credits.remaining}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            Carries forward on renewal
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
          <p className="text-xs text-slate-500">30-Day Subscription</p>
          <p
            className={`text-xl font-heading font-extrabold mt-1 ${
              user.isSubscriptionActive ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            {user.isSubscriptionActive
              ? `${user.daysRemaining} Days Left`
              : 'Expired'}
          </p>
          <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            <span>
              {user.subscriptionExpiresAt
                ? `Until ${new Date(user.subscriptionExpiresAt).toLocaleDateString()}`
                : 'Awaiting first recharge'}
            </span>
          </p>
        </div>
      </div>

      {/* Breakdown by Feature */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
        <h2 className="text-sm font-heading font-bold text-slate-900 dark:text-white">
          Credits Spent by AI Modality
        </h2>
        <div className="space-y-3">
          {featureRows.map(({ label, val, pct, Icon, bar }) => (
            <div
              key={label}
              className="grid grid-cols-[160px_1fr_90px] sm:grid-cols-[200px_1fr_110px] items-center gap-3 text-xs"
            >
              <span className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium truncate">
                <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="truncate">{label}</span>
              </span>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className={`h-full rounded-full ${bar}`}
                  style={{ width: `${Math.max(4, pct)}%` }}
                />
              </div>
              <span className="font-mono tabular-nums text-right text-slate-600 dark:text-slate-300">
                {val} cr · {pct}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Append-Only Ledger Table */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-heading font-bold text-slate-900 dark:text-white">
            Append-Only Credit Ledger (Actual Calculated Cost)
          </h2>
          <span className="text-xs text-slate-400 tabular-nums">
            Last {ledger.length} entries
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-slate-500">
                <th className="py-2.5 px-4 font-semibold">Timestamp</th>
                <th className="py-2.5 px-4 font-semibold">Type</th>
                <th className="py-2.5 px-4 font-semibold">Feature</th>
                <th className="py-2.5 px-4 font-semibold">Description</th>
                <th className="py-2.5 px-4 font-semibold text-right">Delta</th>
                <th className="py-2.5 px-4 font-semibold text-right">
                  Balance After
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {ledger.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                >
                  <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap font-mono">
                    {new Date(row.createdAt).toLocaleString()}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                    {row.entryType}
                  </td>
                  <td className="py-2.5 px-4 capitalize text-slate-600 dark:text-slate-300">
                    {row.feature}
                  </td>
                  <td className="py-2.5 px-4 text-slate-800 dark:text-slate-200 max-w-xs truncate">
                    {row.description}
                  </td>
                  <td
                    className={`py-2.5 px-4 font-mono font-bold tabular-nums text-right whitespace-nowrap ${
                      row.deltaCredits >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    {row.deltaCredits > 0
                      ? `+${row.deltaCredits}`
                      : row.deltaCredits}{' '}
                    cr
                  </td>
                  <td className="py-2.5 px-4 font-mono tabular-nums font-semibold text-right text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {row.balanceAfter} cr
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * 2. MANUAL BDT RECHARGE SUBMISSION (bKash / Nagad / Rocket + Screenshot)
 * ========================================================================== */
export function RechargeSubmissionView({
  workspace,
  initialPackageBdt,
  initialMethod,
  onSubmitPayment,
  onFetchScreenshot,
}: {
  workspace: WorkspacePayload;
  initialPackageBdt?: number;
  initialMethod?: PaymentMethodType;
  onSubmitPayment: (payload: {
    packageId: number;
    paymentMethod: PaymentMethodType;
    senderNumber: string;
    transactionId: string;
    amountBdt: number;
    screenshotData: string;
    screenshotMime: string;
  }) => Promise<void>;
  onFetchScreenshot: (paymentId: number) => Promise<string>;
}) {
  const activePackages = workspace.packages.filter((p) => p.active);
  const matchedInitialPkg = activePackages.find(
    (p) => p.amountBdt === initialPackageBdt
  );
  const [selectedPkgId, setSelectedPkgId] = useState<number>(
    matchedInitialPkg?.id ||
      activePackages[1]?.id ||
      activePackages[0]?.id ||
      1
  );
  const [method, setMethod] = useState<PaymentMethodType>(
    initialMethod || 'bKash'
  );
  const [senderNumber, setSenderNumber] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [screenshotData, setScreenshotData] = useState('');
  const [screenshotMime, setScreenshotMime] = useState('image/png');
  const [screenshotName, setScreenshotName] = useState('');

  const [copiedNum, setCopiedNum] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [previewModalUrl, setPreviewModalUrl] = useState<string | null>(null);

  const selectedPkg =
    activePackages.find((p) => p.id === selectedPkgId) || activePackages[0];
  const receiverNumber = workspace.config.receiverNumbers[method];

  const generateDemoScreenshot = () => {
    const trx =
      transactionId.trim().toUpperCase() ||
      `${method.slice(0, 3).toUpperCase()}${Math.random()
        .toString(36)
        .substring(2, 9)
        .toUpperCase()}`;
    if (!transactionId.trim()) setTransactionId(trx);
    if (!senderNumber.trim()) setSenderNumber('01715-992811');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="480" viewBox="0 0 420 480">
  <rect width="420" height="480" rx="18" fill="#F8FAFC"/>
  <rect x="20" y="20" width="380" height="440" rx="14" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="2"/>
  <rect x="20" y="20" width="380" height="68" rx="14" fill="#059669"/>
  <text x="210" y="61" fill="#FFFFFF" font-family="sans-serif" font-size="20" font-weight="bold" text-anchor="middle">${method} Payment Receipt</text>
  <text x="48" y="135" fill="#64748B" font-family="sans-serif" font-size="13">Receiver Account</text>
  <text x="48" y="158" fill="#0F172A" font-family="monospace" font-size="15" font-weight="bold">${receiverNumber}</text>
  <text x="48" y="205" fill="#64748B" font-family="sans-serif" font-size="13">Sender Number</text>
  <text x="48" y="228" fill="#0F172A" font-family="monospace" font-size="15" font-weight="bold">${senderNumber || '01715-992811'}</text>
  <text x="48" y="275" fill="#64748B" font-family="sans-serif" font-size="13">Transaction ID</text>
  <text x="48" y="298" fill="#059669" font-family="monospace" font-size="18" font-weight="bold">${trx}</text>
  <text x="48" y="345" fill="#64748B" font-family="sans-serif" font-size="13">Amount Sent</text>
  <text x="48" y="374" fill="#0F172A" font-family="monospace" font-size="24" font-weight="bold">${selectedPkg?.amountBdt || 50} BDT</text>
</svg>`;
    const dataUrl = `data:image/svg+xml;base64,${btoa(svg)}`;
    setScreenshotData(dataUrl);
    setScreenshotMime('image/svg+xml');
    setScreenshotName(`${trx}_receipt.svg`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPkg) return;
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);
    try {
      await onSubmitPayment({
        packageId: selectedPkg.id,
        paymentMethod: method,
        senderNumber,
        transactionId,
        amountBdt: selectedPkg.amountBdt,
        screenshotData,
        screenshotMime,
      });
      setSuccessMsg(
        `Submitted ${selectedPkg.amountBdt} BDT (${method}) payment for manual verification! Once approved, +${selectedPkg.credits} credits will be added to your carry-forward balance with 30 days validity.`
      );
      setTransactionId('');
      setScreenshotData('');
      setScreenshotName('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6 overflow-y-auto h-full">
      <div>
        <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white tracking-tight">
          Prepaid BDT Recharge & 30-Day Renewal
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Every approved recharge resets validity to 30 days from approval and carries forward your remaining {workspace.credits.remaining} credits.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-6 items-start">
        {/* Left: Package & Submission Form */}
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-5"
        >
          {/* Step 1: 20, 50, 100, 200 BDT Packages */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-2">
              1. Select Recharge Package
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {activePackages.map((pkg) => {
                const active = pkg.id === selectedPkg?.id;
                return (
                  <button
                    key={pkg.id}
                    type="button"
                    onClick={() => setSelectedPkgId(pkg.id)}
                    className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                      active
                        ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/40'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                    }`}
                  >
                    <div className="text-lg font-mono font-extrabold tabular-nums text-slate-900 dark:text-white">
                      {pkg.amountBdt} BDT
                    </div>
                    <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
                      +{pkg.credits} Credits
                    </div>
                    <div className="text-[10.5px] text-slate-400 mt-0.5">
                      {pkg.validityDays} Days Validity
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Payment Method & Admin Receiver Number */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-2">
              2. Choose MFS Gateway & Send Money to Receiver Number
            </label>
            <div className="grid grid-cols-3 gap-2.5 mb-3">
              {(['bKash', 'Nagad', 'Rocket'] as PaymentMethodType[]).map((gw) => {
                const active = method === gw;
                return (
                  <button
                    key={gw}
                    type="button"
                    onClick={() => setMethod(gw)}
                    className={`p-2.5 rounded-xl border flex items-center justify-center gap-2 cursor-pointer ${
                      active
                        ? 'border-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/30 font-bold'
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    {gw === 'bKash' && <BkashIcon className="w-5 h-5" />}
                    {gw === 'Nagad' && <NagadIcon className="w-5 h-5" />}
                    {gw === 'Rocket' && <RocketIcon className="w-5 h-5" />}
                    <span className="text-xs text-slate-900 dark:text-white">
                      {gw}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 p-3.5 flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] text-slate-500">
                  Official {method} Receiver Number (Send {selectedPkg?.amountBdt} BDT here)
                </p>
                <p className="text-sm font-mono font-bold text-slate-900 dark:text-white mt-0.5">
                  {receiverNumber}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(receiverNumber);
                  setCopiedNum(true);
                  setTimeout(() => setCopiedNum(false), 1600);
                }}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1 cursor-pointer"
              >
                {copiedNum ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedNum ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Step 3: Sender Number, TrxID & Screenshot */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Your Sender Wallet Number
              </label>
              <input
                type="tel"
                required
                value={senderNumber}
                onChange={(e) => setSenderNumber(e.target.value)}
                placeholder="017XXXXXXXX"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:border-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Transaction ID (TrxID)
              </label>
              <input
                type="text"
                required
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                placeholder="e.g. BKS94K20LP"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-mono uppercase text-slate-900 dark:text-white focus:outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Upload Payment Screenshot (Private Verification)
              </label>
              <button
                type="button"
                onClick={generateDemoScreenshot}
                className="text-[11px] font-semibold text-emerald-600 hover:underline cursor-pointer"
              >
                Auto-fill Sample Receipt for Testing
              </button>
            </div>

            <label className="w-full rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-emerald-500 p-4 flex items-center justify-center gap-3 cursor-pointer">
              <UploadCloud className="w-5 h-5 text-emerald-600 shrink-0" />
              <span className="text-xs text-slate-600 dark:text-slate-300 truncate">
                {screenshotName || 'Click to upload PNG / JPG payment screenshot'}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const r = new FileReader();
                  r.onload = () => {
                    setScreenshotData(String(r.result));
                    setScreenshotMime(f.type || 'image/png');
                    setScreenshotName(f.name);
                  };
                  r.readAsDataURL(f);
                }}
              />
            </label>
          </div>

          {error && (
            <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-3.5 py-2.5 text-xs text-emerald-800 dark:text-emerald-200 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span>
                  Submit {selectedPkg?.amountBdt} BDT Request (+{selectedPkg?.credits} Credits)
                </span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Right: User's Recharge Verification History */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <h2 className="text-sm font-heading font-bold text-slate-900 dark:text-white">
            Your Payment Verification History
          </h2>

          {workspace.payments.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">
              No recharge requests submitted yet.
            </p>
          ) : (
            <div className="space-y-3">
              {workspace.payments.map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-sm tabular-nums text-slate-900 dark:text-white">
                      {p.amountBdt} BDT · {p.paymentMethod}
                    </span>
                    <span
                      className={`font-semibold ${
                        p.status === 'APPROVED'
                          ? 'text-emerald-600'
                          : p.status === 'REJECTED'
                          ? 'text-rose-600'
                          : 'text-amber-600'
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>

                  <div className="text-slate-500 flex items-center justify-between">
                    <span className="font-mono">TrxID: {p.transactionId}</span>
                    <span className="font-mono text-emerald-600 font-semibold">
                      +{p.creditsToGrant} cr
                    </span>
                  </div>

                  {p.adminNote && (
                    <p className="text-[11px] text-slate-500 italic">
                      Admin Note: {p.adminNote}
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400">
                    <span>{new Date(p.createdAt).toLocaleDateString()}</span>
                    {p.hasScreenshot && (
                      <button
                        type="button"
                        onClick={async () => {
                          const url = await onFetchScreenshot(p.id);
                          setPreviewModalUrl(url);
                        }}
                        className="inline-flex items-center gap-1 text-emerald-600 hover:underline font-medium cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View Screenshot</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Private Screenshot Modal */}
      {previewModalUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 max-w-md w-full p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-heading font-bold text-slate-900 dark:text-white">
                Private Payment Receipt
              </span>
              <button
                type="button"
                onClick={() => setPreviewModalUrl(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <img
              src={previewModalUrl}
              alt="Payment Screenshot"
              referrerPolicy="no-referrer"
              className="w-full max-h-[460px] object-contain rounded-xl border border-slate-200 dark:border-slate-800"
            />
          </div>
        </div>
      )}
    </div>
  );
}
