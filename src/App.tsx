import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AccountApprovalGate } from './components/AuthPages';
import { AuthGateModal, RechargeGateModal } from './components/GateModals';
import { DarkNavySidebar } from './components/DarkNavySidebar';
import { WorkspaceHeader } from './components/WorkspaceHeader';
import { AdminPortalLayout } from './components/AdminPortalLayout';
import { setRuntimeBrandLogo } from './components/BrandIcons';
import {
  ChatWorkspaceView,
  HistorySearchPanel,
  ImageStudioPanel,
  PdfDocsPanel,
  VoiceConversationPanel,
  ProfileSettingsPanel,
  detectNonChatCommand,
  type LocalUploadFile,
} from './components/UserWorkspaceViews';
import {
  UserCreditDashboard,
  RechargeSubmissionView,
} from './components/CreditAndRechargeViews';
import { AdminConsoleViews } from './components/AdminConsoleViews';
import type {
  AdminDashboardDTO,
  ChatMessageDTO,
  ChatSessionDTO,
  NavSection,
  PaymentMethodType,
  PlatformConfigDTO,
  ProviderCapabilitiesDTO,
  RechargePackageDTO,
  WorkspacePayload,
} from './types/qaaga';

const FALLBACK_PUBLIC_CONFIG: PlatformConfigDTO = {
  branding: {
    logoDataUrl: null,
    faviconDataUrl: null,
  },
  receiverNumbers: {
    bKash: '01711-000000 (Personal)',
    Nagad: '01811-000000 (Personal)',
    Rocket: '01911-000000 (Personal)',
  },
  creditRates: {
    chatBase: 2,
    chatPer1kTokens: 2,
    imageGeneration: 20,
    imageAnalysis: 8,
    pdfAnalysis: 10,
    webSearch: 6,
    voiceStt: 4,
    voiceTts: 4,
    voiceRealtime: 12,
  },
  toolsEnabled: {
    imageGeneration: true,
    imageAnalysis: true,
    pdfAnalysis: true,
    webSearch: true,
    voiceChat: true,
  },
  openaiWallet: {
    purchasedUsd: 120,
    dailySpendLimitUsd: 15,
    monthlySpendLimitUsd: 100,
    alertThresholdPct: 80,
    walletVerificationMode: 'admin-reconciled-estimate',
  },
  models: [
    {
      id: 'gpt-4o',
      label: 'GPT-4o (Flagship)',
      provider: 'openai',
      category: 'chat',
      tier: 'openai-standard',
      enabled: true,
      available: true,
      inputUsdPer1M: 2.5,
      outputUsdPer1M: 10.0,
      baseCreditCost: 2,
      creditsPer1kTokens: 2,
      description: 'Flagship multimodal reasoning & coding assistant.',
    },
    {
      id: 'gemini-3.8-flash',
      label: 'Gemini 3.8 Flash',
      provider: 'gemini',
      category: 'chat',
      tier: 'gemini',
      enabled: true,
      available: true,
      inputUsdPer1M: 0.3,
      outputUsdPer1M: 2.5,
      baseCreditCost: 2,
      creditsPer1kTokens: 1,
      description: 'High-speed multimodal reasoning, PDF & grounded search.',
    },
    {
      id: 'gemini-3.1-flash-lite',
      label: 'Gemini 3.1 Flash-Lite',
      provider: 'gemini',
      category: 'chat',
      tier: 'gemini',
      enabled: true,
      available: true,
      inputUsdPer1M: 0.075,
      outputUsdPer1M: 0.3,
      baseCreditCost: 1,
      creditsPer1kTokens: 1,
      description: 'Economical low-latency assistant.',
    },
  ],
};

const FALLBACK_PACKAGES: RechargePackageDTO[] = [
  { id: 1, name: 'Starter 20', amountBdt: 20, credits: 70, validityDays: 30, active: true },
  { id: 2, name: 'Standard 50', amountBdt: 50, credits: 200, validityDays: 30, active: true },
  { id: 3, name: 'Pro 100', amountBdt: 100, credits: 450, validityDays: 30, active: true },
  { id: 4, name: 'Power 200', amountBdt: 200, credits: 1000, validityDays: 30, active: true },
];

const FALLBACK_CAPABILITIES: ProviderCapabilitiesDTO = {
  openaiConfigured: false,
  openaiLiveVerified: false,
  geminiConfigured: true,
  geminiBridgeConfigured: true,
  activeMode: 'gemini-live',
  features: {
    chatStreaming: { available: true, provider: 'Google Gemini API', note: 'Streaming ready' },
    reasoning: { available: true, provider: 'Google Gemini API', note: 'Thinking mode ready' },
    imageGeneration: { available: false, provider: 'OpenAI DALL-E 3', note: 'Requires live OpenAI API key' },
    imageAnalysis: { available: true, provider: 'Google Gemini Vision', note: 'Vision analysis ready' },
    pdfAnalysis: { available: true, provider: 'Google Gemini Multimodal', note: 'PDF analysis ready' },
    webSearch: { available: true, provider: 'Google Search Grounding', note: 'Web grounding ready' },
    speechToText: { available: true, provider: 'Gemini 3.5 Transcribe', note: 'Speech recognition ready' },
    textToSpeech: { available: true, provider: 'Gemini 3.8 TTS', note: 'Neural speech ready' },
    realtimeVoice: { available: true, provider: 'Gemini 3.8 Live Audio', note: 'Duplex voice ready' },
  },
};

const AI_COMMAND_LABELS: Partial<Record<NavSection, string>> = {
  'image-studio': 'Image Generation',
  'pdf-docs': 'PDF Analysis',
  'web-search': 'Live Web Search',
  'voice-studio': 'Voice Chat',
};

function QaagaAppShell() {
  const { token, user, setUser, logout, authFetch } = useAuth();
  const isGuest = !token || !user;

  // Public Front Page Hydration (for immediate unauthenticated access)
  const [publicMeta, setPublicMeta] = useState<{
    config: PlatformConfigDTO;
    packages: RechargePackageDTO[];
    capabilities: ProviderCapabilitiesDTO;
  }>({
    config: FALLBACK_PUBLIC_CONFIG,
    packages: FALLBACK_PACKAGES,
    capabilities: FALLBACK_CAPABILITIES,
  });
  const [guestTheme, setGuestTheme] = useState<'light' | 'dark'>('light');
  const [guestMessages, setGuestMessages] = useState<ChatMessageDTO[]>([]);

  // Authenticated Workspace & Admin State
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [adminDashboard, setAdminDashboard] =
    useState<AdminDashboardDTO | null>(null);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  // Navigation & Progressive Gate Modals
  const [portalMode, setPortalMode] = useState<'admin' | 'user'>('user');
  const [activeNav, setActiveNav] = useState<NavSection>('chat');
  const [adminGlobalSearch, setAdminGlobalSearch] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [authModal, setAuthModal] = useState<{
    open: boolean;
    reasonFeature: string | null;
  }>({ open: false, reasonFeature: null });

  const [rechargeModal, setRechargeModal] = useState<{
    open: boolean;
    reasonMessage: string | null;
  }>({ open: false, reasonMessage: null });

  const [rechargePrefill, setRechargePrefill] = useState<{
    amountBdt?: number;
    method?: PaymentMethodType;
    nonce: number;
  }>({ nonce: 0 });

  // Track pending command requested before login so we can resume/gate post-login
  const pendingCommandRef = useRef<{
    reasonFeature: string;
    pendingNav?: NavSection;
  } | null>(null);
  const pendingRechargePrefillRef = useRef<{
    amountBdt: number;
    method: PaymentMethodType;
  } | null>(null);
  const initializedForUserIdRef = useRef<number | null>(null);

  // Active Chat State
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string>(
    'gemini-3.1-flash-lite'
  );
  const [reasoningEffort, setReasoningEffort] = useState<
    'low' | 'medium' | 'high'
  >('medium');
  const [chatInput, setChatInput] = useState('');
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [uploads, setUploads] = useState<LocalUploadFile[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  // Audio Playback State
  const [speakingMessageId, setSpeakingMessageId] = useState<number | null>(
    null
  );
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Load public front page configuration on initial website visit
  useEffect(() => {
    let cancelled = false;
    fetch('/api/public/frontpage')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data && data.config && data.packages) {
          setPublicMeta({
            config: data.config,
            packages: data.packages,
            capabilities: data.capabilities || FALLBACK_CAPABILITIES,
          });
          const liveModels = (
            data.config as PlatformConfigDTO
          ).models.filter((m) => m.enabled && m.available !== false);
          if (liveModels.length > 0) {
            const preferredFast =
              liveModels.find((m) => m.id === 'gpt-4o-mini') ||
              liveModels.find((m) => m.id === 'gemini-3.1-flash-lite') ||
              liveModels[0];
            setSelectedModelId((prev) =>
              liveModels.some((m) => m.id === prev) ? prev : preferredFast.id
            );
          }
        }
      })
      .catch(() => {
        // Fallback config stays active
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Sync dark mode class on document root
  useEffect(() => {
    const activeTheme = isGuest
      ? guestTheme
      : workspace?.user.theme || user?.theme || 'light';
    document.documentElement.classList.toggle('dark', activeTheme === 'dark');
  }, [isGuest, guestTheme, workspace?.user.theme, user?.theme]);

  // Sync Admin-configured Logo Icon & Browser Tab Favicon live across the entire platform
  const activeBranding =
    workspace?.config?.branding ?? publicMeta.config?.branding;
  useEffect(() => {
    const logoUrl = activeBranding?.logoDataUrl || null;
    const faviconUrl =
      activeBranding?.faviconDataUrl ||
      activeBranding?.logoDataUrl ||
      '/api/public/favicon';

    setRuntimeBrandLogo(logoUrl);

    const applyHeadIcon = (id: string, rel: string, href: string) => {
      let link = document.getElementById(id) as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement('link');
        link.id = id;
        link.rel = rel;
        document.head.appendChild(link);
      }
      if (link.getAttribute('href') !== href) {
        link.setAttribute('href', href);
      }
    };

    applyHeadIcon('qaaga-favicon', 'icon', faviconUrl);
    applyHeadIcon('qaaga-shortcut-favicon', 'shortcut icon', faviconUrl);
    applyHeadIcon('qaaga-apple-icon', 'apple-touch-icon', faviconUrl);
  }, [activeBranding?.logoDataUrl, activeBranding?.faviconDataUrl]);

  const openLoginModal = useCallback(
    (reasonFeature?: string, pendingNav?: NavSection) => {
      if (reasonFeature || pendingNav) {
        pendingCommandRef.current = {
          reasonFeature: reasonFeature || 'AI Command',
          pendingNav,
        };
      } else {
        pendingCommandRef.current = null;
      }
      setAuthModal({
        open: true,
        reasonFeature: reasonFeature || null,
      });
    },
    []
  );

  const openRechargeModal = useCallback((reasonMessage: string) => {
    setRechargeModal({
      open: true,
      reasonMessage,
    });
  }, []);

  const fetchAdminDashboard = useCallback(async () => {
    try {
      const res = await authFetch('/api/admin/dashboard');
      if (res.ok) {
        const data: AdminDashboardDTO = await res.json();
        setAdminDashboard(data);
      }
    } catch {
      // Non-fatal localized admin load
    }
  }, [authFetch]);

  const fetchWorkspace = useCallback(async () => {
    if (!token) return null;
    setWorkspaceError(null);
    try {
      const res = await authFetch('/api/workspace');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load workspace.');
      }
      const payload = data as WorkspacePayload;
      setWorkspace(payload);
      setUser(payload.user);
      setSelectedModelId((prev) => {
        const liveEnabled = payload.config.models.filter(
          (m) => m.enabled && m.available !== false
        );
        const candidates =
          liveEnabled.length > 0
            ? liveEnabled
            : payload.config.models.filter((m) => m.enabled);
        if (candidates.some((m) => m.id === prev)) return prev;
        if (candidates.some((m) => m.id === payload.user.preferredModel)) {
          return payload.user.preferredModel;
        }
        return candidates[0]?.id || 'gemini-3.8-flash';
      });

      if (payload.user.role === 'admin' && payload.user.status === 'ACTIVE') {
        await fetchAdminDashboard();
      }
      return payload;
    } catch (err: unknown) {
      setWorkspaceError(
        err instanceof Error ? err.message : 'Unable to load workspace.'
      );
      return null;
    }
  }, [token, authFetch, setUser, fetchAdminDashboard]);

  // Initial load & post-login routing / progressive recharge check
  useEffect(() => {
    if (!token) {
      initializedForUserIdRef.current = null;
      setWorkspace(null);
      setAdminDashboard(null);
      setActiveSessionId(null);
      setPortalMode('user');
      setActiveNav('chat');
      return;
    }

    let active = true;
    setLoadingWorkspace(true);
    fetchWorkspace()
      .then((payload) => {
        if (!active || !payload) return;
        if (initializedForUserIdRef.current === payload.user.id) return;
        initializedForUserIdRef.current = payload.user.id;

        // 1. Admin Login -> Open dedicated QAAGA AGENT Admin Panel
        if (payload.user.role === 'admin') {
          pendingCommandRef.current = null;
          pendingRechargePrefillRef.current = null;
          setPortalMode('admin');
          setActiveNav('admin-overview');
          return;
        }

        // 2. Regular User Login -> Check if user came from a gated command
        setPortalMode('user');
        const pendingCmd = pendingCommandRef.current;
        const pendingPrefill = pendingRechargePrefillRef.current;
        pendingCommandRef.current = null;
        pendingRechargePrefillRef.current = null;

        if (pendingPrefill) {
          setRechargePrefill({
            amountBdt: pendingPrefill.amountBdt,
            method: pendingPrefill.method,
            nonce: Date.now(),
          });
          setActiveNav('recharge');
          return;
        }

        if (pendingCmd?.pendingNav) {
          const target = pendingCmd.pendingNav;
          // Account / billing pages can be opened directly
          if (
            target === 'recharge' ||
            target === 'credit-dashboard' ||
            target === 'profile' ||
            target === 'history'
          ) {
            setActiveNav(target);
            return;
          }

          // AI Command requested before login -> If account has no active plan or 0 credits, prompt Recharge immediately!
          const hasActiveCredits =
            payload.user.isSubscriptionActive && payload.credits.remaining > 0;
          if (!hasActiveCredits) {
            setActiveNav('chat');
            setRechargeModal({
              open: true,
              reasonMessage: `Signed in successfully! "${pendingCmd.reasonFeature}" requires an active 30-day subscription and available credits (${payload.credits.remaining} cr available). Please recharge to run commands.`,
            });
            return;
          }

          if (target === 'web-search') {
            setWebSearchEnabled(true);
            setActiveNav('chat');
          } else {
            setActiveNav(target);
          }
          return;
        }

        // Direct login without a pending command -> Open Front Page workspace
        setActiveNav('chat');
      })
      .finally(() => {
        if (active) setLoadingWorkspace(false);
      });

    return () => {
      active = false;
    };
  }, [token, fetchWorkspace]);

  // Construct Guest WorkspacePayload when unauthenticated
  const guestSession: ChatSessionDTO | null = useMemo(() => {
    if (guestMessages.length === 0) return null;
    return {
      id: -1,
      title: 'Guest Conversation',
      model: selectedModelId,
      mode: 'chat',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: guestMessages,
    };
  }, [guestMessages, selectedModelId]);

  const guestWorkspace: WorkspacePayload = useMemo(
    () => ({
      user: {
        id: 0,
        uid: 'guest',
        email: 'guest@qaaga.ai',
        fullName: 'Guest',
        role: 'user',
        status: 'PENDING',
        subscriptionExpiresAt: null,
        isSubscriptionActive: false,
        daysRemaining: 0,
        dailyCreditLimit: 0,
        preferredModel: selectedModelId,
        preferredVoice: 'alloy',
        theme: guestTheme,
        createdAt: new Date().toISOString(),
      },
      credits: {
        totalGranted: 0,
        totalUsed: 0,
        remaining: 0,
        usedToday: 0,
        dailyLimit: 0,
        byFeature: { chat: 0, image: 0, pdf: 0, search: 0, voice: 0 },
      },
      ledger: [],
      packages: publicMeta.packages,
      payments: [],
      sessions: guestSession ? [guestSession] : [],
      notifications: [],
      config: publicMeta.config,
      capabilities: publicMeta.capabilities,
    }),
    [guestSession, guestTheme, publicMeta, selectedModelId]
  );

  // Guest Free Text Chat Executor (POST /api/public/chat/stream)
  const executeGuestStreamChat = async (opts?: {
    customPrompt?: string;
    regenerateLast?: boolean;
  }) => {
    let promptToSend =
      opts?.customPrompt !== undefined ? opts.customPrompt : chatInput;

    let historySnapshot = guestMessages;

    if (opts?.regenerateLast) {
      const reversedUserIdx = [...guestMessages]
        .reverse()
        .findIndex((m) => m.role === 'user');
      if (reversedUserIdx === -1) return;
      const lastUserIdx = guestMessages.length - 1 - reversedUserIdx;
      promptToSend = guestMessages[lastUserIdx].content;
      historySnapshot = guestMessages.slice(0, lastUserIdx);
    }

    if (!promptToSend.trim()) return;

    // Client-side guard: non-chat commands require login
    const detected = detectNonChatCommand(promptToSend);
    if (detected.isNonChat || webSearchEnabled || uploads.length > 0) {
      openLoginModal(detected.label, detected.targetNav);
      return;
    }

    const userMsg: ChatMessageDTO = {
      id: Date.now(),
      sessionId: -1,
      role: 'user',
      content: promptToSend.trim(),
      model: selectedModelId,
      mode: 'chat',
      attachments: [],
      citations: [],
      imageDataUrl: null,
      creditsCharged: 0,
      tokensUsed: 0,
      createdAt: new Date().toISOString(),
    };

    const updatedHistory = [...historySnapshot, userMsg];
    setGuestMessages(updatedHistory);
    if (opts?.customPrompt === undefined && !opts?.regenerateLast) {
      setChatInput('');
    }

    setIsStreaming(true);
    setStreamingText('');
    setStreamError(null);

    let finalReplyText = '';

    try {
      const res = await fetch('/api/public/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptToSend.trim(),
          modelId: selectedModelId,
          reasoningEffort,
          webSearch: false,
          attachments: [],
          history: historySnapshot.slice(-10).map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        if (res.status === 401 || errJson.code === 'LOGIN_REQUIRED') {
          setGuestMessages(historySnapshot);
          setChatInput(promptToSend);
          openLoginModal('Advanced AI Command', 'chat');
          return;
        }
        throw new Error(errJson.error || 'Guest chat request failed.');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('Streaming unavailable.');

      const decoder = new TextDecoder();
      let buffer = '';

      const processGuestFrame = (frame: string) => {
        const line = frame
          .split('\n')
          .find((l) => l.startsWith('data: '));
        if (!line) return;

        let event: { type?: string; text?: string; error?: string } | null = null;
        try {
          event = JSON.parse(line.slice(6));
        } catch {
          return;
        }
        if (!event) return;

        if (event.type === 'delta' && event.text) {
          finalReplyText += String(event.text);
          setStreamingText(finalReplyText);
        } else if (event.type === 'error') {
          throw new Error(event.error || 'Guest chat streaming error.');
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          buffer += decoder.decode();
          if (buffer.trim()) {
            for (const trailing of buffer.split('\n\n')) {
              processGuestFrame(trailing);
            }
          }
          break;
        }
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const frame of parts) {
          processGuestFrame(frame);
        }
      }

      if (finalReplyText.trim()) {
        const assistantMsg: ChatMessageDTO = {
          id: Date.now() + 1,
          sessionId: -1,
          role: 'assistant',
          content: finalReplyText,
          model: selectedModelId,
          mode: 'chat',
          attachments: [],
          citations: [],
          imageDataUrl: null,
          creditsCharged: 0,
          tokensUsed: 0,
          createdAt: new Date().toISOString(),
        };
        setGuestMessages((prev) => [...prev, assistantMsg]);
      } else {
        throw new Error('Empty response received. Please try sending your message again.');
      }
    } catch (err: unknown) {
      if (!finalReplyText.trim()) {
        setGuestMessages(historySnapshot);
        setChatInput(promptToSend);
      }
      setStreamError(
        err instanceof Error ? err.message : 'Guest chat interrupted.'
      );
    } finally {
      setIsStreaming(false);
      setStreamingText('');
    }
  };

  // Suspended Account Gate (Only SUSPENDED accounts are locked out; PENDING/0-credit accounts enter workspace & see Recharge prompt on commands)
  if (!isGuest && user.status === 'SUSPENDED') {
    return (
      <AccountApprovalGate
        user={user}
        onRefreshStatus={async () => {
          await fetchWorkspace();
        }}
        onLogout={logout}
      />
    );
  }

  if (!isGuest && loadingWorkspace && !workspace) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F6F8FA] dark:bg-[#0B1120]">
        <div className="flex items-center gap-3 text-sm font-medium text-slate-600 dark:text-slate-300">
          <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
          <span>
            {user.role === 'admin'
              ? 'Loading QAAGA AGENT Admin Panel...'
              : 'Loading QAAGA AGENT Workspace...'}
          </span>
        </div>
      </div>
    );
  }

  if (!isGuest && workspaceError && !workspace) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#F6F8FA] dark:bg-[#0B1120]">
        <div className="max-w-md w-full rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 text-center">
          <AlertCircle className="w-8 h-8 text-rose-600 mx-auto" />
          <h2 className="font-heading font-bold text-lg text-slate-900 dark:text-white">
            Workspace Unavailable
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {workspaceError}
          </p>
          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                setLoadingWorkspace(true);
                fetchWorkspace().finally(() => setLoadingWorkspace(false));
              }}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
            <button
              type="button"
              onClick={logout}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const effectiveWorkspace: WorkspacePayload = isGuest
    ? guestWorkspace
    : workspace || guestWorkspace;

  const activeSession: ChatSessionDTO | null = isGuest
    ? guestSession
    : effectiveWorkspace.sessions.find((s) => s.id === activeSessionId) || null;

  const handleSelectNav = (nav: NavSection) => {
    if (isGuest) {
      if (nav === 'chat') {
        setActiveNav('chat');
        return;
      }
      openLoginModal(AI_COMMAND_LABELS[nav] || 'Account Feature', nav);
      return;
    }

    if (nav.startsWith('admin-') && effectiveWorkspace.user.role === 'admin') {
      setPortalMode('admin');
      setActiveNav(nav);
      fetchAdminDashboard();
      return;
    }

    // Authenticated user clicking an AI command without active subscription or credits -> Prompt Recharge!
    const aiCmdLabel = AI_COMMAND_LABELS[nav];
    if (
      aiCmdLabel &&
      (!effectiveWorkspace.user.isSubscriptionActive ||
        effectiveWorkspace.credits.remaining <= 0)
    ) {
      openRechargeModal(
        `${aiCmdLabel} requires an active 30-day subscription and available credits (${effectiveWorkspace.credits.remaining} cr remaining). Please recharge to continue.`
      );
      return;
    }

    if (nav === 'web-search') {
      setPortalMode('user');
      setWebSearchEnabled(true);
      setActiveNav('chat');
      return;
    }

    setPortalMode('user');
    setActiveNav(nav);
  };

  const handleNewChat = () => {
    if (isGuest) {
      setGuestMessages([]);
    } else {
      setActiveSessionId(null);
    }
    setChatInput('');
    setUploads([]);
    setStreamError(null);
    setStreamingText('');
    setPortalMode('user');
    setActiveNav('chat');
  };

  const handleToggleTheme = async () => {
    if (isGuest) {
      setGuestTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
      return;
    }
    const nextTheme =
      effectiveWorkspace.user.theme === 'dark' ? 'light' : 'dark';
    setWorkspace((prev) =>
      prev ? { ...prev, user: { ...prev.user, theme: nextTheme } } : prev
    );
    await authFetch('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify({ theme: nextTheme }),
    });
  };

  const handleMarkNotificationsRead = async () => {
    if (isGuest) return;
    setWorkspace((prev) =>
      prev
        ? {
            ...prev,
            notifications: prev.notifications.map((n) => ({
              ...n,
              isRead: true,
            })),
          }
        : prev
    );
    await authFetch('/api/notifications/read', { method: 'POST' });
  };

  // Authenticated Core Streaming Chat / Multimodal / Grounded Search Executor
  const executeAuthenticatedStreamChat = async (opts?: {
    customPrompt?: string;
    forceSearch?: boolean;
    customAttachments?: LocalUploadFile[];
    regenerateLast?: boolean;
    speakReply?: boolean;
  }) => {
    const promptToSend =
      opts?.customPrompt !== undefined ? opts.customPrompt : chatInput;
    const attachmentsToSend = opts?.customAttachments ?? uploads;
    const useSearch = opts?.forceSearch ?? webSearchEnabled;

    if (
      !opts?.regenerateLast &&
      !promptToSend.trim() &&
      attachmentsToSend.length === 0
    ) {
      return;
    }

    if (
      !effectiveWorkspace.user.isSubscriptionActive ||
      effectiveWorkspace.credits.remaining <= 0
    ) {
      openRechargeModal(
        'Your account needs an active 30-day subscription and credits to run commands. Please recharge to continue.'
      );
      return;
    }

    setIsStreaming(true);
    setStreamingText('');
    setStreamError(null);

    if (opts?.customPrompt === undefined && !opts?.regenerateLast) {
      setChatInput('');
    }
    if (!opts?.customAttachments) {
      setUploads([]);
    }

    let finalReplyText = '';
    let resolvedSessionId = activeSessionId;

    try {
      const res = await authFetch('/api/chat/stream', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: activeSessionId,
          prompt: promptToSend,
          modelId: selectedModelId,
          reasoningEffort,
          webSearch: useSearch,
          regenerateLast: Boolean(opts?.regenerateLast),
          attachments: attachmentsToSend.map((a) => ({
            name: a.name,
            mimeType: a.mimeType,
            sizeBytes: a.sizeBytes,
            base64Data: a.base64Data,
            previewDataUrl: a.previewDataUrl,
          })),
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        if (res.status === 402 || errJson.code === 'RECHARGE_REQUIRED') {
          if (opts?.customPrompt === undefined && !opts?.regenerateLast) {
            setChatInput(promptToSend);
          }
          openRechargeModal(
            errJson.error ||
              'Insufficient credits or expired subscription. Please recharge to continue.'
          );
          return;
        }
        throw new Error(errJson.error || 'Chat request failed.');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('Streaming unavailable.');

      const decoder = new TextDecoder();
      let buffer = '';

      const processAuthFrame = (frame: string) => {
        const line = frame
          .split('\n')
          .find((l) => l.startsWith('data: '));
        if (!line) return;

        let event: {
          type?: string;
          sessionId?: number;
          text?: string;
          error?: string;
        } | null = null;
        try {
          event = JSON.parse(line.slice(6));
        } catch {
          return;
        }
        if (!event) return;

        if (event.type === 'meta' && event.sessionId) {
          resolvedSessionId = Number(event.sessionId);
          setActiveSessionId(resolvedSessionId);
        } else if (event.type === 'delta' && event.text) {
          finalReplyText += String(event.text);
          setStreamingText(finalReplyText);
        } else if (event.type === 'error') {
          throw new Error(event.error || 'Provider streaming error.');
        } else if (event.type === 'done' && event.sessionId) {
          resolvedSessionId = Number(event.sessionId);
          setActiveSessionId(resolvedSessionId);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          buffer += decoder.decode();
          if (buffer.trim()) {
            for (const trailing of buffer.split('\n\n')) {
              processAuthFrame(trailing);
            }
          }
          break;
        }
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const frame of parts) {
          processAuthFrame(frame);
        }
      }

      await fetchWorkspace();

      if (opts?.speakReply && finalReplyText.trim()) {
        await handleSpeakMessage(finalReplyText.slice(0, 1200), -1);
      }
    } catch (err: unknown) {
      setStreamError(
        err instanceof Error ? err.message : 'Streaming interrupted.'
      );
      await fetchWorkspace();
    } finally {
      setIsStreaming(false);
      setStreamingText('');
    }
  };

  const activeModelObj = effectiveWorkspace.config.models.find(
    (m) => m.id === selectedModelId
  );
  const preferredAudioProvider: 'openai' | 'gemini' =
    activeModelObj?.provider === 'openai' &&
    effectiveWorkspace.capabilities.openaiLiveVerified
      ? 'openai'
      : 'gemini';

  const handleTranscribeBlob = async (
    base64Audio: string,
    mimeType: string
  ): Promise<string> => {
    if (isGuest) {
      openLoginModal('Voice Input', 'voice-studio');
      return '';
    }
    const res = await authFetch('/api/voice/transcribe', {
      method: 'POST',
      body: JSON.stringify({
        base64Audio,
        mimeType,
        provider: preferredAudioProvider,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 402 || data.code === 'RECHARGE_REQUIRED') {
        openRechargeModal(
          data.error || 'Please recharge your account to use Voice Input.'
        );
        return '';
      }
      throw new Error(data.error || 'Speech transcription failed.');
    }
    await fetchWorkspace();
    return String(data.transcript || '');
  };

  const handleSpeakMessage = async (text: string, msgId: number) => {
    if (isGuest) {
      openLoginModal('Voice Read-Aloud (TTS)', 'voice-studio');
      return;
    }
    if (speakingMessageId === msgId && audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      setSpeakingMessageId(null);
      return;
    }
    try {
      setSpeakingMessageId(msgId);
      const res = await authFetch('/api/voice/speak', {
        method: 'POST',
        body: JSON.stringify({
          text: text.slice(0, 1500),
          voice: effectiveWorkspace.user.preferredVoice,
          provider: preferredAudioProvider,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 402 || data.code === 'RECHARGE_REQUIRED') {
          setSpeakingMessageId(null);
          openRechargeModal(
            data.error || 'Please recharge your account to use Voice Read-Aloud.'
          );
          return;
        }
        throw new Error(data.error || 'Speech synthesis failed.');
      }

      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      const audio = new Audio(data.audioDataUrl);
      audioPlayerRef.current = audio;
      audio.onended = () => setSpeakingMessageId(null);
      audio.onerror = () => setSpeakingMessageId(null);
      await audio.play();
      await fetchWorkspace();
    } catch (err: unknown) {
      setSpeakingMessageId(null);
      setStreamError(
        err instanceof Error ? err.message : 'TTS playback error.'
      );
    }
  };

  const handleGenerateImage = async (
    prompt: string,
    aspectRatio: '1:1' | '16:9' | '3:4'
  ) => {
    const res = await authFetch('/api/image/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt, aspectRatio }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 402 || data.code === 'RECHARGE_REQUIRED') {
        openRechargeModal(
          data.error || 'Please recharge your account to generate images.'
        );
      }
      throw new Error(data.error || 'Image generation failed.');
    }
    await fetchWorkspace();
    return {
      imageDataUrl: String(data.imageDataUrl),
      revisedPrompt: String(data.revisedPrompt),
      creditsCharged: Number(data.creditsCharged),
    };
  };

  const handleDeleteSession = async (id: number) => {
    if (isGuest) return;
    await authFetch(`/api/chats/${id}`, { method: 'DELETE' });
    if (activeSessionId === id) {
      setActiveSessionId(null);
    }
    await fetchWorkspace();
  };

  const handleSubmitPayment = async (payload: {
    packageId: number;
    paymentMethod: PaymentMethodType;
    senderNumber: string;
    transactionId: string;
    amountBdt: number;
    screenshotData: string;
    screenshotMime: string;
  }) => {
    const res = await authFetch('/api/payments/submit', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to submit recharge.');
    }
    await fetchWorkspace();
  };

  const handleFetchScreenshotObject = async (paymentId: number) => {
    const res = await authFetch(`/api/payments/${paymentId}/screenshot`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Unable to load screenshot.');
    }
    return {
      screenshotDataUrl: String(data.screenshotDataUrl),
      transactionId: String(data.transactionId),
      senderNumber: String(data.senderNumber),
      amountBdt: Number(data.amountBdt),
    };
  };

  // =========================================================================
  // DEDICATED ADMIN PORTAL SHELL (Opened automatically for `admin` / `admin`)
  // =========================================================================
  if (
    !isGuest &&
    portalMode === 'admin' &&
    effectiveWorkspace.user.role === 'admin'
  ) {
    const adminSection: NavSection = activeNav.startsWith('admin-')
      ? activeNav
      : 'admin-overview';

    return (
      <AdminPortalLayout
        workspace={effectiveWorkspace}
        dashboard={adminDashboard}
        activeSection={adminSection}
        onSelectSection={(sec) => {
          setActiveNav(sec);
          fetchAdminDashboard();
        }}
        globalSearch={adminGlobalSearch}
        onChangeGlobalSearch={setAdminGlobalSearch}
        selectedModelId={selectedModelId}
        onSelectModel={setSelectedModelId}
        onToggleTheme={handleToggleTheme}
        onMarkNotificationsRead={handleMarkNotificationsRead}
        onSwitchToUserSite={() => {
          setPortalMode('user');
          setActiveNav('chat');
        }}
        onLogout={logout}
      >
        <AdminConsoleViews
          section={adminSection}
          onSelectSection={(sec) => {
            setActiveNav(sec);
            fetchAdminDashboard();
          }}
          globalSearch={adminGlobalSearch}
          dashboard={adminDashboard}
          packages={effectiveWorkspace.packages}
          config={effectiveWorkspace.config}
          capabilities={effectiveWorkspace.capabilities}
          onRefresh={async () => {
            await fetchWorkspace();
            await fetchAdminDashboard();
          }}
          onManageUser={async (userId, payload) => {
            const res = await authFetch(`/api/admin/users/${userId}/manage`, {
              method: 'POST',
              body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) {
              throw new Error(data.error || 'User action failed.');
            }
            await fetchWorkspace();
            await fetchAdminDashboard();
          }}
          onReviewPayment={async (paymentId, decision, adminNote) => {
            const res = await authFetch(
              `/api/admin/payments/${paymentId}/review`,
              {
                method: 'POST',
                body: JSON.stringify({ decision, adminNote }),
              }
            );
            const data = await res.json();
            if (!res.ok) {
              throw new Error(data.error || 'Payment review failed.');
            }
            await fetchWorkspace();
            await fetchAdminDashboard();
          }}
          onFetchScreenshot={handleFetchScreenshotObject}
          onCreatePackage={async (payload) => {
            const res = await authFetch('/api/admin/packages', {
              method: 'POST',
              body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) {
              throw new Error(data.error || 'Failed to create plan.');
            }
            await fetchWorkspace();
            await fetchAdminDashboard();
          }}
          onUpdatePackage={async (pkgId, patch) => {
            const res = await authFetch(`/api/admin/packages/${pkgId}`, {
              method: 'PUT',
              body: JSON.stringify(patch),
            });
            const data = await res.json();
            if (!res.ok) {
              throw new Error(data.error || 'Package update failed.');
            }
            await fetchWorkspace();
            await fetchAdminDashboard();
          }}
          onBroadcastAnnouncement={async (title, detail) => {
            const res = await authFetch('/api/admin/announcements', {
              method: 'POST',
              body: JSON.stringify({ title, detail }),
            });
            const data = await res.json();
            if (!res.ok) {
              throw new Error(
                data.error || 'Failed to broadcast announcement.'
              );
            }
            await fetchWorkspace();
            await fetchAdminDashboard();
          }}
          onSaveConfig={async (next: PlatformConfigDTO) => {
            const res = await authFetch('/api/admin/config', {
              method: 'PUT',
              body: JSON.stringify(next),
            });
            const data = await res.json();
            if (!res.ok) {
              throw new Error(data.error || 'Configuration save failed.');
            }
            if (data.config) {
              setPublicMeta((prev) => ({ ...prev, config: data.config }));
            }
            await fetchWorkspace();
            await fetchAdminDashboard();
          }}
          onTestOpenAI={async () => {
            const res = await authFetch('/api/admin/openai/test', {
              method: 'POST',
            });
            return await res.json();
          }}
          onTestProviders={async () => {
            const res = await authFetch('/api/admin/providers/test', {
              method: 'POST',
            });
            return await res.json();
          }}
        />
      </AdminPortalLayout>
    );
  }

  // =========================================================================
  // QAAGA AGENT FRONT PAGE & USER WORKSPACE SHELL (Guest + Authenticated Users)
  // =========================================================================
  const pendingAdminBadges =
    !isGuest && effectiveWorkspace.user.role === 'admin' && adminDashboard
      ? {
          users: adminDashboard.kpis.pendingUsers,
          payments: adminDashboard.kpis.pendingPaymentsCount,
        }
      : undefined;

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-[#F6F8FA] dark:bg-[#0B1120] text-slate-900 dark:text-slate-100">
      <DarkNavySidebar
        user={effectiveWorkspace.user}
        credits={effectiveWorkspace.credits}
        isGuest={isGuest}
        activeNav={activeNav}
        onSelectNav={handleSelectNav}
        onNewChat={handleNewChat}
        onToggleTheme={handleToggleTheme}
        onLogout={logout}
        onOpenLogin={openLoginModal}
        pendingAdminBadges={pendingAdminBadges}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <WorkspaceHeader
          workspace={effectiveWorkspace}
          isGuest={isGuest}
          selectedModelId={selectedModelId}
          onSelectModel={setSelectedModelId}
          onNavigate={handleSelectNav}
          onOpenLogin={openLoginModal}
          onLogout={logout}
          onMarkNotificationsRead={handleMarkNotificationsRead}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />

        <main className="flex-1 min-h-0 overflow-hidden">
          {(isGuest || activeNav === 'chat') && (
            <ChatWorkspaceView
              workspace={effectiveWorkspace}
              isGuest={isGuest}
              activeSession={activeSession}
              selectedModelId={selectedModelId}
              reasoningEffort={reasoningEffort}
              onChangeReasoningEffort={setReasoningEffort}
              streamingText={streamingText}
              isStreaming={isStreaming}
              streamError={streamError}
              input={chatInput}
              onChangeInput={setChatInput}
              webSearch={webSearchEnabled}
              onToggleWebSearch={() => setWebSearchEnabled((v) => !v)}
              uploads={uploads}
              onAddUploads={(files) =>
                setUploads((prev) => [...prev, ...files])
              }
              onRemoveUpload={(idx) =>
                setUploads((prev) => prev.filter((_, i) => i !== idx))
              }
              onSend={(customPrompt, forceSearch) =>
                isGuest
                  ? executeGuestStreamChat({ customPrompt })
                  : executeAuthenticatedStreamChat({
                      customPrompt,
                      forceSearch,
                    })
              }
              onRegenerate={() =>
                isGuest
                  ? executeGuestStreamChat({ regenerateLast: true })
                  : executeAuthenticatedStreamChat({ regenerateLast: true })
              }
              onSpeak={handleSpeakMessage}
              speakingId={speakingMessageId}
              onTranscribeBlob={handleTranscribeBlob}
              onNavigate={handleSelectNav}
              onRequireLogin={openLoginModal}
              onRequireRecharge={openRechargeModal}
              onQuickRechargeJump={(pkgBdt, method) => {
                if (isGuest) {
                  pendingRechargePrefillRef.current = {
                    amountBdt: pkgBdt,
                    method,
                  };
                  openLoginModal('Account Recharge', 'recharge');
                  return;
                }
                setRechargePrefill({
                  amountBdt: pkgBdt,
                  method,
                  nonce: Date.now(),
                });
                setPortalMode('user');
                setActiveNav('recharge');
              }}
            />
          )}

          {!isGuest && activeNav === 'history' && (
            <HistorySearchPanel
              sessions={effectiveWorkspace.sessions}
              onSelectSession={(id) => {
                setActiveSessionId(id);
                setActiveNav('chat');
              }}
              onDeleteSession={handleDeleteSession}
            />
          )}

          {!isGuest && activeNav === 'image-studio' && (
            <ImageStudioPanel
              workspace={effectiveWorkspace}
              onGenerateImage={handleGenerateImage}
              onRequireRecharge={openRechargeModal}
              onInspectImageInChat={(file, question) => {
                setActiveSessionId(null);
                setActiveNav('chat');
                executeAuthenticatedStreamChat({
                  customPrompt: question,
                  customAttachments: [file],
                });
              }}
            />
          )}

          {!isGuest && activeNav === 'pdf-docs' && (
            <PdfDocsPanel
              workspace={effectiveWorkspace}
              onRequireRecharge={openRechargeModal}
              onAnalyzeDoc={(file, prompt) => {
                setActiveSessionId(null);
                setActiveNav('chat');
                executeAuthenticatedStreamChat({
                  customPrompt: prompt,
                  customAttachments: [file],
                });
              }}
            />
          )}

          {!isGuest && activeNav === 'voice-studio' && (
            <VoiceConversationPanel
              workspace={effectiveWorkspace}
              authToken={token}
              onTranscribe={handleTranscribeBlob}
              onRequireRecharge={openRechargeModal}
              onRefreshWorkspace={async () => {
                await fetchWorkspace();
              }}
              onVoiceTurn={async (spokenPrompt) => {
                setActiveSessionId(null);
                setActiveNav('chat');
                await executeAuthenticatedStreamChat({
                  customPrompt: spokenPrompt,
                  speakReply: true,
                });
              }}
            />
          )}

          {!isGuest && activeNav === 'credit-dashboard' && (
            <UserCreditDashboard
              workspace={effectiveWorkspace}
              onNavigate={handleSelectNav}
            />
          )}

          {!isGuest && activeNav === 'recharge' && (
            <RechargeSubmissionView
              key={rechargePrefill.nonce}
              workspace={effectiveWorkspace}
              initialPackageBdt={rechargePrefill.amountBdt}
              initialMethod={rechargePrefill.method}
              onSubmitPayment={handleSubmitPayment}
              onFetchScreenshot={async (paymentId) => {
                const obj = await handleFetchScreenshotObject(paymentId);
                return obj.screenshotDataUrl;
              }}
            />
          )}

          {!isGuest && activeNav === 'profile' && (
            <ProfileSettingsPanel
              workspace={effectiveWorkspace}
              onNavigate={handleSelectNav}
              onSave={async (patch) => {
                const res = await authFetch('/api/profile', {
                  method: 'PATCH',
                  body: JSON.stringify(patch),
                });
                if (!res.ok) {
                  const err = await res.json().catch(() => ({}));
                  throw new Error(err.error || 'Failed to save preferences.');
                }
                await fetchWorkspace();
              }}
            />
          )}
        </main>
      </div>

      {/* Progressive Gate 1: Login Modal for Non-Chat Commands when Guest */}
      <AuthGateModal
        open={authModal.open}
        reasonFeature={authModal.reasonFeature}
        onClose={() => setAuthModal({ open: false, reasonFeature: null })}
      />

      {/* Progressive Gate 2: Recharge Modal for Commands after Login when 0 Credits / Inactive Plan */}
      {!isGuest && (
        <RechargeGateModal
          open={rechargeModal.open}
          reasonMessage={rechargeModal.reasonMessage}
          user={effectiveWorkspace.user}
          credits={effectiveWorkspace.credits}
          packages={effectiveWorkspace.packages}
          onClose={() =>
            setRechargeModal({ open: false, reasonMessage: null })
          }
          onProceedToRecharge={(pkgBdt, method) => {
            setRechargeModal({ open: false, reasonMessage: null });
            setRechargePrefill({
              amountBdt: pkgBdt,
              method,
              nonce: Date.now(),
            });
            setPortalMode('user');
            setActiveNav('recharge');
          }}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <QaagaAppShell />
    </AuthProvider>
  );
}
