import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  ChevronDown,
  Menu,
  Plus,
  Check,
  LogIn,
  LogOut,
  User as UserIcon,
  ShieldCheck,
} from 'lucide-react';
import type {
  ModelConfigItem,
  NavSection,
  ProviderCapabilitiesDTO,
  WorkspacePayload,
} from '../types/qaaga';
import { UserAvatarBadge } from './BrandIcons';

interface WorkspaceHeaderProps {
  workspace: WorkspacePayload;
  isGuest?: boolean;
  selectedModelId: string;
  onSelectModel: (id: string) => void;
  onNavigate: (nav: NavSection) => void;
  onOpenLogin?: (reasonFeature?: string, pendingNav?: NavSection) => void;
  onLogout?: () => void;
  onMarkNotificationsRead: () => void;
  onOpenMobileMenu: () => void;
}

export function WorkspaceHeader({
  workspace,
  isGuest = false,
  selectedModelId,
  onSelectModel,
  onNavigate,
  onOpenLogin,
  onLogout,
  onMarkNotificationsRead,
  onOpenMobileMenu,
}: WorkspaceHeaderProps) {
  const [modelOpen, setModelOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const modelRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
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
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const enabledModels: ModelConfigItem[] = workspace.config.models.filter(
    (m) => m.enabled
  );
  const activeModel =
    enabledModels.find((m) => m.id === selectedModelId) ||
    enabledModels[0] ||
    workspace.config.models[0];

  const unreadCount = workspace.notifications.filter((n) => !n.isRead).length;
  const caps: ProviderCapabilitiesDTO = workspace.capabilities;

  return (
    <header className="h-16 bg-white dark:bg-[#111827] border-b border-slate-200/90 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-4 shrink-0 z-20">
      {/* Left: Mobile Menu + Model Selector */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
          aria-label="Open menu"
        >
          <Menu className="w-4 h-4" />
        </button>

        <div className="relative" ref={modelRef}>
          <button
            type="button"
            onClick={() => setModelOpen((o) => !o)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/90 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-[13px] font-semibold text-slate-900 dark:text-slate-100 cursor-pointer whitespace-nowrap"
          >
            <span className="truncate max-w-[180px]">
              {activeModel?.label || 'GPT-4o'}
            </span>
            <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
              · Recommended
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>

          {modelOpen && (
            <div className="absolute left-0 mt-2 w-80 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg p-1.5 z-50">
              <div className="px-3 py-1.5 text-[11px] font-medium text-slate-400 flex items-center justify-between">
                <span>Available Models</span>
                <span>
                  {caps.openaiConfigured ? 'OpenAI Live' : 'Sandbox Bridge'}
                </span>
              </div>
              {enabledModels.map((m) => {
                const selected = m.id === activeModel?.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onSelectModel(m.id);
                      setModelOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-xl flex items-start justify-between gap-2 transition-colors cursor-pointer ${
                      selected
                        ? 'bg-emerald-50 dark:bg-emerald-950/40'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <div>
                      <div className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                        {m.label}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {m.description} · Base {m.baseCreditCost} cr
                      </p>
                    </div>
                    {selected && (
                      <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right: Recharge CTA, Notifications & Login / User Profile */}
      <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
        {!isGuest && (
          <button
            type="button"
            onClick={() => onNavigate('credit-dashboard')}
            className="hidden md:flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer whitespace-nowrap"
          >
            <span className="font-mono font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {workspace.credits.remaining} cr
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {workspace.user.isSubscriptionActive
                ? `${workspace.user.daysRemaining}d left`
                : 'Recharge Needed'}
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            if (isGuest) {
              onOpenLogin?.('Recharge & Plans', 'recharge');
            } else {
              onNavigate('recharge');
            }
          }}
          className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Recharge</span>
        </button>

        {isGuest ? (
          <button
            type="button"
            onClick={() => onOpenLogin?.()}
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-900 dark:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            <LogIn className="w-3.5 h-3.5 text-emerald-600" />
            <span>Sign In</span>
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
                className="relative p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4" />
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

            {/* Logged-in User Profile Menu */}
            <div className="relative" ref={profileRef}>
              <button
                type="button"
                onClick={() => setProfileOpen((o) => !o)}
                className="flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <UserAvatarBadge
                  name={workspace.user.fullName}
                  role={workspace.user.role}
                />
                <span className="hidden sm:inline text-xs font-bold text-slate-900 dark:text-white max-w-[120px] truncate">
                  {workspace.user.fullName}
                </span>
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
