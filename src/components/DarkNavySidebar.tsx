import React from 'react';
import {
  MessageSquarePlus,
  History,
  Image as ImageIcon,
  FileText,
  Globe,
  Mic,
  LayoutGrid,
  Crown,
  BarChart3,
  CreditCard,
  UserCog,
  ShieldCheck,
  Users,
  Receipt,
  Sliders,
  Cpu,
  FileSpreadsheet,
  Palette,
  LogIn,
  LogOut,
  Moon,
  Sun,
  ArrowRight,
  X,
} from 'lucide-react';
import type { AuthUser, CreditSummary, NavSection } from '../types/qaaga';
import { QaagaLogo, UserAvatarBadge } from './BrandIcons';

interface DarkNavySidebarProps {
  user: AuthUser;
  credits: CreditSummary;
  isGuest?: boolean;
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

export function DarkNavySidebar({
  user,
  credits,
  isGuest = false,
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

  const aiItems: Array<{
    id: NavSection;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'history', label: 'Chat History', Icon: History },
    { id: 'image-studio', label: 'Image Generation', Icon: ImageIcon },
    { id: 'pdf-docs', label: 'PDF Analysis', Icon: FileText },
    { id: 'web-search', label: 'Web Search', Icon: Globe },
    { id: 'voice-studio', label: 'Voice Chat', Icon: Mic },
    { id: 'credit-dashboard', label: 'All Tools', Icon: LayoutGrid },
  ];

  const billingItems: Array<{
    id: NavSection;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'profile', label: 'My Subscription', Icon: Crown },
    { id: 'credit-dashboard', label: 'Usage & Credits', Icon: BarChart3 },
    { id: 'recharge', label: 'Payment / Recharge', Icon: CreditCard },
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
    { id: 'admin-models', label: 'Models, Tools & Limits', Icon: Cpu },
    { id: 'admin-audit', label: 'Audit Logs', Icon: FileSpreadsheet },
  ];

  const renderContent = () => (
    <div className="flex flex-col h-full w-[256px] bg-white dark:bg-[#0A1124] text-slate-700 dark:text-slate-200 border-r border-slate-200/90 dark:border-slate-800/90 select-none">
      {/* Brand Header */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 shrink-0">
        <button
          type="button"
          onClick={() => {
            onNewChat();
            onCloseMobile();
          }}
          className="flex items-center gap-2.5 text-left cursor-pointer"
        >
          <QaagaLogo className="w-8 h-8" />
          <span className="font-heading font-extrabold text-[15.5px] tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
            QAAGA AGENT
          </span>
        </button>

        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-white"
          aria-label="Close sidebar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* New Chat Primary Action */}
      <div className="px-3 pt-3.5 pb-1 shrink-0">
        <button
          type="button"
          onClick={() => {
            onNewChat();
            onCloseMobile();
          }}
          className={`w-full py-2.5 px-3.5 rounded-xl text-[13.5px] font-semibold flex items-center gap-2.5 transition-colors cursor-pointer whitespace-nowrap ${
            activeNav === 'chat'
              ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 font-bold'
              : 'bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-emerald-50/70 dark:hover:bg-emerald-500/15'
          }`}
        >
          <MessageSquarePlus className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>New Chat</span>
        </button>
      </div>

      {/* Scrollable Menu */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-4">
        <nav className="space-y-0.5">
          {aiItems.map(({ id, label, Icon }) => {
            const active =
              !isGuest && activeNav === id && label !== 'All Tools';
            return (
              <button
                key={label}
                type="button"
                onClick={() => go(id, label)}
                className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-[13px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    active
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-400'
                  }`}
                />
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <nav className="space-y-0.5">
            {billingItems.map(({ id, label, Icon }) => {
              const active = !isGuest && activeNav === id && label !== 'My Subscription';
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => go(id, label)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-[13px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 font-semibold'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      active
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-400'
                    }`}
                  />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <nav className="space-y-0.5">
            <button
              type="button"
              onClick={() => go('profile', 'Profile Settings')}
              className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-[13px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                !isGuest && activeNav === 'profile'
                  ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 font-semibold'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'
              }`}
            >
              <UserCog className="w-4 h-4 text-slate-400 shrink-0" />
              <span>Profile Settings</span>
            </button>

            <button
              type="button"
              onClick={onToggleTheme}
              className="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer whitespace-nowrap"
            >
              {user.theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400 shrink-0" />
              ) : (
                <Moon className="w-4 h-4 text-slate-400 shrink-0" />
              )}
              <span>{user.theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </button>

            {isGuest ? (
              <button
                type="button"
                onClick={() => {
                  onCloseMobile();
                  onOpenLogin?.();
                }}
                className="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-[13px] font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors cursor-pointer whitespace-nowrap"
              >
                <LogIn className="w-4 h-4 shrink-0" />
                <span>Sign In / Register</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onLogout}
                className="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:text-rose-600 hover:bg-rose-50/70 dark:hover:bg-rose-950/30 transition-colors cursor-pointer whitespace-nowrap"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                <span>Logout</span>
              </button>
            )}
          </nav>
        </div>

        {!isGuest && user.role === 'admin' && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <p className="px-2.5 mb-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              Administrator Console
            </p>
            <nav className="space-y-0.5">
              {adminItems.map(({ id, label, Icon, badge }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => go(id, label)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <Icon className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span className="truncate">{label}</span>
                  </span>
                  {typeof badge === 'number' && badge > 0 && (
                    <span className="text-[11px] font-mono tabular-nums font-bold text-amber-600 dark:text-amber-300">
                      {badge}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>
        )}
      </div>

      {/* Bottom Upgrade / View Plans Card */}
      <div className="p-3 border-t border-slate-100 dark:border-slate-800/80 shrink-0">
        {!isGuest && (
          <div className="mb-2.5 flex items-center justify-between px-2 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <UserAvatarBadge name={user.fullName} role={user.role} />
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 dark:text-white truncate">
                  {user.fullName}
                </p>
                <p className="text-[10.5px] text-slate-500 font-mono">
                  {credits.remaining} cr left
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-3.5 space-y-3">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Crown className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-heading font-bold text-slate-900 dark:text-white leading-snug">
                Upgrade for more power and flexibility
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
                Get higher limits, faster responses and more features.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => go('recharge', 'Recharge Plans')}
            className="w-full py-2 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <span>View Plans</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0 h-full">{renderContent()}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-[1px]"
            onClick={onCloseMobile}
          />
          <div className="relative z-10 h-full">{renderContent()}</div>
        </div>
      )}
    </>
  );
}
