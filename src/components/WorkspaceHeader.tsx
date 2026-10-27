import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  ChevronDown,
  Menu,
  PanelLeftOpen,
  LogIn,
  LogOut,
  User as UserIcon,
  ShieldCheck,
  CreditCard,
  Moon,
  Sun,
} from 'lucide-react';
import type { NavSection, WorkspacePayload } from '../types/qaaga';
import { QaagaLogo, UserAvatarBadge } from './BrandIcons';

interface WorkspaceHeaderProps {
  workspace: WorkspacePayload;
  isGuest?: boolean;
  workspaceTab?: 'chat' | 'work';
  onChangeWorkspaceTab?: (tab: 'chat' | 'work') => void;
  sidebarCollapsed?: boolean;
  onExpandSidebar?: () => void;
  selectedModelId: string;
  onSelectModel: (id: string) => void;
  onNavigate: (nav: NavSection) => void;
  onToggleTheme?: () => void;
  onOpenLogin?: (reasonFeature?: string, pendingNav?: NavSection) => void;
  onLogout?: () => void;
  onMarkNotificationsRead: () => void;
  onOpenMobileMenu: () => void;
}

export function WorkspaceHeader({
  workspace,
  isGuest = false,
  workspaceTab = 'work',
  onChangeWorkspaceTab,
  sidebarCollapsed = false,
  onExpandSidebar,
  onNavigate,
  onToggleTheme,
  onOpenLogin,
  onLogout,
  onMarkNotificationsRead,
  onOpenMobileMenu,
}: WorkspaceHeaderProps) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
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
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const unreadCount = workspace.notifications.filter((n) => !n.isRead).length;

  return (
    <header className="h-14 bg-white dark:bg-[#0F1117] px-4 sm:px-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3 shrink-0 z-20">
      {/* Left: Mobile Menu or Collapsed Sidebar Opener */}
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          aria-label="Open menu"
        >
          <Menu className="w-4 h-4" />
        </button>

        {sidebarCollapsed && onExpandSidebar && (
          <button
            type="button"
            onClick={onExpandSidebar}
            className="hidden lg:inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Open sidebar"
          >
            <PanelLeftOpen className="w-4 h-4" />
            <QaagaLogo className="w-5 h-5" />
            <span className="font-heading font-semibold text-sm text-slate-900 dark:text-white">
              QAAGA AGENT
            </span>
          </button>
        )}
      </div>

      {/* Center: Clean Chat | Work Segmented Switcher */}
      <div className="flex items-center justify-center">
        <div
          role="tablist"
          aria-label="Workspace mode"
          className="inline-flex items-center p-1 rounded-full bg-[#EFEFEF] dark:bg-slate-800/90"
        >
          <button
            type="button"
            role="tab"
            aria-selected={workspaceTab === 'chat'}
            onClick={() => {
              onChangeWorkspaceTab?.('chat');
              onNavigate('chat');
            }}
            className={`px-5 py-1 rounded-full text-[13px] font-medium transition-all cursor-pointer ${
              workspaceTab === 'chat'
                ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Chat
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={workspaceTab === 'work'}
            onClick={() => {
              onChangeWorkspaceTab?.('work');
              onNavigate('chat');
            }}
            className={`px-5 py-1 rounded-full text-[13px] font-medium transition-all cursor-pointer ${
              workspaceTab === 'work'
                ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Work
          </button>
        </div>
      </div>

      {/* Right: Mobile Recharge Shortcut, Theme, Notifications & Account */}
      <div className="flex items-center justify-end gap-2 shrink-0">
        <button
          type="button"
          onClick={() => {
            if (isGuest) {
              onOpenLogin?.('Recharge & Plans', 'recharge');
            } else {
              onNavigate('recharge');
            }
          }}
          className="lg:hidden px-3 py-1.5 rounded-full bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
        >
          <CreditCard className="w-3.5 h-3.5" />
          <span>Recharge</span>
        </button>

        {onToggleTheme && (
          <button
            type="button"
            onClick={onToggleTheme}
            className="p-2 rounded-full text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title={
              workspace.user.theme === 'dark' ? 'Light mode' : 'Dark mode'
            }
            aria-label="Toggle theme"
          >
            {workspace.user.theme === 'dark' ? (
              <Sun className="w-[17px] h-[17px] text-amber-400" />
            ) : (
              <Moon className="w-[17px] h-[17px]" />
            )}
          </button>
        )}

        {isGuest ? (
          <button
            type="button"
            onClick={() => onOpenLogin?.()}
            className="px-3.5 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-900 dark:text-white text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            <LogIn className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
            <span>Sign in</span>
          </button>
        ) : (
          <>
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => {
                  const next = !notifOpen;
                  setNotifOpen(next);
                  if (next && unreadCount > 0) onMarkNotificationsRead();
                }}
                className="relative p-2 rounded-full text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                aria-label="Notifications"
              >
                <Bell className="w-[17px] h-[17px]" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500" />
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg p-2 z-50">
                  <div className="px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-800 flex justify-between text-xs font-bold text-slate-900 dark:text-slate-100">
                    <span>Notifications</span>
                    <span className="text-slate-400 font-normal tabular-nums">
                      {workspace.notifications.length}
                    </span>
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {workspace.notifications.length === 0 ? (
                      <p className="p-4 text-xs text-slate-400 text-center">
                        No notifications yet
                      </p>
                    ) : (
                      workspace.notifications.map((n) => (
                        <div key={n.id} className="px-2.5 py-2.5">
                          <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                            {n.title}
                          </p>
                          <p className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                            {n.detail}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="relative" ref={profileRef}>
              <button
                type="button"
                onClick={() => setProfileOpen((o) => !o)}
                className="flex items-center gap-1.5 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <UserAvatarBadge
                  name={workspace.user.fullName}
                  role={workspace.user.role}
                  className="w-7 h-7"
                />
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:inline" />
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
                      onNavigate('profile');
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2 cursor-pointer mt-1"
                  >
                    <UserIcon className="w-3.5 h-3.5 text-emerald-600" />
                    <span>My Profile</span>
                  </button>

                  {workspace.user.role === 'admin' && (
                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        onNavigate('admin-overview');
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-2 cursor-pointer"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Admin Panel</span>
                    </button>
                  )}

                  {onLogout && (
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
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </header>
  );
}
