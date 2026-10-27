import React, { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Check,
  X,
  Eye,
  Download,
  AlertTriangle,
  Save,
  RefreshCw,
  Users,
  UserCheck,
  Clock,
  CreditCard,
  Database,
  Cpu,
  MessageSquare,
  Image as ImageIcon,
  FileText,
  Globe,
  Mic,
  Search,
  Plus,
  Pencil,
  Megaphone,
  Palette,
  Upload,
  RotateCcw,
  Copy,
  ChevronDown,
  Send,
  CheckCircle2,
} from 'lucide-react';
import type {
  AdminDashboardDTO,
  NavSection,
  PlatformConfigDTO,
  ProviderCapabilitiesDTO,
  ProviderDiagnosticsDTO,
  RechargePackageDTO,
} from '../types/qaaga';
import {
  DefaultQaagaLogoSvg,
  QaagaLogo,
  UserAvatarBadge,
} from './BrandIcons';

function downloadCsv(filename: string, csvText: string) {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function AdminConsoleViews({
  section,
  onSelectSection,
  globalSearch,
  dashboard,
  packages,
  config,
  capabilities,
  onRefresh,
  onManageUser,
  onReviewPayment,
  onFetchScreenshot,
  onCreatePackage,
  onUpdatePackage,
  onBroadcastAnnouncement,
  onSaveConfig,
  onTestOpenAI,
  onTestProviders,
}: {
  section: NavSection;
  onSelectSection: (s: NavSection) => void;
  globalSearch: string;
  dashboard: AdminDashboardDTO | null;
  packages: RechargePackageDTO[];
  config: PlatformConfigDTO;
  capabilities: ProviderCapabilitiesDTO;
  onRefresh: () => Promise<void>;
  onManageUser: (
    userId: number,
    payload: {
      status?: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
      role?: 'user' | 'admin';
      dailyCreditLimit?: number;
      bonusCredits?: number;
      activate30Days?: boolean;
    }
  ) => Promise<void>;
  onReviewPayment: (
    paymentId: number,
    decision: 'APPROVED' | 'REJECTED',
    adminNote?: string
  ) => Promise<void>;
  onFetchScreenshot: (paymentId: number) => Promise<{
    screenshotDataUrl: string;
    transactionId: string;
    senderNumber: string;
    amountBdt: number;
  }>;
  onCreatePackage: (payload: {
    name: string;
    amountBdt: number;
    credits: number;
    validityDays: number;
  }) => Promise<void>;
  onUpdatePackage: (
    pkgId: number,
    patch: {
      name?: string;
      amountBdt?: number;
      credits?: number;
      validityDays?: number;
      active?: boolean;
    }
  ) => Promise<void>;
  onBroadcastAnnouncement: (title: string, detail: string) => Promise<void>;
  onSaveConfig: (next: PlatformConfigDTO) => Promise<void>;
  onTestOpenAI?: () => Promise<{
    ok: boolean;
    keyPresent: boolean;
    status: number | null;
    errorCode: string | null;
    message: string;
    latencyMs: number;
    availableTargetModels: string[];
  }>;
  onTestProviders?: () => Promise<ProviderDiagnosticsDTO>;
}) {
  const [exportOpen, setExportOpen] = useState(false);
  const [chartMetric, setChartMetric] = useState<'credits' | 'usdCost' | 'requests'>('credits');
  const [userSearch, setUserSearch] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState<'ALL' | 'ACTIVE' | 'PENDING' | 'EXPIRED' | 'SUSPENDED'>('ALL');
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [adminNotes, setAdminNotes] = useState<Record<number, string>>({});

  // Screenshot Modal
  const [screenshotModal, setScreenshotModal] = useState<{
    screenshotDataUrl: string;
    transactionId: string;
    senderNumber: string;
    amountBdt: number;
  } | null>(null);

  // Add / Edit Plan Modal
  const [planModal, setPlanModal] = useState<{
    mode: 'create' | 'edit';
    id?: number;
    name: string;
    amountBdt: number;
    credits: number;
    validityDays: number;
  } | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planBusy, setPlanBusy] = useState(false);

  // Config & User Edits
  const [draftConfig, setDraftConfig] = useState<PlatformConfigDTO>(config);
  const [userLimits, setUserLimits] = useState<Record<number, number>>({});
  const [userBonus, setUserBonus] = useState<Record<number, number>>({});
  const [configSaved, setConfigSaved] = useState(false);
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [brandingSaved, setBrandingSaved] = useState(false);
  const [brandingError, setBrandingError] = useState<string | null>(null);

  // Announcement Composer
  const [annTitle, setAnnTitle] = useState('');
  const [annDetail, setAnnDetail] = useState('');
  const [annSent, setAnnSent] = useState(false);

  // Audit / Log Search
  const [logSearch, setLogSearch] = useState('');
  const [testingOpenAI, setTestingOpenAI] = useState(false);
  const [openAITestResult, setOpenAITestResult] = useState<{
    ok: boolean;
    keyPresent: boolean;
    status: number | null;
    errorCode: string | null;
    message: string;
    latencyMs: number;
    availableTargetModels: string[];
  } | null>(null);
  const [providerDiagResult, setProviderDiagResult] =
    useState<ProviderDiagnosticsDTO | null>(null);

  useEffect(() => {
    setDraftConfig(config);
  }, [config]);

  if (!dashboard) {
    return (
      <div className="p-10 text-center text-sm text-slate-500">
        Loading Admin Dashboard...
      </div>
    );
  }

  const { kpis, creditPool } = dashboard;
  const effectiveSearch = (globalSearch || userSearch).trim().toLowerCase();

  const exportUsersCsv = () => {
    const header =
      'ID,Full Name,Email,Role,Status,Expired,Assigned Credits,Used Credits,Remaining Credits,Daily Limit,Used Today,OpenAI USD,Gemini USD,Total API USD,Chat,Image,PDF,Search,Voice\n';
    const rows = dashboard.users
      .map(
        (u) =>
          `${u.id},"${u.fullName}",${u.email},${u.role},${u.status},${u.isExpired},${u.creditsAssigned},${u.creditsUsed},${u.creditsRemaining},${u.dailyCreditLimit},${u.usedTodayCredits},${(u.openaiUsdCost ?? 0).toFixed(6)},${(u.geminiUsdCost ?? 0).toFixed(6)},${(u.totalUsdCost ?? 0).toFixed(6)},${u.chatCredits},${u.imageCredits},${u.pdfCredits},${u.searchCredits},${u.voiceCredits}`
      )
      .join('\n');
    downloadCsv('qaaga-users-report.csv', header + rows);
  };

  const exportPaymentsCsv = () => {
    const header =
      'ID,User Name,User Email,Method,Sender,TrxID,Amount BDT,Credits,Status,Created At\n';
    const rows = dashboard.payments
      .map(
        (p) =>
          `${p.id},"${p.userName}",${p.userEmail},${p.paymentMethod},${p.senderNumber},${p.transactionId},${p.amountBdt},${p.creditsToGrant},${p.status},${p.createdAt}`
      )
      .join('\n');
    downloadCsv('qaaga-payments-bdt.csv', header + rows);
  };

  const exportModelsCsv = () => {
    const header =
      'Model,Provider,Requests,Total Tokens,Provider Cost USD,Internal Credits Charged\n';
    const rows = dashboard.modelBreakdown
      .map(
        (m) =>
          `${m.model},${m.provider},${m.requests},${m.totalTokens},${m.usdCost.toFixed(6)},${m.creditsCharged}`
      )
      .join('\n');
    downloadCsv('qaaga-api-usage.csv', header + rows);
  };

  const openScreenshot = async (paymentId: number) => {
    const data = await onFetchScreenshot(paymentId);
    setScreenshotModal(data);
  };

  const handleBrandFileUpload = (
    target: 'logoDataUrl' | 'faviconDataUrl',
    file: File | undefined
  ) => {
    if (!file) return;
    setBrandingError(null);
    const maxBytes = 2 * 1024 * 1024;
    if (file.size > maxBytes) {
      setBrandingError(
        `${target === 'logoDataUrl' ? 'Logo Icon' : 'Favicon'} file is too large (${(
          file.size /
          (1024 * 1024)
        ).toFixed(2)} MB). Maximum allowed size is 2.00 MB.`
      );
      return;
    }
    const allowedMime = [
      'image/png',
      'image/svg+xml',
      'image/webp',
      'image/jpeg',
      'image/jpg',
      'image/gif',
      'image/x-icon',
      'image/vnd.microsoft.icon',
    ];
    const isIcoExt = file.name.toLowerCase().endsWith('.ico');
    if (!allowedMime.includes(file.type) && !isIcoExt) {
      setBrandingError(
        'Unsupported image format. Please upload PNG, SVG, WEBP, JPG, GIF, or ICO.'
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      let result = String(reader.result || '');
      if (isIcoExt && result.startsWith('data:application/octet-stream;base64,')) {
        result = result.replace(
          'data:application/octet-stream;base64,',
          'data:image/x-icon;base64,'
        );
      }
      setDraftConfig((prev) => ({
        ...prev,
        branding: {
          logoDataUrl: prev.branding?.logoDataUrl ?? null,
          faviconDataUrl: prev.branding?.faviconDataUrl ?? null,
          [target]: result,
        },
      }));
    };
    reader.onerror = () => {
      setBrandingError('Failed to read selected image file.');
    };
    reader.readAsDataURL(file);
  };

  const handleSaveBrandingNow = async () => {
    setBrandingError(null);
    setBrandingSaving(true);
    try {
      await onSaveConfig(draftConfig);
      setBrandingSaved(true);
      setTimeout(() => setBrandingSaved(false), 2600);
    } catch (err: unknown) {
      setBrandingError(
        err instanceof Error ? err.message : 'Failed to save branding assets.'
      );
    } finally {
      setBrandingSaving(false);
    }
  };

  const renderBrandingManagerCard = () => {
    const draftLogo = draftConfig.branding?.logoDataUrl || null;
    const draftFavicon = draftConfig.branding?.faviconDataUrl || null;
    const effectiveFaviconPreview = draftFavicon || draftLogo;

    return (
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-sm font-heading font-bold text-slate-900 dark:text-white">
                Platform Brand Identity — Logo Icon & Favicon
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Upload your custom Logo Icon and Browser Tab Favicon (PNG, SVG, WEBP, JPG, or ICO up to 2 MB, or paste a direct HTTPS image URL). Changes apply live across the Front Page, User Sidebar, Chat Avatar, Login Modals, Admin Portal, and Browser Tab.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {brandingSaved && (
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                <span>Logo & Favicon Applied Live!</span>
              </span>
            )}
            <button
              type="button"
              disabled={brandingSaving}
              onClick={handleSaveBrandingNow}
              className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{brandingSaving ? 'Saving...' : 'Save Logo & Favicon'}</span>
            </button>
          </div>
        </div>

        {brandingError && (
          <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{brandingError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* 1. LOGO ICON CONFIGURATOR */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-4 bg-slate-50/50 dark:bg-slate-950/30">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-heading font-bold text-slate-900 dark:text-white">
                  1. Website Logo Icon
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Displayed in headers, dark navy sidebar, chat assistant avatar & auth dialogs.
                </p>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[10.5px] font-mono font-semibold ${
                  draftLogo
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                    : 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                {draftLogo ? 'Custom Active' : 'Default SVG'}
              </span>
            </div>

            {/* Dual Light & Dark Surface Live Lockup Preview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="rounded-xl bg-white border border-slate-200 p-3 flex items-center gap-2.5">
                <QaagaLogo className="w-9 h-9" overrideSrc={draftLogo} />
                <div className="min-w-0">
                  <p className="font-heading font-extrabold text-xs text-slate-900 truncate">
                    QAAGA AGENT
                  </p>
                  <p className="text-[10px] text-slate-400">Light Header</p>
                </div>
              </div>

              <div className="rounded-xl bg-[#0D1425] border border-slate-800 p-3 flex items-center gap-2.5">
                <QaagaLogo className="w-9 h-9" overrideSrc={draftLogo} />
                <div className="min-w-0">
                  <p className="font-heading font-extrabold text-xs text-white truncate">
                    QAAGA AGENT
                  </p>
                  <p className="text-[10px] text-slate-400">Dark Sidebar</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-emerald-700 hover:opacity-90 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Logo Icon</span>
                <input
                  type="file"
                  accept="image/png,image/svg+xml,image/webp,image/jpeg,image/gif,image/x-icon,.ico"
                  className="hidden"
                  onChange={(e) => {
                    handleBrandFileUpload('logoDataUrl', e.target.files?.[0]);
                    e.currentTarget.value = '';
                  }}
                />
              </label>

              {draftLogo && (
                <button
                  type="button"
                  onClick={() =>
                    setDraftConfig((prev) => ({
                      ...prev,
                      branding: {
                        logoDataUrl: null,
                        faviconDataUrl: prev.branding?.faviconDataUrl ?? null,
                      },
                    }))
                  }
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Default</span>
                </button>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                Or Paste Direct Logo Image URL (HTTPS)
              </label>
              <input
                type="url"
                value={
                  draftLogo && /^https?:\/\//i.test(draftLogo) ? draftLogo : ''
                }
                onChange={(e) => {
                  const val = e.target.value.trim();
                  setDraftConfig((prev) => ({
                    ...prev,
                    branding: {
                      logoDataUrl: val || null,
                      faviconDataUrl: prev.branding?.faviconDataUrl ?? null,
                    },
                  }));
                }}
                placeholder="https://example.com/logo.png"
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-xs"
              />
            </div>
          </div>

          {/* 2. FAVICON CONFIGURATOR */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-4 bg-slate-50/50 dark:bg-slate-950/30">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-heading font-bold text-slate-900 dark:text-white">
                  2. Browser Tab Favicon
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Shown in browser tabs, bookmarks & mobile home-screen shortcuts (32×32 / SVG / ICO).
                </p>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[10.5px] font-mono font-semibold ${
                  draftFavicon
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                    : draftLogo
                    ? 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300'
                    : 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                {draftFavicon
                  ? 'Custom Favicon'
                  : draftLogo
                  ? 'Inheriting Logo'
                  : 'Default Icon'}
              </span>
            </div>

            {/* Realistic Browser Tab Chrome Mockup */}
            <div className="rounded-xl bg-slate-200/80 dark:bg-slate-800 p-2.5 border border-slate-300/70 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 px-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-t-lg rounded-b-md bg-white dark:bg-slate-900 shadow-2xs max-w-[250px] border border-slate-200/80 dark:border-slate-700">
                  {effectiveFaviconPreview ? (
                    <img
                      src={effectiveFaviconPreview}
                      alt="Favicon Preview"
                      className="w-4 h-4 object-contain rounded-xs shrink-0"
                    />
                  ) : (
                    <DefaultQaagaLogoSvg className="w-4 h-4 shrink-0" />
                  )}
                  <span className="text-[11px] font-medium text-slate-800 dark:text-slate-200 truncate">
                    QAAGA AGENT — Next-Gen AI
                  </span>
                  <X className="w-3 h-3 text-slate-400 shrink-0 ml-1" />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-emerald-700 hover:opacity-90 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Favicon</span>
                <input
                  type="file"
                  accept="image/png,image/svg+xml,image/webp,image/x-icon,image/vnd.microsoft.icon,.ico"
                  className="hidden"
                  onChange={(e) => {
                    handleBrandFileUpload(
                      'faviconDataUrl',
                      e.target.files?.[0]
                    );
                    e.currentTarget.value = '';
                  }}
                />
              </label>

              {draftLogo && draftFavicon !== draftLogo && (
                <button
                  type="button"
                  onClick={() =>
                    setDraftConfig((prev) => ({
                      ...prev,
                      branding: {
                        logoDataUrl: prev.branding?.logoDataUrl ?? null,
                        faviconDataUrl: prev.branding?.logoDataUrl ?? null,
                      },
                    }))
                  }
                  className="px-3 py-2 rounded-xl border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Use Logo as Favicon</span>
                </button>
              )}

              {draftFavicon && (
                <button
                  type="button"
                  onClick={() =>
                    setDraftConfig((prev) => ({
                      ...prev,
                      branding: {
                        logoDataUrl: prev.branding?.logoDataUrl ?? null,
                        faviconDataUrl: null,
                      },
                    }))
                  }
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Default</span>
                </button>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                Or Paste Direct Favicon URL (HTTPS)
              </label>
              <input
                type="url"
                value={
                  draftFavicon && /^https?:\/\//i.test(draftFavicon)
                    ? draftFavicon
                    : ''
                }
                onChange={(e) => {
                  const val = e.target.value.trim();
                  setDraftConfig((prev) => ({
                    ...prev,
                    branding: {
                      logoDataUrl: prev.branding?.logoDataUrl ?? null,
                      faviconDataUrl: val || null,
                    },
                  }));
                }}
                placeholder="https://example.com/favicon.ico"
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-xs"
              />
            </div>
          </div>
        </div>
      </div>
    );
  };

  const handleSavePlanModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planModal) return;
    setPlanError(null);
    setPlanBusy(true);
    try {
      if (planModal.mode === 'create') {
        await onCreatePackage({
          name: planModal.name,
          amountBdt: Number(planModal.amountBdt),
          credits: Number(planModal.credits),
          validityDays: Number(planModal.validityDays) || 30,
        });
      } else if (planModal.id) {
        await onUpdatePackage(planModal.id, {
          name: planModal.name,
          amountBdt: Number(planModal.amountBdt),
          credits: Number(planModal.credits),
          validityDays: Number(planModal.validityDays) || 30,
        });
      }
      setPlanModal(null);
    } catch (err: unknown) {
      setPlanError(err instanceof Error ? err.message : 'Failed to save plan.');
    } finally {
      setPlanBusy(false);
    }
  };

  // Shared Modals (Screenshot Preview + Plan Add/Edit)
  const renderModals = () => (
    <>
      {screenshotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 max-w-md w-full p-5 space-y-3 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-heading font-bold text-slate-900 dark:text-white">
                  Receipt Screenshot · {screenshotModal.amountBdt} BDT
                </h3>
                <p className="text-[11px] font-mono text-slate-500">
                  Sender {screenshotModal.senderNumber} · TrxID{' '}
                  {screenshotModal.transactionId}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setScreenshotModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <img
              src={screenshotModal.screenshotDataUrl}
              alt="Payment Screenshot"
              referrerPolicy="no-referrer"
              className="w-full max-h-[460px] object-contain rounded-xl border border-slate-200 dark:border-slate-800"
            />
          </div>
        </div>
      )}

      {planModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65">
          <form
            onSubmit={handleSavePlanModal}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 max-w-md w-full p-5 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-heading font-bold text-slate-900 dark:text-white">
                {planModal.mode === 'create'
                  ? 'Add Recharge Plan'
                  : 'Edit Recharge Plan'}
              </h3>
              <button
                type="button"
                onClick={() => setPlanModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Plan Name
                </label>
                <input
                  type="text"
                  required
                  value={planModal.name}
                  onChange={(e) =>
                    setPlanModal({ ...planModal, name: e.target.value })
                  }
                  placeholder="e.g. Enterprise 500 BDT Plan"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Price (BDT)
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={planModal.amountBdt}
                    onChange={(e) =>
                      setPlanModal({
                        ...planModal,
                        amountBdt: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Credits
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={planModal.credits}
                    onChange={(e) =>
                      setPlanModal({
                        ...planModal,
                        credits: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Validity (Days)
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={planModal.validityDays}
                    onChange={(e) =>
                      setPlanModal({
                        ...planModal,
                        validityDays: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-sm text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            </div>

            {planError && (
              <p className="text-xs text-rose-600 font-medium">{planError}</p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPlanModal(null)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={planBusy}
                className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold cursor-pointer"
              >
                {planBusy ? 'Saving...' : 'Save Plan'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );

  // Derived data for Dashboard Overview
  const openaiRemainingPct =
    kpis.openaiPurchasedUsd > 0
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round(
              (kpis.openaiRemainingEstimatedUsd / kpis.openaiPurchasedUsd) * 100
            )
          )
        )
      : 0;

  const totalProviderUsd = kpis.totalProviderUsedUsd ?? kpis.openaiUsedUsd;
  const todayProviderUsd =
    (kpis.openaiTodayUsd ?? 0) + (kpis.geminiTodayUsd ?? 0);
  const spendPct =
    kpis.monthlySpendLimitUsd > 0
      ? Math.round((totalProviderUsd / kpis.monthlySpendLimitUsd) * 100)
      : 0;
  const dailySpendPct =
    (kpis.dailySpendLimitUsd ?? 0) > 0
      ? Math.round((todayProviderUsd / kpis.dailySpendLimitUsd) * 100)
      : 0;

  const poolTotal = Math.max(1, creditPool.totalAssigned);
  const usedPoolPct = Math.round((creditPool.totalUsed / poolTotal) * 100);
  const remPoolPct = Math.max(0, 100 - usedPoolPct);

  const donutData = [
    { name: 'Used Credits', value: Math.max(1, creditPool.totalUsed), color: '#059669' },
    {
      name: 'Remaining Credits',
      value: Math.max(1, creditPool.totalRemaining),
      color: '#6EE7B7',
    },
  ];

  const featureTotal = Math.max(
    1,
    dashboard.featureBreakdown.reduce((acc, f) => acc + f.credits, 0)
  );

  const featureMeta: Record<
    string,
    {
      label: string;
      Icon: React.ComponentType<{ className?: string }>;
      barColor: string;
      iconTone: string;
    }
  > = {
    chat: {
      label: 'Chat (Text)',
      Icon: MessageSquare,
      barColor: 'bg-emerald-600',
      iconTone: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50',
    },
    image: {
      label: 'Image Generation',
      Icon: ImageIcon,
      barColor: 'bg-violet-500',
      iconTone: 'text-violet-600 bg-violet-50 dark:bg-violet-950/50',
    },
    pdf: {
      label: 'PDF Analysis',
      Icon: FileText,
      barColor: 'bg-rose-500',
      iconTone: 'text-rose-600 bg-rose-50 dark:bg-rose-950/50',
    },
    search: {
      label: 'Web Search',
      Icon: Globe,
      barColor: 'bg-sky-500',
      iconTone: 'text-sky-600 bg-sky-50 dark:bg-sky-950/50',
    },
    voice: {
      label: 'Voice Chat',
      Icon: Mic,
      barColor: 'bg-amber-500',
      iconTone: 'text-amber-600 bg-amber-50 dark:bg-amber-950/50',
    },
  };

  const pendingPaymentList = dashboard.payments.filter(
    (p) => p.status === 'PENDING'
  );
  const pendingUserList = dashboard.users.filter((u) => u.status === 'PENDING');

  const filteredUsers = dashboard.users.filter((u) => {
    const matchText =
      !effectiveSearch ||
      u.fullName.toLowerCase().includes(effectiveSearch) ||
      u.email.toLowerCase().includes(effectiveSearch);
    if (!matchText) return false;
    if (userStatusFilter === 'ALL') return true;
    if (userStatusFilter === 'EXPIRED') return u.isExpired;
    return u.status === userStatusFilter && !u.isExpired;
  });

  /* ==========================================================================
   * 1. MAIN ADMIN DASHBOARD (Matches QAAGA_AGENT_Admin_Dashboard_b01ecb28.png)
   * ======================================================================== */
  if (section === 'admin-overview') {
    return (
      <div className="max-w-[1440px] mx-auto w-full px-4 sm:px-6 py-6 space-y-5">
        {renderModals()}

        {/* Header Row */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-heading font-extrabold text-2xl sm:text-[26px] text-slate-900 dark:text-white tracking-tight">
              Admin Dashboard
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Manage your QAAGA AGENT platform, monitor usage, payments and grow your community.
            </p>
          </div>

          <div className="relative flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onSelectSection('admin-branding')}
              className="px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 flex items-center gap-1.5 cursor-pointer"
            >
              <Palette className="w-3.5 h-3.5" />
              <span>Logo & Favicon</span>
            </button>

            <button
              type="button"
              onClick={onRefresh}
              className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setExportOpen((o) => !o)}
                className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Report</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {exportOpen && (
                <div className="absolute right-0 mt-2 w-48 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg p-1.5 z-40 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      exportUsersCsv();
                      setExportOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 font-medium cursor-pointer"
                  >
                    Export Users CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      exportPaymentsCsv();
                      setExportOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 font-medium cursor-pointer"
                  >
                    Export Payments CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      exportModelsCsv();
                      setExportOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 font-medium cursor-pointer"
                  >
                    Export API Usage CSV
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Spend Cap Alert if Triggered */}
        {(spendPct >= config.openaiWallet.alertThresholdPct ||
          dailySpendPct >= config.openaiWallet.alertThresholdPct) && (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-4 py-3 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              <strong>API Spend Alert:</strong> Total provider spend ($
              {totalProviderUsd.toFixed(4)} USD · OpenAI $
              {kpis.openaiUsedUsd.toFixed(4)} · Gemini $
              {(kpis.geminiUsedUsd ?? 0).toFixed(4)}) is at {spendPct}% of your
              monthly cap (${kpis.monthlySpendLimitUsd.toFixed(2)}) and{' '}
              {dailySpendPct}% of your daily cap ($
              {(kpis.dailySpendLimitUsd ?? 15).toFixed(2)}).
            </span>
          </div>
        )}

        {/* Row 1: 7 Top KPI Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-7 gap-3">
          {/* 1. Total Users */}
          <button
            type="button"
            onClick={() => onSelectSection('admin-users')}
            className="text-left rounded-2xl bg-emerald-50/55 dark:bg-slate-900 border border-emerald-100 dark:border-slate-800 p-4 hover:border-emerald-300 transition-colors cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-3">
              Total Users
            </p>
            <div className="mt-1 flex items-baseline justify-between gap-1">
              <span className="text-xl font-heading font-extrabold tabular-nums text-slate-900 dark:text-white">
                {kpis.totalUsers.toLocaleString()}
              </span>
              <span className="text-[10.5px] font-medium text-emerald-700 dark:text-emerald-400">
                {kpis.expiredUsers} exp
              </span>
            </div>
          </button>

          {/* 2. Active Users */}
          <button
            type="button"
            onClick={() => onSelectSection('admin-users')}
            className="text-left rounded-2xl bg-emerald-50/55 dark:bg-slate-900 border border-emerald-100 dark:border-slate-800 p-4 hover:border-emerald-300 transition-colors cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
              <UserCheck className="w-4 h-4" />
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-3">
              Active Users
            </p>
            <div className="mt-1 flex items-baseline justify-between gap-1">
              <span className="text-xl font-heading font-extrabold tabular-nums text-slate-900 dark:text-white">
                {kpis.activeUsers.toLocaleString()}
              </span>
              <span className="text-[10.5px] font-medium text-emerald-700 dark:text-emerald-400">
                30d active
              </span>
            </div>
          </button>

          {/* 3. Pending Approvals */}
          <button
            type="button"
            onClick={() => onSelectSection('admin-approvals')}
            className="text-left rounded-2xl bg-amber-50/65 dark:bg-slate-900 border border-amber-100 dark:border-slate-800 p-4 hover:border-amber-300 transition-colors cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-3">
              Pending Approvals
            </p>
            <div className="mt-1 flex items-baseline justify-between gap-1">
              <span className="text-xl font-heading font-extrabold tabular-nums text-slate-900 dark:text-white">
                {kpis.pendingUsers}
              </span>
              <span className="text-[10.5px] font-medium text-amber-700 dark:text-amber-400">
                accounts
              </span>
            </div>
          </button>

          {/* 4. Total Revenue */}
          <button
            type="button"
            onClick={() => onSelectSection('admin-payments')}
            className="text-left rounded-2xl bg-emerald-50/55 dark:bg-slate-900 border border-emerald-100 dark:border-slate-800 p-4 hover:border-emerald-300 transition-colors cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-3">
              Total Revenue
            </p>
            <div className="mt-1 flex items-baseline justify-between gap-1">
              <span className="text-xl font-heading font-extrabold tabular-nums text-slate-900 dark:text-white">
                ৳{kpis.totalRevenueBdt.toLocaleString()}
              </span>
              <span className="text-[10.5px] font-medium text-emerald-700 dark:text-emerald-400">
                {kpis.approvedPaymentsCount} paid
              </span>
            </div>
          </button>

          {/* 5. Total API Used */}
          <button
            type="button"
            onClick={() => onSelectSection('admin-api-usage')}
            className="text-left rounded-2xl bg-sky-50/65 dark:bg-slate-900 border border-sky-100 dark:border-slate-800 p-4 hover:border-sky-300 transition-colors cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-sky-100 dark:bg-sky-950/70 text-sky-700 dark:text-sky-400 flex items-center justify-center">
              <Database className="w-4 h-4" />
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-3">
              Total API Used
            </p>
            <div className="mt-1 flex items-baseline justify-between gap-1">
              <span className="text-xl font-heading font-extrabold tabular-nums text-slate-900 dark:text-white">
                ${totalProviderUsd.toFixed(2)}
              </span>
              <span className="text-[10.5px] font-mono text-sky-700 dark:text-sky-400">
                {(kpis.totalTokensUsed / 1000).toFixed(1)}k tok
              </span>
            </div>
            <p className="text-[10px] font-mono text-slate-500 mt-0.5 truncate">
              OAI ${kpis.openaiUsedUsd.toFixed(2)} · Gem $
              {(kpis.geminiUsedUsd ?? 0).toFixed(2)}
            </p>
          </button>

          {/* 6. OpenAI Balance (Reconciled Estimate) */}
          <button
            type="button"
            onClick={() => onSelectSection('admin-openai-billing')}
            className="text-left rounded-2xl bg-violet-50/65 dark:bg-slate-900 border border-violet-100 dark:border-slate-800 p-4 hover:border-violet-300 transition-colors cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-violet-100 dark:bg-violet-950/70 text-violet-700 dark:text-violet-400 flex items-center justify-center">
              <Cpu className="w-4 h-4" />
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-3">
              OpenAI Balance
            </p>
            <div className="mt-1 flex items-baseline justify-between gap-1">
              <span className="text-lg font-heading font-extrabold tabular-nums text-slate-900 dark:text-white">
                ${kpis.openaiRemainingEstimatedUsd.toFixed(2)}
              </span>
              <span className="text-[10px] text-slate-500 tabular-nums">
                {openaiRemainingPct}% est.
              </span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-violet-200/70 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-emerald-600 rounded-full"
                style={{ width: `${openaiRemainingPct}%` }}
              />
            </div>
          </button>

          {/* 7. Pending Payments */}
          <button
            type="button"
            onClick={() => onSelectSection('admin-payments')}
            className="text-left rounded-2xl bg-rose-50/65 dark:bg-slate-900 border border-rose-100 dark:border-slate-800 p-4 hover:border-rose-300 transition-colors cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-400 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-3">
              Pending Payments
            </p>
            <div className="mt-1 flex items-baseline justify-between gap-1">
              <span className="text-xl font-heading font-extrabold tabular-nums text-slate-900 dark:text-white">
                {kpis.pendingPaymentsCount}
              </span>
              <span className="text-[10.5px] font-semibold text-rose-600 dark:text-rose-400 tabular-nums">
                ৳{kpis.pendingPaymentsBdt} waiting
              </span>
            </div>
          </button>
        </div>

        {/* Row 2: OpenAI API Usage Overview + API Credit Summary Donut + Feature Usage Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* OpenAI API Usage Overview Bar Chart */}
          <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 flex flex-col justify-between">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="text-sm font-heading font-bold text-slate-900 dark:text-white">
                OpenAI API Usage Overview
              </h2>
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px]">
                {(
                  [
                    { k: 'credits', l: 'Credits' },
                    { k: 'usdCost', l: 'USD' },
                    { k: 'requests', l: 'API Calls' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.k}
                    type="button"
                    onClick={() => setChartMetric(opt.k)}
                    className={`px-2 py-1 rounded-md font-semibold cursor-pointer ${
                      chartMetric === opt.k
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                        : 'text-slate-500'
                    }`}
                  >
                    {opt.l}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dashboard.dailyUsage}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    strokeOpacity={0.2}
                  />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={36} />
                  <Tooltip />
                  <Bar
                    dataKey={chartMetric}
                    fill="#10B981"
                    radius={[5, 5, 0, 0]}
                    barSize={16}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* API Credit Summary Donut */}
          <div className="lg:col-span-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 flex flex-col justify-between">
            <h2 className="text-sm font-heading font-bold text-slate-900 dark:text-white">
              API Credit Summary
            </h2>

            <div className="flex items-center justify-between gap-2 my-auto py-2">
              <div className="relative w-36 h-36 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      dataKey="value"
                      innerRadius={48}
                      outerRadius={66}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {donutData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-lg font-heading font-extrabold tabular-nums text-slate-900 dark:text-white">
                    {creditPool.totalAssigned}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Total Credits
                  </span>
                </div>
              </div>

              <div className="space-y-3 text-xs flex-1 pl-2">
                <div>
                  <div className="flex items-center justify-between text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                      <span>Used</span>
                    </span>
                    <span className="tabular-nums">{usedPoolPct}%</span>
                  </div>
                  <p className="font-mono font-bold text-sm tabular-nums text-slate-900 dark:text-white mt-0.5 pl-4">
                    {creditPool.totalUsed}
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-300" />
                      <span>Remaining</span>
                    </span>
                    <span className="tabular-nums">{remPoolPct}%</span>
                  </div>
                  <p className="font-mono font-bold text-sm tabular-nums text-slate-900 dark:text-white mt-0.5 pl-4">
                    {creditPool.totalRemaining}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Feature Usage Breakdown */}
          <div className="lg:col-span-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-heading font-bold text-slate-900 dark:text-white">
                Feature Usage Breakdown
              </h2>
              <span className="text-[11px] text-slate-400">All Users</span>
            </div>

            <div className="space-y-3 my-auto">
              {dashboard.featureBreakdown.map((f) => {
                const meta = featureMeta[f.feature] || featureMeta.chat;
                const Icon = meta.Icon;
                const pct = Math.round((f.credits / featureTotal) * 100);
                return (
                  <div
                    key={f.feature}
                    className="grid grid-cols-[135px_46px_1fr_36px] items-center gap-2 text-xs"
                  >
                    <span className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-medium truncate">
                      <span
                        className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${meta.iconTone}`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      <span className="truncate">{meta.label}</span>
                    </span>
                    <span className="font-mono font-semibold tabular-nums text-right text-slate-700 dark:text-slate-300">
                      {f.credits}
                    </span>
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${meta.barColor}`}
                        style={{ width: `${Math.max(5, pct)}%` }}
                      />
                    </div>
                    <span className="font-mono tabular-nums text-right text-slate-500">
                      {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Row 3: Recent Payments + Top API Usage Users + Pending Payment Approvals */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Recent Payments */}
          <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-heading font-bold text-slate-900 dark:text-white">
                Recent Payments
              </h3>
              <button
                type="button"
                onClick={() => onSelectSection('admin-payments')}
                className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                View All
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 dark:bg-slate-800/50 text-slate-500 border-b border-slate-100 dark:border-slate-800">
                    <th className="py-2 px-3 font-medium">#</th>
                    <th className="py-2 px-3 font-medium">User</th>
                    <th className="py-2 px-3 font-medium">Amount</th>
                    <th className="py-2 px-3 font-medium">Method</th>
                    <th className="py-2 px-3 font-medium">Status</th>
                    <th className="py-2 px-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {dashboard.payments.slice(0, 5).map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-mono text-slate-500">
                        #{p.id}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white truncate max-w-[120px]">
                        {p.userName}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold tabular-nums">
                        {p.amountBdt} BDT
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                        {p.paymentMethod}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`font-semibold ${
                            p.status === 'APPROVED'
                              ? 'text-emerald-600'
                              : p.status === 'REJECTED'
                              ? 'text-rose-600'
                              : 'text-amber-600'
                          }`}
                        >
                          {p.status === 'APPROVED' ? 'Success' : p.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                        {new Date(p.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top API Usage Users */}
          <div className="lg:col-span-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-heading font-bold text-slate-900 dark:text-white">
                Top API Usage Users
              </h3>
              <button
                type="button"
                onClick={() => onSelectSection('admin-api-usage')}
                className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                View All
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 dark:bg-slate-800/50 text-slate-500 border-b border-slate-100 dark:border-slate-800">
                    <th className="py-2 px-3 font-medium">#</th>
                    <th className="py-2 px-2 font-medium">User</th>
                    <th className="py-2 px-2 font-medium text-right">USD</th>
                    <th className="py-2 px-3 font-medium text-right">Credits</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {dashboard.topApiUsers.slice(0, 5).map((u, idx) => (
                    <tr key={u.userId}>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-2 font-semibold text-slate-900 dark:text-white truncate max-w-[110px]">
                        {u.fullName}
                      </td>
                      <td className="py-2.5 px-2 font-mono font-bold tabular-nums text-right text-slate-900 dark:text-white">
                        ${u.usdCost.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-right text-emerald-600">
                        {u.creditsCharged} cr
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pending Payment Approvals */}
          <div className="lg:col-span-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-heading font-bold text-slate-900 dark:text-white">
                Pending Payment Approvals
              </h3>
              <button
                type="button"
                onClick={() => onSelectSection('admin-approvals')}
                className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                View All
              </button>
            </div>

            {pendingPaymentList.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                All submitted BDT payments have been reviewed.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/80 dark:bg-slate-800/50 text-slate-500 border-b border-slate-100 dark:border-slate-800">
                      <th className="py-2 px-3 font-medium">User</th>
                      <th className="py-2 px-2 font-medium">Amount</th>
                      <th className="py-2 px-2 font-medium">Method</th>
                      <th className="py-2 px-3 font-medium text-right">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {pendingPaymentList.slice(0, 5).map((p) => (
                      <tr key={p.id}>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900 dark:text-white truncate max-w-[105px]">
                            {p.userName}
                          </div>
                          <div className="font-mono text-[10px] text-slate-400">
                            {p.transactionId}
                          </div>
                        </td>
                        <td className="py-2.5 px-2 font-mono font-bold tabular-nums">
                          {p.amountBdt} BDT
                        </td>
                        <td className="py-2.5 px-2 text-slate-600 dark:text-slate-300">
                          {p.paymentMethod}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center justify-end gap-1.5">
                            {p.hasScreenshot && (
                              <button
                                type="button"
                                onClick={() => openScreenshot(p.id)}
                                title="Inspect Receipt Screenshot"
                                className="w-6 h-6 rounded-full border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 hover:text-slate-900 cursor-pointer"
                              >
                                <Eye className="w-3 h-3" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onReviewPayment(p.id, 'APPROVED')}
                              title="Approve & Grant 30 Days + Credits"
                              className="w-6 h-6 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onReviewPayment(p.id, 'REJECTED')}
                              title="Reject Payment"
                              className="w-6 h-6 rounded-full border border-rose-300 text-rose-600 hover:bg-rose-50 flex items-center justify-center cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Row 4: All Users + Plan Management */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {/* All Users Table */}
          <div className="xl:col-span-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-heading font-bold text-slate-900 dark:text-white">
                All Users
              </h3>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search users..."
                    className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs w-40 focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <select
                  value={userStatusFilter}
                  onChange={(e) =>
                    setUserStatusFilter(
                      e.target.value as typeof userStatusFilter
                    )
                  }
                  className="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200"
                >
                  <option value="ALL">All Status</option>
                  <option value="ACTIVE">Active</option>
                  <option value="PENDING">Pending</option>
                  <option value="EXPIRED">Expired</option>
                  <option value="SUSPENDED">Suspended</option>
                </select>

                <button
                  type="button"
                  onClick={() => onSelectSection('admin-users')}
                  className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                >
                  View All
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 dark:bg-slate-800/50 text-slate-500 border-b border-slate-100 dark:border-slate-800">
                    <th className="py-2.5 px-3 font-medium">#</th>
                    <th className="py-2.5 px-3 font-medium">User</th>
                    <th className="py-2.5 px-3 font-medium">Email</th>
                    <th className="py-2.5 px-3 font-medium">Plan</th>
                    <th className="py-2.5 px-3 font-medium">
                      Credits (Assigned / Used / Rem)
                    </th>
                    <th className="py-2.5 px-3 font-medium">Validity</th>
                    <th className="py-2.5 px-3 font-medium">Status</th>
                    <th className="py-2.5 px-3 font-medium text-right">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredUsers.slice(0, 6).map((u, idx) => {
                    const usedRatio =
                      u.creditsAssigned > 0
                        ? Math.min(
                            100,
                            Math.round(
                              (u.creditsUsed / u.creditsAssigned) * 100
                            )
                          )
                        : 0;
                    return (
                      <tr key={u.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 font-mono text-slate-400">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <UserAvatarBadge name={u.fullName} role={u.role} />
                            <span className="font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                              {u.fullName}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                          {u.email}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {u.latestPlanBdt ? `${u.latestPlanBdt} BDT` : 'Starter'}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono tabular-nums whitespace-nowrap text-slate-700 dark:text-slate-200">
                              {u.creditsAssigned} / {u.creditsUsed} /{' '}
                              <strong className="text-emerald-600">
                                {u.creditsRemaining}
                              </strong>
                            </span>
                            <div className="w-16 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden shrink-0">
                              <div
                                className="h-full bg-emerald-600 rounded-full"
                                style={{ width: `${usedRatio}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                          {u.subscriptionExpiresAt
                            ? new Date(
                                u.subscriptionExpiresAt
                              ).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })
                            : '—'}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`font-semibold ${
                              u.status === 'ACTIVE' && !u.isExpired
                                ? 'text-emerald-600'
                                : u.status === 'PENDING'
                                ? 'text-amber-600'
                                : 'text-rose-600'
                            }`}
                          >
                            {u.isExpired ? 'Expired' : u.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {u.status === 'PENDING' ? (
                            <button
                              type="button"
                              onClick={() =>
                                onManageUser(u.id, {
                                  status: 'ACTIVE',
                                  activate30Days: true,
                                })
                              }
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold cursor-pointer"
                            >
                              Approve
                            </button>
                          ) : u.role !== 'admin' ? (
                            <button
                              type="button"
                              onClick={() =>
                                onManageUser(u.id, {
                                  status:
                                    u.status === 'SUSPENDED'
                                      ? 'ACTIVE'
                                      : 'SUSPENDED',
                                })
                              }
                              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 cursor-pointer"
                            >
                              {u.status === 'SUSPENDED' ? 'Restore' : 'Suspend'}
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400">
                              Root
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Plan Management Table */}
          <div className="xl:col-span-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-heading font-bold text-slate-900 dark:text-white">
                Plan Management
              </h3>
              <button
                type="button"
                onClick={() => {
                  setPlanError(null);
                  setPlanModal({
                    mode: 'create',
                    name: 'Enterprise Plan',
                    amountBdt: 500,
                    credits: 2200,
                    validityDays: 30,
                  });
                }}
                className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Plan</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 dark:bg-slate-800/50 text-slate-500 border-b border-slate-100 dark:border-slate-800">
                    <th className="py-2.5 px-3 font-medium">Plan Name</th>
                    <th className="py-2.5 px-2 font-medium">Price</th>
                    <th className="py-2.5 px-2 font-medium">Credits</th>
                    <th className="py-2.5 px-2 font-medium">Status</th>
                    <th className="py-2.5 px-3 font-medium text-right">Edit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {packages.map((pkg) => (
                    <tr key={pkg.id}>
                      <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                        {pkg.name}
                      </td>
                      <td className="py-2.5 px-2 font-mono font-bold tabular-nums">
                        {pkg.amountBdt} BDT
                      </td>
                      <td className="py-2.5 px-2 font-mono tabular-nums text-emerald-600 font-semibold">
                        {pkg.credits}
                      </td>
                      <td className="py-2.5 px-2">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdatePackage(pkg.id, { active: !pkg.active })
                          }
                          aria-label={`Toggle ${pkg.name}`}
                          className={`w-9 h-5 rounded-full transition-colors p-0.5 cursor-pointer ${
                            pkg.active
                              ? 'bg-emerald-600'
                              : 'bg-slate-300 dark:bg-slate-700'
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded-full bg-white transition-transform ${
                              pkg.active ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setPlanError(null);
                            setPlanModal({
                              mode: 'edit',
                              id: pkg.id,
                              name: pkg.name,
                              amountBdt: pkg.amountBdt,
                              credits: pkg.credits,
                              validityDays: pkg.validityDays,
                            });
                          }}
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ==========================================================================
   * 2. DEDICATED USERS MANAGEMENT (`admin-users`)
   * ======================================================================== */
  if (section === 'admin-users') {
    return (
      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 space-y-5">
        {renderModals()}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white">
              Users & Per-User Credit Controls
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Approve accounts, suspend access, set daily usage caps, or issue manual credit adjustments.
            </p>
          </div>
          <button
            type="button"
            onClick={exportUsersCsv}
            className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Users CSV</span>
          </button>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-slate-500">
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-3">Status & Expiry</th>
                  <th className="py-3 px-3 text-right">Assigned / Used / Rem</th>
                  <th className="py-3 px-3 text-right">API Cost (OAI / Gem)</th>
                  <th className="py-3 px-3 text-right">
                    Chat · Img · PDF · Web · Voice
                  </th>
                  <th className="py-3 px-3">Daily Limit & Bonus</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredUsers.map((u) => (
                  <tr key={u.id}>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 dark:text-white">
                        {u.fullName}{' '}
                        {u.role === 'admin' && (
                          <span className="text-[10.5px] text-emerald-600 font-semibold">
                            · Admin
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-[11px] text-slate-500">
                        {u.email}
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <div
                        className={`font-semibold ${
                          u.status === 'ACTIVE' && !u.isExpired
                            ? 'text-emerald-600'
                            : u.status === 'PENDING'
                            ? 'text-amber-600'
                            : 'text-rose-600'
                        }`}
                      >
                        {u.isExpired ? 'EXPIRED' : u.status}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {u.subscriptionExpiresAt
                          ? new Date(u.subscriptionExpiresAt).toLocaleDateString()
                          : 'No active plan'}
                      </div>
                    </td>

                    <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      <span>{u.creditsAssigned}</span> /{' '}
                      <span className="text-amber-600">{u.creditsUsed}</span> /{' '}
                      <span className="font-bold text-emerald-600">
                        {u.creditsRemaining}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        ${(u.openaiUsdCost ?? 0).toFixed(4)} / $
                        {(u.geminiUsdCost ?? 0).toFixed(4)}
                      </div>
                      <div className="text-[10.5px] text-slate-400">
                        {u.apiRequests ?? 0} req ·{' '}
                        {(u.totalTokens ?? 0).toLocaleString()} tok
                      </div>
                    </td>

                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-500 whitespace-nowrap">
                      {u.chatCredits} · {u.imageCredits} · {u.pdfCredits} ·{' '}
                      {u.searchCredits} · {u.voiceCredits}
                    </td>

                    <td className="py-3 px-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            value={userLimits[u.id] ?? u.dailyCreditLimit}
                            onChange={(e) =>
                              setUserLimits((prev) => ({
                                ...prev,
                                [u.id]: Number(e.target.value),
                              }))
                            }
                            className="w-16 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-xs"
                            title="Daily credit limit"
                          />
                          <input
                            type="number"
                            placeholder="+cr"
                            value={userBonus[u.id] ?? ''}
                            onChange={(e) =>
                              setUserBonus((prev) => ({
                                ...prev,
                                [u.id]: Number(e.target.value),
                              }))
                            }
                            className="w-16 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-xs"
                            title="Grant bonus credits"
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              await onManageUser(u.id, {
                                dailyCreditLimit:
                                  userLimits[u.id] ?? u.dailyCreditLimit,
                                bonusCredits: userBonus[u.id] || 0,
                              });
                              setUserBonus((prev) => ({ ...prev, [u.id]: 0 }));
                            }}
                            className="px-2 py-1 rounded-lg bg-slate-900 dark:bg-emerald-700 text-white text-[11px] font-semibold cursor-pointer"
                          >
                            Apply
                          </button>
                        </div>
                        <div className="text-[10.5px] font-mono text-slate-400">
                          Today: {u.usedTodayCredits} / {u.dailyCreditLimit} cr
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                      {u.status !== 'ACTIVE' && (
                        <button
                          type="button"
                          onClick={() =>
                            onManageUser(u.id, {
                              status: 'ACTIVE',
                              activate30Days: true,
                            })
                          }
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold cursor-pointer"
                        >
                          Approve
                        </button>
                      )}
                      {u.isExpired && (
                        <button
                          type="button"
                          onClick={() =>
                            onManageUser(u.id, {
                              status: 'ACTIVE',
                              activate30Days: true,
                            })
                          }
                          className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-semibold cursor-pointer"
                        >
                          +30 Days
                        </button>
                      )}
                      {u.status !== 'SUSPENDED' && u.role !== 'admin' && (
                        <button
                          type="button"
                          onClick={() =>
                            onManageUser(u.id, { status: 'SUSPENDED' })
                          }
                          className="px-2.5 py-1 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 text-[11px] font-semibold cursor-pointer"
                        >
                          Suspend
                        </button>
                      )}
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

  /* ==========================================================================
   * 3. DEDICATED APPROVALS QUEUE (`admin-approvals`)
   * ======================================================================== */
  if (section === 'admin-approvals') {
    return (
      <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
        {renderModals()}
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white">
            Approvals Queue ({pendingUserList.length + pendingPaymentList.length})
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Verify new user account registrations and manual bKash / Nagad / Rocket payment screenshots.
          </p>
        </div>

        {/* Pending Accounts */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
          <h2 className="text-sm font-heading font-bold text-slate-900 dark:text-white">
            Pending User Registrations ({pendingUserList.length})
          </h2>
          {pendingUserList.length === 0 ? (
            <p className="text-xs text-slate-400 py-4">
              No pending user accounts awaiting approval.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {pendingUserList.map((u) => (
                <div
                  key={u.id}
                  className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <UserAvatarBadge name={u.fullName} role={u.role} />
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white">
                        {u.fullName}
                      </p>
                      <p className="font-mono text-slate-500">{u.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onManageUser(u.id, {
                          status: 'ACTIVE',
                          activate30Days: true,
                          bonusCredits: 25,
                        })
                      }
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
                    >
                      Approve + Grant 30d (+25 Starter cr)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onManageUser(u.id, { status: 'SUSPENDED' })
                      }
                      className="px-3 py-1.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 font-semibold cursor-pointer"
                    >
                      Suspend
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending Payments */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
          <h2 className="text-sm font-heading font-bold text-slate-900 dark:text-white">
            Pending BDT Payment Recharges ({pendingPaymentList.length})
          </h2>
          {pendingPaymentList.length === 0 ? (
            <p className="text-xs text-slate-400 py-4">
              No pending payment requests awaiting review.
            </p>
          ) : (
            <div className="space-y-3">
              {pendingPaymentList.map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap items-center justify-between gap-4 text-xs"
                >
                  <div className="space-y-1">
                    <div className="font-bold text-sm text-slate-900 dark:text-white">
                      {p.amountBdt} BDT via {p.paymentMethod} (+{p.creditsToGrant} credits)
                    </div>
                    <div className="text-slate-500">
                      User: <strong>{p.userName}</strong> ({p.userEmail}) · Sender:{' '}
                      <span className="font-mono">{p.senderNumber}</span> · TrxID:{' '}
                      <span className="font-mono font-bold text-emerald-700">
                        {p.transactionId}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {p.hasScreenshot && (
                      <button
                        type="button"
                        onClick={() => openScreenshot(p.id)}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Inspect Screenshot</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        onReviewPayment(
                          p.id,
                          'APPROVED',
                          'Verified MFS TrxID & receipt'
                        )
                      }
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onReviewPayment(
                          p.id,
                          'REJECTED',
                          'Unmatched TrxID or screenshot'
                        )
                      }
                      className="px-3 py-1.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 font-semibold cursor-pointer"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ==========================================================================
   * 4. FULL PAYMENTS LEDGER (`admin-payments`)
   * ======================================================================== */
  if (section === 'admin-payments') {
    const list = dashboard.payments.filter(
      (p) =>
        (paymentFilter === 'ALL' || p.status === paymentFilter) &&
        (!effectiveSearch ||
          p.transactionId.toLowerCase().includes(effectiveSearch) ||
          (p.userName || '').toLowerCase().includes(effectiveSearch) ||
          (p.userEmail || '').toLowerCase().includes(effectiveSearch))
    );

    return (
      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 space-y-5">
        {renderModals()}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white">
              BDT Payments & Receipt Verification
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Approve or reject bKash, Nagad, and Rocket submissions. Duplicate approvals are blocked atomically.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-800">
              {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map(
                (f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setPaymentFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                      paymentFilter === f
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {f}
                  </button>
                )
              )}
            </div>
            <button
              type="button"
              onClick={exportPaymentsCsv}
              className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {list.map((p) => (
            <div
              key={p.id}
              className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-xs"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono font-extrabold text-sm text-slate-900 dark:text-white">
                    #{p.id} · {p.amountBdt} BDT · {p.paymentMethod}
                  </span>
                  <span className="font-mono text-emerald-600 font-semibold">
                    +{p.creditsToGrant} credits
                  </span>
                  <span
                    className={`font-bold ${
                      p.status === 'APPROVED'
                        ? 'text-emerald-600'
                        : p.status === 'REJECTED'
                        ? 'text-rose-600'
                        : 'text-amber-600'
                    }`}
                  >
                    · {p.status}
                  </span>
                </div>
                <div className="text-slate-500">
                  User: <strong>{p.userName}</strong> ({p.userEmail}) · Sender:{' '}
                  <span className="font-mono">{p.senderNumber}</span> · TrxID:{' '}
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                    {p.transactionId}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {p.hasScreenshot && (
                  <button
                    type="button"
                    onClick={() => openScreenshot(p.id)}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Receipt</span>
                  </button>
                )}

                {p.status === 'PENDING' && (
                  <>
                    <input
                      type="text"
                      placeholder="Optional note..."
                      value={adminNotes[p.id] || ''}
                      onChange={(e) =>
                        setAdminNotes((prev) => ({
                          ...prev,
                          [p.id]: e.target.value,
                        }))
                      }
                      className="px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs w-40"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        onReviewPayment(p.id, 'APPROVED', adminNotes[p.id])
                      }
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onReviewPayment(p.id, 'REJECTED', adminNotes[p.id])
                      }
                      className="px-3 py-1.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 font-semibold cursor-pointer"
                    >
                      Reject
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ==========================================================================
   * 5. PLANS & CREDIT RATES (`admin-pricing`)
   * ======================================================================== */
  if (section === 'admin-pricing') {
    return (
      <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
        {renderModals()}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white">
              Plans & Internal Credit Rates
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Customize 20, 50, 100, and 200 BDT packages, add new plans, and configure internal feature credit costs.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setPlanError(null);
              setPlanModal({
                mode: 'create',
                name: 'Enterprise Plan',
                amountBdt: 500,
                credits: 2200,
                validityDays: 30,
              });
            }}
            className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Plan</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {packages.map((pkg) => (
            <div
              key={pkg.id}
              className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-heading font-extrabold text-xl font-mono text-slate-900 dark:text-white">
                  {pkg.amountBdt} BDT
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onUpdatePackage(pkg.id, { active: !pkg.active })
                  }
                  className={`text-xs font-semibold cursor-pointer ${
                    pkg.active ? 'text-emerald-600' : 'text-slate-400'
                  }`}
                >
                  {pkg.active ? 'Active' : 'Disabled'}
                </button>
              </div>
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                {pkg.name}
              </p>
              <p className="text-sm font-mono font-bold text-emerald-600">
                {pkg.credits} Credits · {pkg.validityDays} Days
              </p>
              <button
                type="button"
                onClick={() => {
                  setPlanError(null);
                  setPlanModal({
                    mode: 'edit',
                    id: pkg.id,
                    name: pkg.name,
                    amountBdt: pkg.amountBdt,
                    credits: pkg.credits,
                    validityDays: pkg.validityDays,
                  });
                }}
                className="w-full py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Edit Plan
              </button>
            </div>
          ))}
        </div>

        {/* Credit Rate Matrix */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <h2 className="text-sm font-heading font-bold text-slate-900 dark:text-white">
            Internal Credit Deduction Rates per AI Tool
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {(
              [
                ['chatBase', 'Chat Base Credits'],
                ['chatPer1kTokens', 'Chat per 1K Tokens'],
                ['imageGeneration', 'Image Generation'],
                ['imageAnalysis', 'Vision Analysis'],
                ['pdfAnalysis', 'PDF / Doc Analysis'],
                ['webSearch', 'Web Search'],
                ['voiceStt', 'Speech-to-Text'],
                ['voiceTts', 'Text-to-Speech'],
                ['voiceRealtime', 'Realtime Duplex Voice'],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <label className="block text-slate-500 mb-1">{label}</label>
                <input
                  type="number"
                  min={1}
                  value={draftConfig.creditRates[key] ?? 12}
                  onChange={(e) =>
                    setDraftConfig({
                      ...draftConfig,
                      creditRates: {
                        ...draftConfig.creditRates,
                        [key]: Number(e.target.value),
                      },
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-sm"
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end items-center gap-3">
            {configSaved && (
              <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> Saved
              </span>
            )}
            <button
              type="button"
              onClick={async () => {
                await onSaveConfig(draftConfig);
                setConfigSaved(true);
                setTimeout(() => setConfigSaved(false), 2000);
              }}
              className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Credit Rates</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ==========================================================================
   * 6. API USAGE ANALYTICS (`admin-api-usage`)
   * ======================================================================== */
  if (section === 'admin-api-usage') {
    const usersSortedBySpend = [...dashboard.users].sort(
      (a, b) => (b.totalUsdCost ?? 0) - (a.totalUsdCost ?? 0)
    );

    return (
      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white">
              API Usage & Multi-Provider Telemetry
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Monitor OpenAI API USD spending and Google Gemini API USD spending separately alongside per-user consumption.
            </p>
          </div>
          <button
            type="button"
            onClick={exportModelsCsv}
            className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Usage CSV</span>
          </button>
        </div>

        {/* Separate OpenAI vs Gemini Spend Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
            <p className="text-xs text-slate-500">OpenAI API Spending (USD)</p>
            <p className="text-2xl font-mono font-extrabold tabular-nums text-emerald-700 dark:text-emerald-400 mt-1">
              ${kpis.openaiUsedUsd.toFixed(4)}
            </p>
            <p className="text-[11px] font-mono text-slate-400 mt-0.5">
              Today: ${(kpis.openaiTodayUsd ?? 0).toFixed(4)} USD
            </p>
          </div>
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
            <p className="text-xs text-slate-500">
              Google Gemini API Spending (USD)
            </p>
            <p className="text-2xl font-mono font-extrabold tabular-nums text-sky-600 dark:text-sky-400 mt-1">
              ${(kpis.geminiUsedUsd ?? 0).toFixed(4)}
            </p>
            <p className="text-[11px] font-mono text-slate-400 mt-0.5">
              Today: ${(kpis.geminiTodayUsd ?? 0).toFixed(4)} USD
            </p>
          </div>
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
            <p className="text-xs text-slate-500">
              Combined Provider Spend & Caps
            </p>
            <p className="text-2xl font-mono font-extrabold tabular-nums text-slate-900 dark:text-white mt-1">
              ${totalProviderUsd.toFixed(4)}
            </p>
            <p className="text-[11px] font-mono text-slate-400 mt-0.5">
              Daily Cap ${(kpis.dailySpendLimitUsd ?? 15).toFixed(2)} · Monthly
              Cap ${kpis.monthlySpendLimitUsd.toFixed(2)}
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-sm font-heading font-bold text-slate-900 dark:text-white">
              Cost & Token Breakdown by Model
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-slate-500">
                  <th className="py-2.5 px-4">Model</th>
                  <th className="py-2.5 px-4">Provider</th>
                  <th className="py-2.5 px-4 text-right">Requests</th>
                  <th className="py-2.5 px-4 text-right">Total Tokens</th>
                  <th className="py-2.5 px-4 text-right">Provider Cost (USD)</th>
                  <th className="py-2.5 px-4 text-right">
                    Internal Credits Charged
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {dashboard.modelBreakdown.map((m) => (
                  <tr key={`${m.provider}-${m.model}`}>
                    <td className="py-2.5 px-4 font-mono font-semibold text-slate-900 dark:text-white">
                      {m.model}
                    </td>
                    <td className="py-2.5 px-4 uppercase font-semibold text-slate-500">
                      {m.provider}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                      {m.requests}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                      {m.totalTokens.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-amber-600">
                      ${m.usdCost.toFixed(6)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-emerald-600">
                      {m.creditsCharged} cr
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-heading font-bold text-slate-900 dark:text-white">
              Individual User API Consumption (OpenAI vs Gemini)
            </h2>
            <span className="text-xs font-mono text-slate-400">
              {usersSortedBySpend.length} accounts
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-slate-500">
                  <th className="py-2.5 px-4">#</th>
                  <th className="py-2.5 px-4">User</th>
                  <th className="py-2.5 px-3 text-right">Requests</th>
                  <th className="py-2.5 px-3 text-right">Tokens</th>
                  <th className="py-2.5 px-3 text-right">OpenAI (USD)</th>
                  <th className="py-2.5 px-3 text-right">Gemini (USD)</th>
                  <th className="py-2.5 px-3 text-right">Total API (USD)</th>
                  <th className="py-2.5 px-4 text-right">Credits Used</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {usersSortedBySpend.map((u, i) => (
                  <tr key={u.id}>
                    <td className="py-2.5 px-4 font-mono text-slate-500">
                      {i + 1}
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-white">
                      {u.fullName}{' '}
                      <span className="font-mono text-slate-400 font-normal">
                        ({u.email})
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {u.apiRequests ?? 0}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {(u.totalTokens ?? 0).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                      ${(u.openaiUsdCost ?? 0).toFixed(4)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-sky-600 dark:text-sky-400">
                      ${(u.geminiUsdCost ?? 0).toFixed(4)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                      ${(u.totalUsdCost ?? 0).toFixed(4)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold tabular-nums text-emerald-600">
                      {u.creditsUsed} cr
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

  /* ==========================================================================
   * 7. PROVIDER BILLING, SPEND CAPS & CONNECTIVITY (`admin-openai-billing`)
   * ======================================================================== */
  if (section === 'admin-openai-billing') {
    const providerErrors = dashboard.providerErrors ?? [];
    const activeOpenAIDiag = providerDiagResult?.openai || openAITestResult;

    return (
      <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white">
            Provider API Billing, Spend Caps & Connectivity
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {kpis.walletSourceLabel} · Separate OpenAI & Google Gemini USD tracking with daily and monthly hard caps.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
            <p className="text-xs text-slate-500">OpenAI API Spend (USD)</p>
            <p className="text-2xl font-mono font-extrabold tabular-nums text-emerald-700 dark:text-emerald-400 mt-1">
              ${kpis.openaiUsedUsd.toFixed(4)}
            </p>
            <p className="text-[11px] font-mono text-slate-400 mt-0.5">
              Today: ${(kpis.openaiTodayUsd ?? 0).toFixed(4)} USD
            </p>
          </div>
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
            <p className="text-xs text-slate-500">Gemini API Spend (USD)</p>
            <p className="text-2xl font-mono font-extrabold tabular-nums text-sky-600 dark:text-sky-400 mt-1">
              ${(kpis.geminiUsedUsd ?? 0).toFixed(4)}
            </p>
            <p className="text-[11px] font-mono text-slate-400 mt-0.5">
              Today: ${(kpis.geminiTodayUsd ?? 0).toFixed(4)} USD
            </p>
          </div>
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
            <p className="text-xs text-slate-500">Purchased OpenAI Budget</p>
            <p className="text-2xl font-mono font-extrabold tabular-nums text-slate-900 dark:text-white mt-1">
              ${kpis.openaiPurchasedUsd.toFixed(2)}
            </p>
            <p className="text-[11px] font-mono text-slate-400 mt-0.5">
              Admin reconciled wallet
            </p>
          </div>
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
            <p className="text-xs text-slate-500">OpenAI Balance (Est.)</p>
            <p className="text-2xl font-mono font-extrabold tabular-nums text-emerald-600 mt-1">
              ${kpis.openaiRemainingEstimatedUsd.toFixed(4)}
            </p>
            <p className="text-[11px] font-mono text-slate-400 mt-0.5">
              {openaiRemainingPct}% remaining
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <h2 className="text-sm font-heading font-bold text-slate-900 dark:text-white">
            Configure Purchased Budget, Daily Cap, Monthly Hard Cap & Alert Threshold
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div>
              <label className="block text-slate-500 mb-1">
                Purchased OpenAI Credit (USD)
              </label>
              <input
                type="number"
                step="0.01"
                value={draftConfig.openaiWallet.purchasedUsd}
                onChange={(e) =>
                  setDraftConfig({
                    ...draftConfig,
                    openaiWallet: {
                      ...draftConfig.openaiWallet,
                      purchasedUsd: Number(e.target.value),
                    },
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">
                Daily Spend Hard Cap (USD)
              </label>
              <input
                type="number"
                step="0.01"
                value={draftConfig.openaiWallet.dailySpendLimitUsd ?? 15}
                onChange={(e) =>
                  setDraftConfig({
                    ...draftConfig,
                    openaiWallet: {
                      ...draftConfig.openaiWallet,
                      dailySpendLimitUsd: Number(e.target.value),
                    },
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">
                Monthly Spend Hard Cap (USD)
              </label>
              <input
                type="number"
                step="0.01"
                value={draftConfig.openaiWallet.monthlySpendLimitUsd}
                onChange={(e) =>
                  setDraftConfig({
                    ...draftConfig,
                    openaiWallet: {
                      ...draftConfig.openaiWallet,
                      monthlySpendLimitUsd: Number(e.target.value),
                    },
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">
                Alert Threshold (%)
              </label>
              <input
                type="number"
                min={10}
                max={100}
                value={draftConfig.openaiWallet.alertThresholdPct}
                onChange={(e) =>
                  setDraftConfig({
                    ...draftConfig,
                    openaiWallet: {
                      ...draftConfig.openaiWallet,
                      alertThresholdPct: Number(e.target.value),
                    },
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-sm"
              />
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-4 space-y-3 text-xs text-slate-600 dark:text-slate-300">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div>
                  <strong>OpenAI API Status:</strong>{' '}
                  {capabilities.openaiLiveVerified
                    ? 'Live Verified (OPENAI_API_KEY Active · Strict Provider Isolation)'
                    : capabilities.openaiConfigured
                    ? `OPENAI_API_KEY Present · Unverified (${
                        capabilities.openaiDiscovery?.message ||
                        'Check API key in Settings > Secrets'
                      })`
                    : 'OPENAI_API_KEY Not Set in Server Environment'}
                </div>
                <div className="text-[11px] text-slate-500">
                  Note: OpenAI API model access depends on your API organization tier & prepaid API credits, not consumer ChatGPT Plus/Pro subscriptions.
                </div>
              </div>
              {(onTestProviders || onTestOpenAI) && (
                <button
                  type="button"
                  disabled={testingOpenAI}
                  onClick={async () => {
                    setTestingOpenAI(true);
                    try {
                      if (onTestProviders) {
                        const diag = await onTestProviders();
                        setProviderDiagResult(diag);
                      } else if (onTestOpenAI) {
                        const res = await onTestOpenAI();
                        setOpenAITestResult(res);
                      }
                    } finally {
                      setTestingOpenAI(false);
                    }
                  }}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${
                      testingOpenAI ? 'animate-spin' : ''
                    }`}
                  />
                  <span>
                    {testingOpenAI
                      ? 'Testing Providers...'
                      : 'Test OpenAI & Gemini Connectivity'}
                  </span>
                </button>
              )}
            </div>

            {activeOpenAIDiag && (
              <div
                className={`rounded-xl border p-3 space-y-1.5 ${
                  activeOpenAIDiag.ok
                    ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                    : 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 font-semibold">
                  <span>
                    {activeOpenAIDiag.ok
                      ? 'OpenAI API Live Connection Verified'
                      : `OpenAI API Connection Failed${
                          activeOpenAIDiag.status
                            ? ` (HTTP ${activeOpenAIDiag.status})`
                            : ''
                        }`}
                  </span>
                  <span className="font-mono text-[11px]">
                    {activeOpenAIDiag.latencyMs} ms
                  </span>
                </div>
                <p className="text-xs leading-relaxed">
                  {activeOpenAIDiag.message}
                </p>
                {providerDiagResult?.openai ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 font-mono text-[11px] opacity-90">
                    <div>
                      Reasoning:{' '}
                      {providerDiagResult.openai.categorizedModels.reasoning.join(
                        ', '
                      ) || 'None'}
                    </div>
                    <div>
                      Standard:{' '}
                      {providerDiagResult.openai.categorizedModels.standard.join(
                        ', '
                      ) || 'None'}
                    </div>
                    <div>
                      Economical:{' '}
                      {providerDiagResult.openai.categorizedModels.economical.join(
                        ', '
                      ) || 'None'}
                    </div>
                    <div>
                      Image / Realtime:{' '}
                      {[
                        ...providerDiagResult.openai.categorizedModels.image,
                        ...providerDiagResult.openai.categorizedModels.realtime,
                      ].join(', ') || 'None'}
                    </div>
                  </div>
                ) : (
                  activeOpenAIDiag.availableTargetModels.length > 0 && (
                    <p className="font-mono text-[11px] opacity-90">
                      Verified Models:{' '}
                      {activeOpenAIDiag.availableTargetModels.join(', ')}
                    </p>
                  )
                )}
              </div>
            )}

            {providerDiagResult?.gemini && (
              <div
                className={`rounded-xl border p-3 space-y-1.5 ${
                  providerDiagResult.gemini.ok
                    ? 'bg-sky-50/70 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800 text-sky-900 dark:text-sky-200'
                    : 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 font-semibold">
                  <span>
                    {providerDiagResult.gemini.ok
                      ? 'Google Gemini API Live Connection Verified'
                      : 'Google Gemini API Connection Failed'}
                  </span>
                  <span className="font-mono text-[11px]">
                    {providerDiagResult.gemini.latencyMs} ms
                  </span>
                </div>
                <p className="text-xs leading-relaxed">
                  {providerDiagResult.gemini.message}
                </p>
                {providerDiagResult.gemini.availableModels.length > 0 && (
                  <p className="font-mono text-[11px] opacity-90">
                    Available Gemini Models:{' '}
                    {providerDiagResult.gemini.availableModels.join(', ')}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end items-center gap-3">
            {configSaved && (
              <span className="text-xs font-semibold text-emerald-600">
                Billing Guardrails Saved!
              </span>
            )}
            <button
              type="button"
              onClick={async () => {
                await onSaveConfig(draftConfig);
                setConfigSaved(true);
                setTimeout(() => setConfigSaved(false), 2000);
              }}
              className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Billing Guardrails</span>
            </button>
          </div>
        </div>

        {/* Provider Connectivity & API Errors Log */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-heading font-bold text-slate-900 dark:text-white">
                Provider Connectivity & API Error Log
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Every failed OpenAI or Gemini call is logged here with sanitized error details and triggers an automatic 100% user credit refund.
              </p>
            </div>
            <span className="text-xs font-mono text-slate-400">
              {providerErrors.length} recent errors
            </span>
          </div>
          {providerErrors.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">
              No provider API errors recorded.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-slate-500">
                    <th className="py-2.5 px-4">Timestamp</th>
                    <th className="py-2.5 px-3">Provider</th>
                    <th className="py-2.5 px-3">Model</th>
                    <th className="py-2.5 px-3">Status / Code</th>
                    <th className="py-2.5 px-4">Sanitized Error Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {providerErrors.map((err) => (
                    <tr key={err.id}>
                      <td className="py-2 px-4 font-mono text-slate-500 whitespace-nowrap">
                        {new Date(err.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2 px-3 font-mono uppercase font-semibold text-slate-700 dark:text-slate-300">
                        {err.provider}
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-300">
                        {err.model}
                      </td>
                      <td className="py-2 px-3 font-mono text-rose-600 whitespace-nowrap">
                        {err.status ? `HTTP ${err.status}` : 'ERR'}
                        {err.errorCode ? ` · ${err.errorCode}` : ''}
                      </td>
                      <td className="py-2 px-4 text-slate-600 dark:text-slate-300 max-w-md truncate">
                        {err.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ==========================================================================
   * 8. MODALITY LOGS (`admin-chat-logs` | `admin-image-logs` | `admin-pdf-logs`)
   * ======================================================================== */
  if (
    section === 'admin-chat-logs' ||
    section === 'admin-image-logs' ||
    section === 'admin-pdf-logs'
  ) {
    const modeFilter =
      section === 'admin-image-logs'
        ? 'image'
        : section === 'admin-pdf-logs'
        ? 'pdf'
        : 'chat';

    const logs = dashboard.activityLogs.filter((l) => {
      const modeMatches =
        modeFilter === 'chat'
          ? l.mode === 'chat' || l.mode === 'search' || l.mode === 'voice'
          : l.mode === modeFilter;
      if (!modeMatches) return false;
      const q = (globalSearch || logSearch).trim().toLowerCase();
      if (!q) return true;
      return (
        l.content.toLowerCase().includes(q) ||
        l.userName.toLowerCase().includes(q) ||
        l.userEmail.toLowerCase().includes(q)
      );
    });

    const titleMap = {
      'admin-chat-logs': 'Chat, Web Search & Voice Logs',
      'admin-image-logs': 'Image Generation & Vision Logs',
      'admin-pdf-logs': 'PDF & Document Analysis Logs',
    };

    return (
      <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white">
              {titleMap[section]}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Live activity stream recorded across platform sessions ({logs.length} entries).
            </p>
          </div>
          <input
            type="text"
            value={logSearch}
            onChange={(e) => setLogSearch(e.target.value)}
            placeholder="Filter logs by user or content..."
            className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs w-64"
          />
        </div>

        {logs.length === 0 ? (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center text-xs text-slate-400">
            No {modeFilter.toUpperCase()} logs recorded yet. Run a request in the User Workspace to populate live entries.
          </div>
        ) : (
          <div className="space-y-3">
            {logs.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-2 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-slate-500">
                  <span>
                    <strong className="text-slate-900 dark:text-white">
                      {item.userName}
                    </strong>{' '}
                    ({item.userEmail}) ·{' '}
                    <span className="uppercase font-mono">{item.role}</span> ·{' '}
                    <span className="font-mono">{item.model}</span>
                  </span>
                  <span className="font-mono tabular-nums">
                    {item.creditsCharged > 0 && `${item.creditsCharged} cr · `}
                    {new Date(item.createdAt).toLocaleString()}
                  </span>
                </div>
                {item.attachmentNames.length > 0 && (
                  <div className="text-[11px] font-mono text-emerald-600">
                    Attachments: {item.attachmentNames.join(', ')}
                  </div>
                )}
                <p className="text-slate-800 dark:text-slate-200 line-clamp-3 whitespace-pre-wrap">
                  {item.content}
                </p>
                {item.imageDataUrl && (
                  <img
                    src={item.imageDataUrl}
                    alt="Generated asset"
                    referrerPolicy="no-referrer"
                    className="h-36 rounded-xl border border-slate-200 dark:border-slate-700 object-cover mt-2"
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ==========================================================================
   * 9. ANNOUNCEMENTS BROADCASTER (`admin-announcements`)
   * ======================================================================== */
  if (section === 'admin-announcements') {
    return (
      <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white">
            Platform Announcements
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Broadcast real-time notifications to every QAAGA AGENT user&apos;s inbox bell.
          </p>
        </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!annTitle.trim() || !annDetail.trim()) return;
            await onBroadcastAnnouncement(annTitle.trim(), annDetail.trim());
            setAnnTitle('');
            setAnnDetail('');
            setAnnSent(true);
            setTimeout(() => setAnnSent(false), 2500);
          }}
          className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Announcement Headline
            </label>
            <input
              type="text"
              required
              value={annTitle}
              onChange={(e) => setAnnTitle(e.target.value)}
              placeholder="e.g. Ramadan Bonus: +20% Extra Credits on 100 & 200 BDT Packs"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Message Details
            </label>
            <textarea
              rows={3}
              required
              value={annDetail}
              onChange={(e) => setAnnDetail(e.target.value)}
              placeholder="Write your announcement message for all registered users..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
            />
          </div>

          <div className="flex items-center justify-between">
            {annSent ? (
              <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> Delivered to all{' '}
                {kpis.totalUsers} users!
              </span>
            ) : (
              <span className="text-xs text-slate-400">
                Recipients: {kpis.totalUsers} accounts
              </span>
            )}
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Broadcast Announcement</span>
            </button>
          </div>
        </form>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
          <h2 className="text-sm font-heading font-bold text-slate-900 dark:text-white">
            Recent Broadcasts
          </h2>
          {dashboard.announcements.length === 0 ? (
            <p className="text-xs text-slate-400 py-4">
              No announcements broadcast yet.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {dashboard.announcements.map((a) => (
                <div key={a.id} className="py-3 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="font-bold text-slate-900 dark:text-white">
                      {a.title}
                    </span>
                    <span className="text-slate-400 font-mono">
                      {new Date(a.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300">
                    {a.detail}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ==========================================================================
   * 9B. DEDICATED LOGO ICON & FAVICON STUDIO (`admin-branding`)
   * ======================================================================== */
  if (section === 'admin-branding') {
    return (
      <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white">
            Logo Icon & Favicon Studio
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Upload or link custom brand icons for your website header, sidebar, chat assistant, and browser tab favicon.
          </p>
        </div>

        {renderBrandingManagerCard()}
      </div>
    );
  }

  /* ==========================================================================
   * 10. PLATFORM SETTINGS, MFS NUMBERS, MODELS & AUDIT LOGS (`admin-models` | `admin-audit`)
   * ======================================================================== */
  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
      <div>
        <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white">
          Platform Settings, Branding, MFS Numbers, Models & Audit Trail
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Customize Logo Icon & Favicon, configure bKash / Nagad / Rocket merchant numbers, toggle AI tools & models, and review security audit logs.
        </p>
      </div>

      {/* Brand Identity (Logo Icon & Favicon) */}
      {renderBrandingManagerCard()}

      {/* Receiver Numbers */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
        <h2 className="text-sm font-heading font-bold text-slate-900 dark:text-white">
          Administrator MFS Receiver Numbers (Shown on User Recharge Page)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {(['bKash', 'Nagad', 'Rocket'] as const).map((m) => (
            <div key={m}>
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                {m} Receiver Number
              </label>
              <input
                type="text"
                value={draftConfig.receiverNumbers[m]}
                onChange={(e) =>
                  setDraftConfig({
                    ...draftConfig,
                    receiverNumbers: {
                      ...draftConfig.receiverNumbers,
                      [m]: e.target.value,
                    },
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-xs"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Tool Switches */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
        <h2 className="text-sm font-heading font-bold text-slate-900 dark:text-white">
          AI Feature Switches
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
          {(
            [
              ['imageGeneration', 'Image Generation'],
              ['imageAnalysis', 'Vision Analysis'],
              ['pdfAnalysis', 'PDF / Docs'],
              ['webSearch', 'Web Search'],
              ['voiceChat', 'Voice STT/TTS'],
            ] as const
          ).map(([key, label]) => {
            const on = draftConfig.toolsEnabled[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() =>
                  setDraftConfig({
                    ...draftConfig,
                    toolsEnabled: { ...draftConfig.toolsEnabled, [key]: !on },
                  })
                }
                className={`p-3 rounded-xl border text-left cursor-pointer ${
                  on
                    ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30'
                    : 'border-slate-200 dark:border-slate-700 opacity-60'
                }`}
              >
                <div className="font-bold text-slate-900 dark:text-white">
                  {label}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {on ? 'Enabled' : 'Disabled'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Models */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-heading font-bold text-slate-900 dark:text-white">
              OpenAI & Google Gemini Model Catalog, Pricing & Credit Rates
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Enable or disable models, set user credit charges per request/1K tokens, and configure provider USD rates. End users only see models that are both Enabled and Live Available.
            </p>
          </div>
        </div>

        <div className="space-y-2.5">
          {draftConfig.models.map((m, idx) => {
            const isLiveAvailable = m.available !== false;
            return (
              <div
                key={m.id}
                className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-900 dark:text-white">
                      {m.label}
                    </span>
                    <span className="font-mono text-slate-400">({m.id})</span>
                    <span
                      className={`px-1.5 py-0.5 rounded font-mono text-[10px] uppercase font-bold ${
                        m.provider === 'openai'
                          ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                          : 'bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300'
                      }`}
                    >
                      {m.provider}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[10px] uppercase text-slate-600 dark:text-slate-300">
                      {m.tier || m.category}
                    </span>
                    <span
                      className={`font-mono text-[10.5px] font-semibold ${
                        isLiveAvailable
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {isLiveAvailable ? '● Live Ready' : '○ Key / Tier Locked'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {m.description}
                    {m.availabilityNote ? ` — ${m.availabilityNote}` : ''}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <label className="flex items-center gap-1">
                    <span className="text-slate-500">Base cr:</span>
                    <input
                      type="number"
                      min={1}
                      value={m.baseCreditCost}
                      onChange={(e) => {
                        const next = [...draftConfig.models];
                        next[idx] = {
                          ...m,
                          baseCreditCost: Number(e.target.value),
                        };
                        setDraftConfig({ ...draftConfig, models: next });
                      }}
                      className="w-14 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
                    />
                  </label>
                  <label className="flex items-center gap-1">
                    <span className="text-slate-500">Cr/1K:</span>
                    <input
                      type="number"
                      min={0}
                      value={m.creditsPer1kTokens}
                      onChange={(e) => {
                        const next = [...draftConfig.models];
                        next[idx] = {
                          ...m,
                          creditsPer1kTokens: Number(e.target.value),
                        };
                        setDraftConfig({ ...draftConfig, models: next });
                      }}
                      className="w-14 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
                    />
                  </label>
                  <label className="flex items-center gap-1">
                    <span className="text-slate-500">In $/1M:</span>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={m.inputUsdPer1M}
                      onChange={(e) => {
                        const next = [...draftConfig.models];
                        next[idx] = {
                          ...m,
                          inputUsdPer1M: Number(e.target.value),
                        };
                        setDraftConfig({ ...draftConfig, models: next });
                      }}
                      className="w-16 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
                    />
                  </label>
                  <label className="flex items-center gap-1">
                    <span className="text-slate-500">Out $/1M:</span>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={m.outputUsdPer1M}
                      onChange={(e) => {
                        const next = [...draftConfig.models];
                        next[idx] = {
                          ...m,
                          outputUsdPer1M: Number(e.target.value),
                        };
                        setDraftConfig({ ...draftConfig, models: next });
                      }}
                      className="w-16 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const next = [...draftConfig.models];
                      next[idx] = { ...m, enabled: !m.enabled };
                      setDraftConfig({ ...draftConfig, models: next });
                    }}
                    className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer ${
                      m.enabled
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {m.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end items-center gap-3 pt-2">
          {configSaved && (
            <span className="text-xs font-semibold text-emerald-600">
              Settings Saved!
            </span>
          )}
          <button
            type="button"
            onClick={async () => {
              await onSaveConfig(draftConfig);
              setConfigSaved(true);
              setTimeout(() => setConfigSaved(false), 2000);
            }}
            className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save All Settings</span>
          </button>
        </div>
      </div>

      {/* Audit Logs */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-heading font-bold text-slate-900 dark:text-white">
            Immutable Security Audit Logs
          </h2>
          <span className="text-xs text-slate-400 font-mono">
            {dashboard.auditLogs.length} events
          </span>
        </div>
        <div className="overflow-x-auto max-h-80">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-slate-500">
                <th className="py-2.5 px-4">Timestamp</th>
                <th className="py-2.5 px-4">Actor</th>
                <th className="py-2.5 px-4">Action</th>
                <th className="py-2.5 px-4">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {dashboard.auditLogs.map((a) => (
                <tr key={a.id}>
                  <td className="py-2 px-4 font-mono text-slate-500 whitespace-nowrap">
                    {new Date(a.createdAt).toLocaleString()}
                  </td>
                  <td className="py-2 px-4 font-mono">{a.actorEmail}</td>
                  <td className="py-2 px-4 font-mono font-bold text-emerald-600">
                    {a.action}
                  </td>
                  <td className="py-2 px-4 font-mono text-[11px] text-slate-500 truncate max-w-xs">
                    {a.detailsJson || '—'}
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
