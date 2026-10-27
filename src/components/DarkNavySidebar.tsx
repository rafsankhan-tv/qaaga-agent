import React, { useEffect, useRef, useState } from 'react';
import {
  SquarePen,
  Search,
  PanelLeftClose,
  Clock,
  BookOpen,
  Compass,
  MoreHorizontal,
  Folder,
  FolderOpen,
  ChevronDown,
  ShieldCheck,
  Users,
  Receipt,
  Sliders,
  Palette,
  Cpu,
  FileSpreadsheet,
  LogIn,
  LogOut,
  Moon,
  Sun,
  CreditCard,
  UserCog,
  X,
} from 'lucide-react';
import type {
  AuthUser,
  ChatSessionDTO,
  CreditSummary,
  NavSection,
} from '../types/qaaga';
import { QaagaLogo, UserAvatarBadge } from './BrandIcons';

interface DarkNavySidebarProps {
  user: AuthUser;
  credits: CreditSummary;
  sessions?: ChatSessionDTO[];
  activeSessionId?: number | null;
  onSelectSession?: (sessionId: number) => void;
  onQuickPrompt?: (prompt: string) => void;
  isGuest?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  activeNav: NavSection;
  onSelectNav: (nav: NavSection) => void;
  onNewChat: () => void;
  onToggleTheme: () => void;
  onLogout: () => void;
  onOpenLogin?: (reasonFeature?: string, pendingNav?: NavSection) => void;
  pendingAdminBadges?: { users: number; payments: number };
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const GUEST_PINNED_CONVERSATIONS = [
  {
    title: 'QAAGA Website Plan',
    prompt: 'Help me structure a clean website and product launch plan step by step.',
  },
  {
    title: 'Greeting exchange',
    prompt: 'Hello! Tell me briefly how QAAGA AGENT can help with my daily work.',
  },
  {
    title: 'Project Memory Comparison',
    prompt: 'Compare different approaches to organizing project notes and team workflows.',
  },
];

export function DarkNavySidebar({
  user,
  credits,
  sessions = [],
  activeSessionId = null,
  onSelectSession,
  onQuickPrompt,
  isGuest = false,
  collapsed = false,
  onToggleCollapse,
  activeNav,
  onSelectNav,
  onNewChat,
  onToggleTheme,
  onLogout,
  onOpenLogin,
  pendingAdminBadges,
  mobileOpen,
  onCloseMobile,
}: DarkNavySidebarProps) {
  const [brandMenuOpen, setBrandMenuOpen] = useState(false);
  const [exploreOpen, setExploreOpen] = useState(false);
  const brandMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (
        brandMenuRef.current &&
        !brandMenuRef.current.contains(e.target as Node)
      ) {
        setBrandMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const go = (nav: NavSection, label: string) => {
    onCloseMobile();
    if (isGuest) {
      if (nav === 'chat') {
        onNewChat();
        return;
      }
      onOpenLogin?.(label, nav);
      return;
    }
    onSelectNav(nav);
  };

  const primaryItems: Array<{
    id: NavSection;
    label: string;
    gateLabel: string;
    Icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      id: 'history',
      label: 'Scheduled',
      gateLabel: 'Chat History & Scheduled',
      Icon: Clock,
    },
    {
      id: 'image-studio',
      label: 'Library',
      gateLabel: 'Image Generation Library',
      Icon: BookOpen,
    },
    {
      id: 'web-search',
      label: 'Plugins',
      gateLabel: 'Live Web Search & Plugins',
      Icon: Compass,
    },
  ];

  const workspaceProjects: Array<{
    id: NavSection;
    label: string;
    gateLabel: string;
  }> = [
    { id: 'pdf-docs', label: 'PDF & Document Lab', gateLabel: 'PDF Analysis' },
    { id: 'voice-studio', label: 'Voice Studio', gateLabel: 'Voice Chat' },
    {
      id: 'credit-dashboard',
      label: 'Usage & Credits',
      gateLabel: 'Usage & Credits',
    },
    {
      id: 'recharge',
      label: 'Recharge & Plans',
      gateLabel: 'Payment / Recharge',
    },
  ];

  const adminItems: Array<{
    id: NavSection;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    { id: 'admin-overview', label: 'Admin Dashboard', Icon: ShieldCheck },
    {
      id: 'admin-users',
      label: 'Users & Approvals',
      Icon: Users,
      badge: pendingAdminBadges?.users,
    },
    {
      id: 'admin-payments',
      label: 'Payment Screenshots',
      Icon: Receipt,
      badge: pendingAdminBadges?.payments,
    },
    { id: 'admin-pricing', label: 'Packages & Rates', Icon: Sliders },
    { id: 'admin-branding', label: 'Logo & Favicon', Icon: Palette },
    { id: 'admin-models', label: 'Models & Limits', Icon: Cpu },
    { id: 'admin-audit', label: 'Audit Logs', Icon: FileSpreadsheet },
  ];

  const pinnedFolderTitle = isGuest
    ? 'qaaga workspace'
    : (user.fullName || 'workspace').toLowerCase();

  const renderContent = () => (
    <div className="flex flex-col h-full w-[260px] bg-[#F9F9F9] dark:bg-[#0D1117] text-[#171717] dark:text-slate-200 border-r border-black/[0.06] dark:border-slate-800/90 select-none">
      {/* Top Brand + Search + Collapse Row */}
      <div className="h-14 px-3 flex items-center justify-between shrink-0">
        <div className="relative" ref={brandMenuRef}>
          <button
            type="button"
            onClick={() => setBrandMenuOpen((o) => !o)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-black/[0.05] dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <QaagaLogo className="w-6 h-6 shrink-0" />
            <span className="font-heading font-semibold text-[15px] tracking-[-0.01em] text-slate-900 dark:text-white whitespace-nowrap">
              QAAGA AGENT
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>

          {brandMenuOpen && (
            <div className="absolute left-0 mt-1.5 w-56 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-lg p-1.5 z-50 text-xs">
              <button
                type="button"
                onClick={() => {
                  setBrandMenuOpen(false);
                  onNewChat();
                  onCloseMobile();
                }}
                className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2.5 cursor-pointer"
              >
                <SquarePen className="w-3.5 h-3.5 text-slate-500" />
                <span>Start New Chat</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setBrandMenuOpen(false);
                  go('recharge', 'Recharge Plans');
                }}
                className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2.5 cursor-pointer"
              >
                <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                <span>Recharge Plans (BDT)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setBrandMenuOpen(false);
                  onToggleTheme();
                }}
                className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2.5 cursor-pointer"
              >
                {user.theme === 'dark' ? (
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Moon className="w-3.5 h-3.5 text-slate-500" />
                )}
                <span>
                  {user.theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}
                </span>
              </button>

              {!isGuest && (
                <button
                  type="button"
                  onClick={() => {
                    setBrandMenuOpen(false);
                    go('profile', 'Profile Settings');
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2.5 cursor-pointer"
                >
                  <UserCog className="w-3.5 h-3.5 text-slate-500" />
                  <span>Profile Settings</span>
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => go('history', 'Search Conversations')}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
            title="Search conversations"
            aria-label="Search conversations"
          >
            <Search className="w-[17px] h-[17px]" />
          </button>

          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="hidden lg:inline-flex p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
              title="Toggle sidebar"
              aria-label="Toggle sidebar"
            >
              <PanelLeftClose className="w-[17px] h-[17px]" />
            </button>
          )}

          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            aria-label="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Scrollable Navigation + Pinned + Projects */}
      <div className="flex-1 overflow-y-auto px-2.5 py-1 space-y-5">
        {/* Top Action Stack */}
        <nav className="space-y-0.5">
          <button
            type="button"
            onClick={() => {
              onNewChat();
              onCloseMobile();
            }}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13.5px] transition-colors cursor-pointer whitespace-nowrap ${
              activeNav === 'chat' && !activeSessionId
                ? 'bg-[#EAEAEA] dark:bg-slate-800/90 text-slate-900 dark:text-white font-medium'
                : 'text-slate-800 dark:text-slate-200 hover:bg-black/[0.045] dark:hover:bg-white/[0.05]'
            }`}
          >
            <SquarePen className="w-[17px] h-[17px] text-slate-700 dark:text-slate-300 shrink-0" />
            <span>New chat</span>
          </button>

          {primaryItems.map(({ id, label, gateLabel, Icon }) => {
            const active = !isGuest && activeNav === id;
            return (
              <button
                key={label}
                type="button"
                onClick={() => go(id, gateLabel)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13.5px] transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-[#EAEAEA] dark:bg-slate-800/90 text-slate-900 dark:text-white font-medium'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-black/[0.045] dark:hover:bg-white/[0.05]'
                }`}
              >
                <Icon className="w-[17px] h-[17px] text-slate-600 dark:text-slate-400 shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setExploreOpen((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-[13.5px] text-slate-700 dark:text-slate-300 hover:bg-black/[0.045] dark:hover:bg-white/[0.05] transition-colors cursor-pointer whitespace-nowrap"
          >
            <span className="flex items-center gap-3">
              <MoreHorizontal className="w-[17px] h-[17px] text-slate-600 dark:text-slate-400 shrink-0" />
              <span>Explore</span>
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                exploreOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {exploreOpen && (
            <div className="pl-7 pr-1 py-1 space-y-0.5">
              {workspaceProjects.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => go(item.id, item.gateLabel)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[13px] transition-colors cursor-pointer truncate ${
                    !isGuest && activeNav === item.id
                      ? 'bg-[#EAEAEA] dark:bg-slate-800 text-slate-900 dark:text-white font-medium'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.04]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </nav>

        {/* Pinned Conversations / Workspace Threads */}
        <div className="space-y-1">
          <div className="px-3 text-[11.5px] font-medium text-slate-400 dark:text-slate-500">
            Pinned
          </div>

          <button
            type="button"
            onClick={() => {
              onNewChat();
              onCloseMobile();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-[13.5px] font-medium text-slate-800 dark:text-slate-200 hover:bg-black/[0.045] dark:hover:bg-white/[0.05] transition-colors cursor-pointer"
          >
            <FolderOpen className="w-[16px] h-[16px] text-slate-600 dark:text-slate-400 shrink-0" />
            <span className="truncate">{pinnedFolderTitle}</span>
          </button>

          <div className="pl-6 space-y-0.5">
            {!isGuest && sessions.length > 0
              ? sessions.slice(0, 6).map((sess) => {
                  const selected =
                    activeNav === 'chat' && activeSessionId === sess.id;
                  return (
                    <button
                      key={sess.id}
                      type="button"
                      onClick={() => {
                        onCloseMobile();
                        onSelectSession?.(sess.id);
                      }}
                      className={`w-full text-left px-3 py-1.5 rounded-xl text-[13px] truncate transition-colors cursor-pointer ${
                        selected
                          ? 'bg-[#EAEAEA] dark:bg-slate-800/90 text-slate-900 dark:text-white font-medium'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-black/[0.045] dark:hover:bg-white/[0.05]'
                      }`}
                    >
                      {sess.title}
                    </button>
                  );
                })
              : GUEST_PINNED_CONVERSATIONS.map((item) => (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => {
                      onCloseMobile();
                      onQuickPrompt?.(item.prompt);
                    }}
                    className="w-full text-left px-3 py-1.5 rounded-xl text-[13px] text-slate-700 dark:text-slate-300 hover:bg-black/[0.045] dark:hover:bg-white/[0.05] truncate transition-colors cursor-pointer"
                  >
                    {item.title}
                  </button>
                ))}
          </div>
        </div>

        {/* Projects / AI Command Workspaces */}
        <div className="space-y-1">
          <div className="px-3 text-[11.5px] font-medium text-slate-400 dark:text-slate-500">
            Projects
          </div>
          <nav className="space-y-0.5">
            {workspaceProjects.map((proj) => {
              const active = !isGuest && activeNav === proj.id;
              return (
                <button
                  key={proj.id}
                  type="button"
                  onClick={() => go(proj.id, proj.gateLabel)}
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-[13.5px] transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#EAEAEA] dark:bg-slate-800/90 text-slate-900 dark:text-white font-medium'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-black/[0.045] dark:hover:bg-white/[0.05]'
                  }`}
                >
                  <Folder className="w-[16px] h-[16px] text-slate-600 dark:text-slate-400 shrink-0" />
                  <span className="truncate">{proj.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Administrator Console Quick Links (For Admin Users) */}
        {!isGuest && user.role === 'admin' && (
          <div className="pt-2 border-t border-black/[0.06] dark:border-slate-800/80 space-y-1">
            <div className="px-3 text-[11.5px] font-medium text-emerald-700 dark:text-emerald-400">
              Admin Console
            </div>
            <nav className="space-y-0.5">
              {adminItems.map(({ id, label, Icon, badge }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => go(id, label)}
                  className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-[13px] text-slate-700 dark:text-slate-300 hover:bg-black/[0.045] dark:hover:bg-white/[0.05] transition-colors cursor-pointer whitespace-nowrap"
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span className="truncate">{label}</span>
                  </span>
                  {typeof badge === 'number' && badge > 0 && (
                    <span className="text-[11px] font-mono tabular-nums font-semibold text-amber-600 dark:text-amber-300">
                      {badge}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>
        )}
      </div>

      {/* Bottom User Account Footer */}
      <div className="p-2.5 border-t border-black/[0.06] dark:border-slate-800/80 shrink-0">
        {isGuest ? (
          <button
            type="button"
            onClick={() => {
              onCloseMobile();
              onOpenLogin?.();
            }}
            className="w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-xl hover:bg-black/[0.05] dark:hover:bg-white/[0.06] transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-amber-500 text-white font-semibold text-xs flex items-center justify-center shrink-0">
                QA
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-slate-900 dark:text-white truncate">
                  Guest Account
                </p>
                <p className="text-[11.5px] text-slate-500 dark:text-slate-400 truncate">
                  Free Chat · Sign in
                </p>
              </div>
            </div>
            <LogIn className="w-4 h-4 text-slate-400 shrink-0" />
          </button>
        ) : (
          <div className="flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-xl hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition-colors">
            <button
              type="button"
              onClick={() => go('profile', 'Profile Settings')}
              className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
            >
              <UserAvatarBadge
                name={user.fullName}
                role={user.role}
                className="w-8 h-8 shrink-0"
              />
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-slate-900 dark:text-white truncate">
                  {user.fullName}
                </p>
                <p className="text-[11.5px] text-slate-500 dark:text-slate-400 truncate font-mono tabular-nums">
                  {user.isSubscriptionActive
                    ? `Plus · ${credits.remaining} cr`
                    : `${credits.remaining} cr`}
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer shrink-0"
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {!collapsed && (
        <aside className="hidden lg:block shrink-0 h-full">
          {renderContent()}
        </aside>
      )}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-[1px]"
            onClick={onCloseMobile}
          />
          <div className="relative z-10 h-full">{renderContent()}</div>
        </div>
      )}
    </>
  );
}
