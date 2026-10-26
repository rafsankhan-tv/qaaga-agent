import React, { useEffect, useRef, useState } from 'react';
import {
  Home,
  Users,
  CheckCircle2,
  CreditCard,
  Crown,
  BarChart3,
  Database,
  MessageSquare,
  Image as ImageIcon,
  FileText,
  Megaphone,
  Settings,
  Search,
  Calendar,
  Bell,
  ChevronDown,
  ArrowRight,
  Menu,
  X,
  Sun,
  Moon,
  LogOut,
  Check,
} from 'lucide-react';
import type {
  AdminDashboardDTO,
  NavSection,
  WorkspacePayload,
} from '../types/qaaga';
import { QaagaLogo, UserAvatarBadge } from './BrandIcons';

interface AdminPortalLayoutProps {
  workspace: WorkspacePayload;
  dashboard: AdminDashboardDTO | null;
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  globalSearch: string;
  onChangeGlobalSearch: (q: string) => void;
  selectedModelId: string;
  onSelectModel: (id: string) => void;
  onToggleTheme: () => void;
  onMarkNotificationsRead: () => void;
  onSwitchToUserSite: () => void;
  onLogout: () => void;
  children: React.ReactNode;
}

export function AdminPortalLayout({
  workspace,
  dashboard,
  activeSection,
  onSelectSection,
  globalSearch,
  onChangeGlobalSearch,
  selectedModelId,
  onSelectModel,
  onToggleTheme,
  onMarkNotificationsRead,
  onSwitchToUserSite,
  onLogout,
  children,
}: AdminPortalLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [dateWindow, setDateWindow] = useState<'30d' | '7d' | 'all'>('30d');

  const modelRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) {
        setModelOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (
        profileRef.current &&
        !profileRef.current.contains(e.target as Node)
      ) {
        setProfileOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const totalPendingApprovals = dashboard
    ? dashboard.kpis.pendingUsers + dashboard.kpis.pendingPaymentsCount
    : 0;

  const navItems: Array<{
    id: NavSection;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    { id: 'admin-overview', label: 'Dashboard', Icon: Home },
    { id: 'admin-users', label: 'Users', Icon: Users },
    {
      id: 'admin-approvals',
      label: 'Approvals',
      Icon: CheckCircle2,
      badge: totalPendingApprovals,
    },
    { id: 'admin-payments', label: 'Payments', Icon: CreditCard },
    { id: 'admin-pricing', label: 'Plans', Icon: Crown },
    { id: 'admin-api-usage', label: 'API Usage', Icon: BarChart3 },
    { id: 'admin-openai-billing', label: 'OpenAI Billing', Icon: Database },
    { id: 'admin-chat-logs', label: 'Chat Logs', Icon: MessageSquare },
    { id: 'admin-image-logs', label: 'Image Logs', Icon: ImageIcon },
    { id: 'admin-pdf-logs', label: 'PDF Logs', Icon: FileText },
    { id: 'admin-announcements', label: 'Announcements', Icon: Megaphone },
    { id: 'admin-models', label: 'Settings', Icon: Settings },
  ];

  const enabledModels = workspace.config.models.filter((m) => m.enabled);
  const activeModel =
    enabledModels.find((m) => m.id === selectedModelId) ||
    enabledModels[0] ||
    workspace.config.models[0];

  const unreadNotifs = workspace.notifications.filter((n) => !n.isRead).length;

  const dateRangeLabel = (() => {
    const end = new Date();
    const days = dateWindow === '7d' ? 7 : 30;
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    if (dateWindow === 'all') return 'All Time Telemetry';
    return `${start.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })} - ${end.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })}`;
  })();

  const renderSidebar = () => (
    <div className="flex flex-col h-full w-[256px] bg-white dark:bg-[#0D1425] border-r border-slate-200/90 dark:border-slate-800 select-none">
      {/* Brand Lockup */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 shrink-0">
        <button
          type="button"
          onClick={() => {
            onSelectSection('admin-overview');
            setMobileOpen(false);
          }}
          className="flex items-center gap-2.5 cursor-pointer"
        >
          <QaagaLogo className="w-8 h-8" />
          <span className="font-heading font-extrabold text-[15px] tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
            QAAGA AGENT
          </span>
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 border-l border-slate-200 dark:border-slate-700 pl-2">
            Admin
          </span>
        </button>

        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
          aria-label="Close menu"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Navigation List */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        {navItems.map(({ id, label, Icon, badge }) => {
          const active = activeSection === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                onSelectSection(id);
                setMobileOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[13.5px] transition-colors cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-900 dark:text-emerald-300 font-bold'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 font-medium'
              }`}
            >
              <span className="flex items-center gap-3 min-w-0">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    active
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                />
                <span className="truncate">{label}</span>
              </span>
              {typeof badge === 'number' && badge > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-rose-500 text-white text-[11px] font-mono font-bold tabular-nums">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Grow QAAGA AGENT Footer Card -> View Site */}
      <div className="p-3 border-t border-slate-100 dark:border-slate-800/80 shrink-0">
        <div className="rounded-2xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 p-3.5 space-y-3">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Crown className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-heading font-bold text-slate-900 dark:text-white">
                Grow QAAGA AGENT
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
                Manage users, credits, payments and more — all in one place.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onSwitchToUserSite}
            className="w-full py-2 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <span>View Site</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-[#F5F7FA] dark:bg-[#0B1120] text-slate-900 dark:text-slate-100">
      <aside className="hidden lg:block shrink-0 h-full">{renderSidebar()}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-[1px]"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-10 h-full">{renderSidebar()}</div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top Admin Header */}
        <header className="h-16 bg-white dark:bg-[#111827] border-b border-slate-200/90 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-4 shrink-0 z-20">
          {/* Left: Mobile Menu + Model Selector */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
              aria-label="Open admin navigation"
            >
              <Menu className="w-4 h-4" />
            </button>

            <div className="relative" ref={modelRef}>
              <button
                type="button"
                onClick={() => setModelOpen((o) => !o)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 cursor-pointer whitespace-nowrap"
              >
                <span className="truncate max-w-[160px]">
                  {activeModel?.id || 'gpt-4o'}
                </span>
                <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                  · Default
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {modelOpen && (
                <div className="absolute left-0 mt-2 w-72 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg p-1.5 z-50">
                  {enabledModels.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        onSelectModel(m.id);
                        setModelOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between gap-2 text-xs cursor-pointer"
                    >
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {m.label}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Base {m.baseCreditCost} cr · ${m.inputUsdPer1M}/1M in
                        </div>
                      </div>
                      {m.id === activeModel?.id && (
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Center: Global Search Input */}
          <div className="hidden md:flex flex-1 max-w-md relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              ref={searchInputRef}
              type="text"
              value={globalSearch}
              onChange={(e) => onChangeGlobalSearch(e.target.value)}
              placeholder="Search users, payments, logs, plans..."
              className="w-full pl-9 pr-14 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-emerald-600"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-mono text-slate-400">
              ⌘ K
            </span>
          </div>

          {/* Right: Date Window + Theme + Notifications + Admin Profile */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() =>
                setDateWindow((prev) =>
                  prev === '30d' ? '7d' : prev === '7d' ? 'all' : '30d'
                )
              }
              className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 cursor-pointer whitespace-nowrap"
            >
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span className="tabular-nums">{dateRangeLabel}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            <button
              type="button"
              onClick={onToggleTheme}
              title="Toggle Light / Dark Mode"
              className="p-2 rounded-xl text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              {workspace.user.theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>

            {/* Notifications */}
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => {
                  const next = !notifOpen;
                  setNotifOpen(next);
                  if (next && unreadNotifs > 0) onMarkNotificationsRead();
                }}
                className="relative p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadNotifs > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500" />
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg p-2 z-50">
                  <div className="px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-800 flex justify-between text-xs font-bold">
                    <span>Admin Notifications</span>
                    <span className="text-slate-400 font-mono">
                      {workspace.notifications.length}
                    </span>
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {workspace.notifications.length === 0 ? (
                      <p className="p-4 text-xs text-slate-400 text-center">
                        No notifications
                      </p>
                    ) : (
                      workspace.notifications.map((n) => (
                        <div key={n.id} className="px-2.5 py-2">
                          <p className="text-xs font-semibold text-slate-900 dark:text-white">
                            {n.title}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {n.detail}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Admin Profile Menu */}
            <div className="relative" ref={profileRef}>
              <button
                type="button"
                onClick={() => setProfileOpen((o) => !o)}
                className="flex items-center gap-2.5 pl-1.5 pr-2.5 py-1 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <UserAvatarBadge
                  name={workspace.user.fullName}
                  role={workspace.user.role}
                />
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                    {workspace.user.fullName}
                  </p>
                  <p className="text-[10.5px] text-slate-500 dark:text-slate-400 leading-tight">
                    Admin
                  </p>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {profileOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg p-1.5 z-50 text-xs">
                  <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                    <p className="font-bold text-slate-900 dark:text-white truncate">
                      {workspace.user.fullName}
                    </p>
                    <p className="font-mono text-[11px] text-slate-500 truncate">
                      {workspace.user.email}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      onSwitchToUserSite();
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 font-medium text-slate-700 dark:text-slate-200 flex items-center justify-between cursor-pointer mt-1"
                  >
                    <span>Switch to User Chat</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      onLogout();
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/40 font-semibold text-rose-600 flex items-center gap-2 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Content Viewport */}
        <main className="flex-1 min-h-0 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
