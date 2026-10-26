import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Send,
  Paperclip,
  Globe,
  Mic,
  Square,
  Copy,
  Check,
  RotateCcw,
  Volume2,
  Loader2,
  FileText,
  Image as ImageIcon,
  ExternalLink,
  Trash2,
  Search,
  Download,
  UploadCloud,
  Save,
  CheckCircle2,
  MessageSquare,
  LayoutGrid,
  ArrowRight,
  Crown,
  Calendar,
  Zap,
} from 'lucide-react';
import type {
  ChatMessageDTO,
  ChatSessionDTO,
  NavSection,
  PaymentMethodType,
  WorkspacePayload,
} from '../types/qaaga';
import { QaagaLogo, UserAvatarBadge } from './BrandIcons';

export interface LocalUploadFile {
  name: string;
  mimeType: string;
  sizeBytes: number;
  base64Data: string;
  previewDataUrl?: string;
}

export function detectNonChatCommand(prompt: string): {
  isNonChat: boolean;
  label: string;
  targetNav: NavSection;
} {
  const clean = prompt.trim();
  if (
    /^(?:\/(?:image|img|draw))\b/i.test(clean) ||
    /\b(?:create an? image|generate an? image|draw an? image|make an? image|chobi banao|image banao)\b/i.test(
      clean
    )
  ) {
    return {
      isNonChat: true,
      label: 'Image Generation',
      targetNav: 'image-studio',
    };
  }
  if (
    /^(?:\/(?:pdf|doc|file))\b/i.test(clean) ||
    /\b(?:analyze (?:this )?pdf|summarize (?:this )?pdf|upload pdf)\b/i.test(
      clean
    )
  ) {
    return {
      isNonChat: true,
      label: 'PDF Analysis',
      targetNav: 'pdf-docs',
    };
  }
  if (
    /^(?:\/(?:search|web))\b/i.test(clean) ||
    /\b(?:search latest|search the web|web search)\b/i.test(clean)
  ) {
    return {
      isNonChat: true,
      label: 'Live Web Search',
      targetNav: 'web-search',
    };
  }
  if (/^(?:\/(?:voice|speak|audio))\b/i.test(clean)) {
    return {
      isNonChat: true,
      label: 'Voice Chat',
      targetNav: 'voice-studio',
    };
  }
  return { isNonChat: false, label: 'AI Chat', targetNav: 'chat' };
}

/* ============================================================================
 * 1. MAIN QAAGA AGENT FRONT PAGE & CHAT WORKSPACE
 *    - Works immediately on website load (Guest Free Text Chat)
 *    - Non-chat commands prompt Login for Guests
 *    - Post-login commands prompt Recharge when credits/plan are inactive
 * ========================================================================== */
export function ChatWorkspaceView({
  workspace,
  isGuest = false,
  activeSession,
  streamingText,
  isStreaming,
  streamError,
  input,
  onChangeInput,
  webSearch,
  onToggleWebSearch,
  uploads,
  onAddUploads,
  onRemoveUpload,
  onSend,
  onRegenerate,
  onSpeak,
  speakingId,
  onTranscribeBlob,
  onNavigate,
  onRequireLogin,
  onRequireRecharge,
  onQuickRechargeJump,
}: {
  workspace: WorkspacePayload;
  isGuest?: boolean;
  activeSession: ChatSessionDTO | null;
  streamingText: string;
  isStreaming: boolean;
  streamError: string | null;
  input: string;
  onChangeInput: (v: string) => void;
  webSearch: boolean;
  onToggleWebSearch: () => void;
  uploads: LocalUploadFile[];
  onAddUploads: (f: LocalUploadFile[]) => void;
  onRemoveUpload: (idx: number) => void;
  onSend: (customPrompt?: string, forceSearch?: boolean) => void;
  onRegenerate: () => void;
  onSpeak: (text: string, msgId: number) => void;
  speakingId: number | null;
  onTranscribeBlob: (base64: string, mime: string) => Promise<string>;
  onNavigate: (nav: NavSection) => void;
  onRequireLogin: (reasonFeature: string, pendingNav?: NavSection) => void;
  onRequireRecharge: (reasonMsg: string) => void;
  onQuickRechargeJump: (pkgBdt: number, method: PaymentMethodType) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  // Quick Recharge Panel state (Right Column)
  const activePackages = workspace.packages.filter((p) => p.active);
  const [quickBdt, setQuickBdt] = useState<number>(
    activePackages[1]?.amountBdt || activePackages[0]?.amountBdt || 50
  );
  const [quickMethod, setQuickMethod] = useState<PaymentMethodType>('bKash');

  const messages: ChatMessageDTO[] = activeSession?.messages || [];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamingText]);

  const usageBlocked =
    !isGuest &&
    (!workspace.user.isSubscriptionActive || workspace.credits.remaining <= 0);

  const guardFeatureAccess = (
    featureLabel: string,
    targetNav: NavSection,
    requiredCredits = 1,
    actionIfAllowed?: () => void
  ) => {
    if (isGuest) {
      onRequireLogin(featureLabel, targetNav);
      return;
    }
    if (
      !workspace.user.isSubscriptionActive ||
      workspace.credits.remaining < requiredCredits
    ) {
      onRequireRecharge(
        `Please recharge a 20, 50, 100, or 200 BDT plan to use ${featureLabel} (${requiredCredits} credits required, ${workspace.credits.remaining} available).`
      );
      return;
    }
    if (actionIfAllowed) {
      actionIfAllowed();
    } else {
      onNavigate(targetNav);
    }
  };

  const handleSubmitPrompt = (customPrompt?: string, forceSearch?: boolean) => {
    const textToRun = (
      customPrompt !== undefined ? customPrompt : input
    ).trim();

    if (!textToRun && uploads.length === 0) return;

    const cmdCheck = detectNonChatCommand(textToRun);
    const wantsSearch = Boolean(forceSearch || webSearch);
    const wantsUpload = uploads.length > 0;

    if (isGuest) {
      if (wantsUpload) {
        onRequireLogin('File & PDF Upload', 'pdf-docs');
        return;
      }
      if (wantsSearch) {
        onRequireLogin('Live Web Search', 'web-search');
        return;
      }
      if (cmdCheck.isNonChat) {
        onRequireLogin(cmdCheck.label, cmdCheck.targetNav);
        return;
      }
      // Basic Text Chat is allowed for Guests on the Front Page!
      onSend(customPrompt, false);
      return;
    }

    // Logged-in user: check active 30-day plan & credits -> prompt Recharge if needed
    if (usageBlocked) {
      onRequireRecharge(
        'Your account needs an active recharge to run commands. Choose a 20, 50, 100, or 200 BDT package via bKash, Nagad, or Rocket.'
      );
      return;
    }

    if (cmdCheck.isNonChat && cmdCheck.targetNav === 'image-studio') {
      onNavigate('image-studio');
      return;
    }

    onSend(customPrompt, forceSearch);
  };

  const handleFiles = async (list: FileList | null) => {
    if (!list) return;
    const arr: LocalUploadFile[] = [];
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error('File read error'));
        r.readAsDataURL(f);
      });
      arr.push({
        name: f.name,
        mimeType: f.type || 'application/pdf',
        sizeBytes: f.size,
        base64Data: dataUrl.split(',')[1] || '',
        previewDataUrl: f.type.startsWith('image/') ? dataUrl : undefined,
      });
    }
    onAddUploads(arr);
  };

  const toggleMic = async () => {
    if (isGuest) {
      onRequireLogin('Voice Dictation & Speech', 'voice-studio');
      return;
    }
    if (
      !workspace.user.isSubscriptionActive ||
      workspace.credits.remaining < workspace.config.creditRates.voiceStt
    ) {
      onRequireRecharge(
        `Voice dictation requires an active subscription and ${workspace.config.creditRates.voiceStt} credits. Please recharge to continue.`
      );
      return;
    }
    if (recording && recorderRef.current) {
      recorderRef.current.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || 'audio/webm',
        });
        if (!blob.size) return;
        setTranscribing(true);
        try {
          const dataUrl = await new Promise<string>((resolve) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.readAsDataURL(blob);
          });
          const transcript = await onTranscribeBlob(
            dataUrl.split(',')[1] || '',
            blob.type || 'audio/webm'
          );
          if (transcript) {
            onChangeInput(input ? `${input.trim()} ${transcript}` : transcript);
          }
        } finally {
          setTranscribing(false);
        }
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      // Mic permission unavailable
    }
  };

  const firstName = isGuest
    ? 'Guest'
    : workspace.user.fullName.split(' ')[0] || 'User';

  const usedPct =
    workspace.credits.totalGranted > 0
      ? Math.min(
          100,
          Math.round(
            (workspace.credits.totalUsed / workspace.credits.totalGranted) * 100
          )
        )
      : 0;

  const featureTotal = Math.max(
    1,
    workspace.credits.byFeature.chat +
      workspace.credits.byFeature.image +
      workspace.credits.byFeature.pdf +
      workspace.credits.byFeature.search +
      workspace.credits.byFeature.voice
  );

  return (
    <div className="h-full w-full flex overflow-hidden">
      {/* CENTER COLUMN: Hero Greeting + 6 Tool Cards + Chat Stream + Composer */}
      <div className="flex-1 min-w-0 flex flex-col h-full px-4 sm:px-7 py-4 overflow-hidden">
        {/* Scrollable Hero / Messages Area */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-5">
          {messages.length === 0 && !isStreaming ? (
            <div className="max-w-3xl mx-auto py-3 sm:py-6 space-y-6">
              {/* Top Greeting Banner */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
                <div className="space-y-2 max-w-xl">
                  <h1 className="font-heading font-extrabold text-2xl sm:text-[34px] leading-[1.15] text-slate-900 dark:text-white tracking-tight">
                    Hello,{' '}
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {firstName}!
                    </span>
                    <br />
                    How can I help you today?
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    I can chat with you for free right here, or sign in to
                    generate images, analyze PDF files, search the live web, and
                    converse by voice.
                  </p>
                </div>

                {/* Brand Visual Accent */}
                <div className="hidden sm:flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs shrink-0">
                  <QaagaLogo className="w-12 h-12" />
                  <div className="text-[11px] leading-snug text-slate-500 dark:text-slate-400 font-medium">
                    <div className="font-heading font-bold text-slate-900 dark:text-white text-xs">
                      All-in-One AI
                    </div>
                    <div>Ideas · Answers</div>
                    <div>Creativity · Productivity</div>
                  </div>
                </div>
              </div>

              {/* 6 Interactive Tool Cards (Matches QAAGA AGENT Front Page Design) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {/* 1. Chat (Free on Front Page) */}
                <button
                  type="button"
                  onClick={() => {
                    if (!isGuest && usageBlocked) {
                      onRequireRecharge(
                        'Please recharge a BDT package to continue running AI commands on your account.'
                      );
                      return;
                    }
                    inputRef.current?.focus();
                  }}
                  className="text-left p-4 rounded-2xl bg-emerald-50/65 dark:bg-slate-900 border border-emerald-100 dark:border-slate-800 hover:border-emerald-400 transition-colors cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div className="mt-3.5 flex items-center gap-1.5 font-heading font-bold text-[15px] text-slate-900 dark:text-white">
                    <span>Chat</span>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    Get answers, write, brainstorm and more with{' '}
                    <strong className="text-slate-700 dark:text-slate-200">
                      QAAGA AGENT
                    </strong>
                    .
                  </p>
                </button>

                {/* 2. Generate Image (Requires Login -> Recharge) */}
                <button
                  type="button"
                  onClick={() =>
                    guardFeatureAccess(
                      'Image Generation',
                      'image-studio',
                      workspace.config.creditRates.imageGeneration
                    )
                  }
                  className="text-left p-4 rounded-2xl bg-violet-50/55 dark:bg-slate-900 border border-violet-100 dark:border-slate-800 hover:border-violet-400 transition-colors cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-950/70 text-violet-700 dark:text-violet-400 flex items-center justify-center">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                  <div className="mt-3.5 flex items-center gap-1.5 font-heading font-bold text-[15px] text-slate-900 dark:text-white">
                    <span>Generate Image</span>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    Create stunning images from your ideas.
                  </p>
                </button>

                {/* 3. Analyze PDF (Requires Login -> Recharge) */}
                <button
                  type="button"
                  onClick={() =>
                    guardFeatureAccess(
                      'PDF Analysis',
                      'pdf-docs',
                      workspace.config.creditRates.pdfAnalysis
                    )
                  }
                  className="text-left p-4 rounded-2xl bg-rose-50/55 dark:bg-slate-900 border border-rose-100 dark:border-slate-800 hover:border-rose-400 transition-colors cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="mt-3.5 flex items-center gap-1.5 font-heading font-bold text-[15px] text-slate-900 dark:text-white">
                    <span>Analyze PDF</span>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    Upload and analyze PDF files instantly.
                  </p>
                </button>

                {/* 4. Web Search (Requires Login -> Recharge) */}
                <button
                  type="button"
                  onClick={() =>
                    guardFeatureAccess(
                      'Live Web Search',
                      'web-search',
                      workspace.config.creditRates.webSearch,
                      () => {
                        if (!webSearch) onToggleWebSearch();
                        inputRef.current?.focus();
                      }
                    )
                  }
                  className="text-left p-4 rounded-2xl bg-sky-50/60 dark:bg-slate-900 border border-sky-100 dark:border-slate-800 hover:border-sky-400 transition-colors cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-950/70 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                    <Globe className="w-5 h-5" />
                  </div>
                  <div className="mt-3.5 flex items-center gap-1.5 font-heading font-bold text-[15px] text-slate-900 dark:text-white">
                    <span>Web Search</span>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    Get real-time information from the internet.
                  </p>
                </button>

                {/* 5. Voice Chat (Requires Login -> Recharge) */}
                <button
                  type="button"
                  onClick={() =>
                    guardFeatureAccess(
                      'Voice Chat',
                      'voice-studio',
                      workspace.config.creditRates.voiceStt
                    )
                  }
                  className="text-left p-4 rounded-2xl bg-amber-50/60 dark:bg-slate-900 border border-amber-100 dark:border-slate-800 hover:border-amber-400 transition-colors cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/70 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                    <Mic className="w-5 h-5" />
                  </div>
                  <div className="mt-3.5 flex items-center gap-1.5 font-heading font-bold text-[15px] text-slate-900 dark:text-white">
                    <span>Voice Chat</span>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    Talk naturally with voice conversations.
                  </p>
                </button>

                {/* 6. More Tools (Requires Login -> Recharge) */}
                <button
                  type="button"
                  onClick={() =>
                    guardFeatureAccess(
                      'Advanced AI Tools',
                      'credit-dashboard',
                      1
                    )
                  }
                  className="text-left p-4 rounded-2xl bg-slate-100/75 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-slate-400 transition-colors cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center">
                    <LayoutGrid className="w-5 h-5" />
                  </div>
                  <div className="mt-3.5 flex items-center gap-1.5 font-heading font-bold text-[15px] text-slate-900 dark:text-white">
                    <span>More Tools</span>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    Explore all tools and advanced features.
                  </p>
                </button>
              </div>

              {/* 4 Quick Action Buttons Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                <button
                  type="button"
                  onClick={() =>
                    handleSubmitPrompt(
                      'Give me 5 practical productivity tips and summarize how QAAGA AGENT can help with daily tasks.'
                    )
                  }
                  className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2 text-left cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="truncate">Summarize key ideas for me</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    guardFeatureAccess(
                      'Image Generation',
                      'image-studio',
                      workspace.config.creditRates.imageGeneration
                    )
                  }
                  className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-violet-500 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2 text-left cursor-pointer"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-violet-600 shrink-0" />
                  <span className="truncate">Create an image of a sunset</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    guardFeatureAccess(
                      'PDF Analysis',
                      'pdf-docs',
                      workspace.config.creditRates.pdfAnalysis
                    )
                  }
                  className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-rose-500 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2 text-left cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                  <span className="truncate">Analyze this PDF file</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    guardFeatureAccess(
                      'Live Web Search',
                      'web-search',
                      workspace.config.creditRates.webSearch,
                      () =>
                        handleSubmitPrompt(
                          'Search and summarize the latest AI technology breakthroughs today.',
                          true
                        )
                    )
                  }
                  className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-sky-500 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2 text-left cursor-pointer"
                >
                  <Globe className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                  <span className="truncate">Search latest AI news</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-5 py-2">
              {messages.map((msg, idx) => {
                const isUser = msg.role === 'user';
                const isLastAssistant =
                  !isUser && idx === messages.length - 1 && !isStreaming;

                return (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-3.5 ${
                      isUser ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {!isUser && (
                      <QaagaLogo className="w-8 h-8 shrink-0 mt-0.5" />
                    )}

                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3.5 ${
                        isUser
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100'
                      }`}
                    >
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {msg.attachments.map((att, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-black/15"
                            >
                              {att.previewDataUrl ? (
                                <img
                                  src={att.previewDataUrl}
                                  alt={att.name}
                                  referrerPolicy="no-referrer"
                                  className="w-6 h-6 rounded object-cover"
                                />
                              ) : (
                                <FileText className="w-3.5 h-3.5" />
                              )}
                              <span className="truncate max-w-[160px]">
                                {att.name}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {msg.imageDataUrl && (
                        <div className="mb-3 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                          <img
                            src={msg.imageDataUrl}
                            alt={msg.content}
                            referrerPolicy="no-referrer"
                            className="w-full max-w-md h-auto block"
                          />
                        </div>
                      )}

                      {isUser ? (
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">
                          {msg.content}
                        </p>
                      ) : (
                        <div className="qaaga-markdown text-sm">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      )}

                      {!isUser && msg.citations && msg.citations.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-2">
                          {msg.citations.map((cit, i) => (
                            <a
                              key={i}
                              href={cit.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span className="truncate max-w-[190px]">
                                {cit.title}
                              </span>
                            </a>
                          ))}
                        </div>
                      )}

                      {!isUser && (
                        <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-400">
                          <div className="flex items-center gap-1.5 font-mono tabular-nums">
                            <span>{msg.model || 'qaaga'}</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {isGuest ? 'Free Chat' : `${msg.creditsCharged} cr`}
                            </span>
                            {msg.tokensUsed > 0 && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{msg.tokensUsed} tok</span>
                              </>
                            )}
                          </div>

                          <div className="flex items-center gap-2.5">
                            {workspace.capabilities.features.textToSpeech
                              .available && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (isGuest) {
                                    onRequireLogin(
                                      'Voice Read-Aloud (TTS)',
                                      'voice-studio'
                                    );
                                    return;
                                  }
                                  if (usageBlocked) {
                                    onRequireRecharge(
                                      'Please recharge your account to use neural Text-to-Speech.'
                                    );
                                    return;
                                  }
                                  onSpeak(msg.content, msg.id);
                                }}
                                className="flex items-center gap-1 hover:text-emerald-600 cursor-pointer"
                              >
                                {speakingId === msg.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                                ) : (
                                  <Volume2 className="w-3.5 h-3.5" />
                                )}
                                <span>Listen</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(msg.content);
                                setCopiedId(msg.id);
                                setTimeout(() => setCopiedId(null), 1600);
                              }}
                              className="flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                            >
                              {copiedId === msg.id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                              <span>
                                {copiedId === msg.id ? 'Copied' : 'Copy'}
                              </span>
                            </button>

                            {isLastAssistant && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (!isGuest && usageBlocked) {
                                    onRequireRecharge(
                                      'Please recharge your account to regenerate responses.'
                                    );
                                    return;
                                  }
                                  onRegenerate();
                                }}
                                className="flex items-center gap-1 hover:text-emerald-600 cursor-pointer"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Regenerate</span>
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {isUser && (
                      <UserAvatarBadge
                        name={isGuest ? 'Guest' : workspace.user.fullName}
                        role={workspace.user.role}
                        className="w-8 h-8 mt-0.5"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {isStreaming && (
            <div className="max-w-3xl mx-auto flex items-start gap-3.5">
              <QaagaLogo className="w-8 h-8 shrink-0 mt-0.5" />
              <div className="max-w-[85%] rounded-2xl px-4 py-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100">
                {streamingText ? (
                  <div className="qaaga-markdown text-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {streamingText}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                    <span>QAAGA AGENT is thinking...</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {streamError && (
            <div className="max-w-3xl mx-auto rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 px-4 py-3 text-xs text-rose-700 dark:text-rose-300">
              {streamError}
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Bottom Chat & Command Composer */}
        <div className="pt-3 shrink-0 max-w-3xl mx-auto w-full">
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 shadow-xs">
            {uploads.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2.5 pb-2 border-b border-slate-100 dark:border-slate-800">
                {uploads.map((u, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200"
                  >
                    <FileText className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="truncate max-w-[150px]">{u.name}</span>
                    <button
                      type="button"
                      onClick={() => onRemoveUpload(idx)}
                      className="text-slate-400 hover:text-rose-500 cursor-pointer"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <textarea
              ref={inputRef}
              rows={2}
              value={input}
              onChange={(e) => onChangeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (!isStreaming && (input.trim() || uploads.length > 0)) {
                    handleSubmitPrompt();
                  }
                }
              }}
              placeholder={
                recording
                  ? 'Listening... click stop when done speaking'
                  : 'Type your message here...'
              }
              className="w-full resize-none bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
            />

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept=".pdf,image/*,.txt,.csv,.md,.json"
                  onChange={(e) => {
                    handleFiles(e.target.files);
                    e.target.value = '';
                  }}
                  className="hidden"
                />

                {/* Upload PDF/File */}
                <button
                  type="button"
                  onClick={() => {
                    if (isGuest) {
                      onRequireLogin('File & PDF Upload', 'pdf-docs');
                      return;
                    }
                    if (usageBlocked) {
                      onRequireRecharge(
                        'Please recharge a 20, 50, 100, or 200 BDT plan to upload and analyze files.'
                      );
                      return;
                    }
                    fileRef.current?.click();
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Paperclip className="w-3.5 h-3.5" />
                  <span>Upload</span>
                </button>

                {/* Web Search Switch */}
                {workspace.capabilities.features.webSearch.available && (
                  <button
                    type="button"
                    onClick={() => {
                      if (isGuest) {
                        onRequireLogin('Live Web Search', 'web-search');
                        return;
                      }
                      if (usageBlocked) {
                        onRequireRecharge(
                          'Please recharge a 20, 50, 100, or 200 BDT plan to enable Live Web Search.'
                        );
                        return;
                      }
                      onToggleWebSearch();
                    }}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                      webSearch && !isGuest
                        ? 'border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>Web Search</span>
                    <span
                      className={`w-6 h-3.5 rounded-full inline-flex items-center px-0.5 transition-colors ${
                        webSearch && !isGuest
                          ? 'bg-emerald-600 justify-end'
                          : 'bg-slate-300 dark:bg-slate-700 justify-start'
                      }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full bg-white" />
                    </span>
                  </button>
                )}

                {/* Image Tool Button */}
                <button
                  type="button"
                  onClick={() =>
                    guardFeatureAccess(
                      'Image Generation',
                      'image-studio',
                      workspace.config.creditRates.imageGeneration
                    )
                  }
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Image</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                {workspace.capabilities.features.speechToText.available && (
                  <button
                    type="button"
                    disabled={transcribing}
                    onClick={toggleMic}
                    className={`w-9 h-9 rounded-full border flex items-center justify-center cursor-pointer ${
                      recording
                        ? 'border-rose-400 bg-rose-50 text-rose-600'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                    title="Voice Chat / Dictation"
                  >
                    {transcribing ? (
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                    ) : recording ? (
                      <Square className="w-3.5 h-3.5 fill-current" />
                    ) : (
                      <Mic className="w-4 h-4" />
                    )}
                  </button>
                )}

                <button
                  type="button"
                  disabled={
                    isStreaming || (!input.trim() && uploads.length === 0)
                  }
                  onClick={() => handleSubmitPrompt()}
                  className="w-9 h-9 rounded-full bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white flex items-center justify-center cursor-pointer"
                  aria-label="Send message"
                >
                  {isStreaming ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT SIDEBAR PANEL: Subscription, Credits, Quick Recharge & Usage (Desktop) */}
      <aside className="hidden xl:flex w-[336px] shrink-0 flex-col h-full border-l border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0D1425] overflow-y-auto p-4 space-y-4">
        {/* 1. Current Subscription Card */}
        <div className="rounded-2xl bg-slate-50/75 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-heading font-bold text-slate-900 dark:text-white">
              Current Subscription
            </span>
            <span
              className={`font-semibold ${
                isGuest
                  ? 'text-emerald-600'
                  : workspace.user.isSubscriptionActive
                  ? 'text-emerald-600'
                  : 'text-amber-600'
              }`}
            >
              {isGuest
                ? 'Free Chat'
                : workspace.user.isSubscriptionActive
                ? 'Active'
                : 'Recharge Needed'}
            </span>
          </div>

          <div className="rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/60 p-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <Crown className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-heading font-bold text-slate-900 dark:text-white">
                  {isGuest ? 'Guest Chat Access' : '30 Day Plan'}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {isGuest
                    ? 'Sign in for tools & credits'
                    : workspace.user.subscriptionExpiresAt
                    ? `Valid till ${new Date(
                        workspace.user.subscriptionExpiresAt
                      ).toLocaleDateString()}`
                    : 'Recharge to activate 30d'}
                </p>
              </div>
            </div>
            {!isGuest && workspace.user.isSubscriptionActive && (
              <span className="text-[11px] font-mono font-semibold text-emerald-700 dark:text-emerald-300 shrink-0">
                {workspace.user.daysRemaining}d left
              </span>
            )}
          </div>
        </div>

        {/* 2. Credits Overview Card */}
        <div className="rounded-2xl bg-slate-50/75 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
          <div className="text-xs font-heading font-bold text-slate-900 dark:text-white">
            Credits Overview
          </div>

          <div className="grid grid-cols-3 gap-2 text-left">
            <div>
              <p className="text-[11px] text-slate-500">Total Credits</p>
              <p className="font-mono font-extrabold text-lg tabular-nums text-emerald-700 dark:text-emerald-400">
                {isGuest ? 0 : workspace.credits.totalGranted}
              </p>
            </div>
            <div className="border-l border-slate-200 dark:border-slate-800 pl-2.5">
              <p className="text-[11px] text-slate-500">Used Credits</p>
              <p className="font-mono font-extrabold text-lg tabular-nums text-amber-600">
                {isGuest ? 0 : workspace.credits.totalUsed}
              </p>
            </div>
            <div className="border-l border-slate-200 dark:border-slate-800 pl-2.5">
              <p className="text-[11px] text-slate-500">Remaining</p>
              <p className="font-mono font-extrabold text-lg tabular-nums text-sky-600 dark:text-sky-400">
                {isGuest ? 0 : workspace.credits.remaining}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-emerald-600 rounded-full"
                style={{ width: `${isGuest ? 0 : usedPct}%` }}
              />
            </div>
            <span className="text-[11px] font-mono text-slate-500 tabular-nums">
              {isGuest ? '0%' : `${usedPct}%`} used
            </span>
          </div>

          <div className="rounded-xl bg-white dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700 px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>
              {isGuest
                ? 'Unused credits carry forward on recharge'
                : workspace.user.subscriptionExpiresAt
                ? `Valid till ${new Date(
                    workspace.user.subscriptionExpiresAt
                  ).toLocaleDateString()} (30 days plan)`
                : '30-day validity starts on recharge approval'}
            </span>
          </div>
        </div>

        {/* 3. Quick Recharge Plan Selector */}
        <div className="rounded-2xl bg-slate-50/75 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
          <div className="text-xs font-heading font-bold text-slate-900 dark:text-white">
            Recharge Plan
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {activePackages.slice(0, 4).map((pkg) => {
              const selected = pkg.amountBdt === quickBdt;
              return (
                <button
                  key={pkg.id}
                  type="button"
                  onClick={() => setQuickBdt(pkg.amountBdt)}
                  className={`py-2 px-1 rounded-xl border text-center transition-colors cursor-pointer ${
                    selected
                      ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-300'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <div className="font-mono font-extrabold text-sm tabular-nums">
                    {pkg.amountBdt}
                  </div>
                  <div className="text-[10px] text-slate-500">BDT</div>
                </button>
              );
            })}
          </div>

          <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 pt-0.5">
            Payment Method
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {(['bKash', 'Nagad', 'Rocket'] as const).map((m) => {
              const selected = quickMethod === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setQuickMethod(m)}
                  className={`py-2 px-2 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
                    selected
                      ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {m}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              if (isGuest) {
                onRequireLogin(`Recharge ${quickBdt} BDT Plan`, 'recharge');
                return;
              }
              onQuickRechargeJump(quickBdt, quickMethod);
            }}
            className="w-full py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <span>Recharge Now</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 4. Usage Breakdown */}
        <div className="rounded-2xl bg-slate-50/75 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-heading font-bold text-slate-900 dark:text-white">
              Usage Breakdown
            </span>
            <span className="text-[11px] text-slate-400">This Plan</span>
          </div>

          <div className="space-y-2 text-[11.5px]">
            {[
              {
                label: 'Chat (Text)',
                val: isGuest ? 0 : workspace.credits.byFeature.chat,
                bar: 'bg-emerald-600',
              },
              {
                label: 'Image Generation',
                val: isGuest ? 0 : workspace.credits.byFeature.image,
                bar: 'bg-violet-500',
              },
              {
                label: 'PDF Analysis',
                val: isGuest ? 0 : workspace.credits.byFeature.pdf,
                bar: 'bg-rose-500',
              },
              {
                label: 'Web Search',
                val: isGuest ? 0 : workspace.credits.byFeature.search,
                bar: 'bg-sky-500',
              },
              {
                label: 'Voice / Other',
                val: isGuest ? 0 : workspace.credits.byFeature.voice,
                bar: 'bg-amber-500',
              },
            ].map((row) => {
              const pct = isGuest
                ? 0
                : Math.round((row.val / featureTotal) * 100);
              return (
                <div
                  key={row.label}
                  className="grid grid-cols-[105px_46px_1fr_30px] items-center gap-2"
                >
                  <span className="text-slate-600 dark:text-slate-300 truncate">
                    {row.label}
                  </span>
                  <span className="font-mono text-slate-500 tabular-nums text-right">
                    {row.val} cr
                  </span>
                  <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${row.bar}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="font-mono text-[10.5px] text-slate-400 text-right tabular-nums">
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 5. Recent Recharge History */}
        <div className="rounded-2xl bg-slate-50/75 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-heading font-bold text-slate-900 dark:text-white">
              Recent Recharge History
            </span>
            <button
              type="button"
              onClick={() => {
                if (isGuest) onRequireLogin('Recharge History', 'recharge');
                else onNavigate('recharge');
              }}
              className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
            >
              View All
            </button>
          </div>

          {isGuest || workspace.payments.length === 0 ? (
            <p className="text-[11px] text-slate-400 py-2">
              {isGuest
                ? 'Sign in to view your bKash / Nagad / Rocket history.'
                : 'No recharge transactions yet.'}
            </p>
          ) : (
            <div className="divide-y divide-slate-200/60 dark:divide-slate-800 text-[11.5px]">
              {workspace.payments.slice(0, 3).map((p) => (
                <div
                  key={p.id}
                  className="py-2 flex items-center justify-between gap-2"
                >
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {p.amountBdt} BDT
                  </span>
                  <span className="text-slate-500">{p.paymentMethod}</span>
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
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

/* ============================================================================
 * 2. CONVERSATION SEARCH & HISTORY PANEL
 * ========================================================================== */
export function HistorySearchPanel({
  sessions,
  onSelectSession,
  onDeleteSession,
}: {
  sessions: ChatSessionDTO[];
  onSelectSession: (id: number) => void;
  onDeleteSession: (id: number) => void;
}) {
  const [query, setQuery] = useState('');

  const filtered = sessions.filter(
    (s) =>
      !query.trim() ||
      s.title.toLowerCase().includes(query.toLowerCase()) ||
      s.messages?.some((m) =>
        m.content.toLowerCase().includes(query.toLowerCase())
      )
  );

  return (
    <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-6 space-y-5 overflow-y-auto h-full">
      <div>
        <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white">
          Conversation Search & Archive
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Search across all chat threads, PDF analyses, and generated visuals.
        </p>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by keyword, code snippet, or topic..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-600"
        />
      </div>

      <div className="space-y-2.5">
        {filtered.length === 0 ? (
          <div className="p-10 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm text-slate-500">
            No conversations match your search.
          </div>
        ) : (
          filtered.map((s) => (
            <div
              key={s.id}
              className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between gap-4"
            >
              <button
                type="button"
                onClick={() => onSelectSession(s.id)}
                className="flex-1 text-left min-w-0 cursor-pointer"
              >
                <div className="text-xs text-slate-400 flex items-center gap-2">
                  <span>{s.model}</span>
                  <span>·</span>
                  <span className="capitalize">{s.mode}</span>
                  <span>·</span>
                  <span>{new Date(s.updatedAt).toLocaleDateString()}</span>
                </div>
                <div className="text-sm font-heading font-bold text-slate-900 dark:text-white truncate mt-0.5">
                  {s.title}
                </div>
              </button>
              <button
                type="button"
                onClick={() => onDeleteSession(s.id)}
                className="p-2 rounded-lg text-slate-400 hover:text-rose-600 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ============================================================================
 * 3. IMAGE GENERATION & VISION ANALYSIS STUDIO
 * ========================================================================== */
export function ImageStudioPanel({
  workspace,
  onGenerateImage,
  onInspectImageInChat,
  onRequireRecharge,
}: {
  workspace: WorkspacePayload;
  onGenerateImage: (
    prompt: string,
    aspectRatio: '1:1' | '16:9' | '3:4'
  ) => Promise<{
    imageDataUrl: string;
    revisedPrompt: string;
    creditsCharged: number;
  }>;
  onInspectImageInChat: (file: LocalUploadFile, question: string) => void;
  onRequireRecharge: (reasonMsg: string) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [aspect, setAspect] = useState<'1:1' | '16:9' | '3:4'>('1:1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latest, setLatest] = useState<{
    imageDataUrl: string;
    revisedPrompt: string;
    creditsCharged: number;
  } | null>(null);

  const [visionFile, setVisionFile] = useState<LocalUploadFile | null>(null);
  const [visionPrompt, setVisionPrompt] = useState(
    'Analyze this image in detail, extract any visible text or metrics, and summarize key observations.'
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    const reqCr = workspace.config.creditRates.imageGeneration;
    if (
      !workspace.user.isSubscriptionActive ||
      workspace.credits.remaining < reqCr
    ) {
      onRequireRecharge(
        `Image Generation requires an active subscription and ${reqCr} credits (${workspace.credits.remaining} available). Please recharge to continue.`
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await onGenerateImage(prompt.trim(), aspect);
      setLatest(res);
      setPrompt('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Generation failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6 overflow-y-auto h-full">
      <div>
        <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white">
          Image Generation & Vision Studio
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Create new visuals ({workspace.config.creditRates.imageGeneration}{' '}
          credits) or upload existing images for multimodal inspection (
          {workspace.config.creditRates.imageAnalysis} credits).
        </p>
      </div>

      {/* Image Generation Form */}
      <form
        onSubmit={handleCreate}
        className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4"
      >
        <h2 className="text-sm font-heading font-bold text-slate-900 dark:text-white">
          1. Generate New Image
        </h2>
        <textarea
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe your scene, lighting, architecture, or illustration concept..."
          className="w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-600"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
            {(['1:1', '16:9', '3:4'] as const).map((ar) => (
              <button
                key={ar}
                type="button"
                onClick={() => setAspect(ar)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                  aspect === ar
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500'
                }`}
              >
                {ar}
              </button>
            ))}
          </div>

          <button
            type="submit"
            disabled={
              busy ||
              !prompt.trim() ||
              !workspace.config.toolsEnabled.imageGeneration
            }
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ImageIcon className="w-4 h-4" />
            )}
            <span>
              Generate ({workspace.config.creditRates.imageGeneration} cr)
            </span>
          </button>
        </div>

        {error && <p className="text-xs text-rose-600">{error}</p>}

        {latest && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <img
              src={latest.imageDataUrl}
              alt={latest.revisedPrompt}
              referrerPolicy="no-referrer"
              className="w-full max-w-lg mx-auto rounded-xl border border-slate-200 dark:border-slate-700"
            />
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="truncate max-w-md">{latest.revisedPrompt}</span>
              <a
                href={latest.imageDataUrl}
                download={`qaaga-image-${Date.now()}.png`}
                className="inline-flex items-center gap-1 font-semibold text-emerald-600 hover:underline"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </a>
            </div>
          </div>
        )}
      </form>

      {/* Vision Image Analysis */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
        <h2 className="text-sm font-heading font-bold text-slate-900 dark:text-white">
          2. Vision Image Analysis
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <label className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer inline-flex items-center gap-2">
            <UploadCloud className="w-4 h-4 text-emerald-600" />
            <span>
              {visionFile ? visionFile.name : 'Choose Image (PNG/JPG/WEBP)'}
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
                  const url = String(r.result);
                  setVisionFile({
                    name: f.name,
                    mimeType: f.type,
                    sizeBytes: f.size,
                    base64Data: url.split(',')[1] || '',
                    previewDataUrl: url,
                  });
                };
                r.readAsDataURL(f);
              }}
            />
          </label>
        </div>

        {visionFile && (
          <div className="space-y-3">
            <img
              src={visionFile.previewDataUrl}
              alt={visionFile.name}
              referrerPolicy="no-referrer"
              className="h-36 rounded-xl object-cover border border-slate-200 dark:border-slate-700"
            />
            <input
              type="text"
              value={visionPrompt}
              onChange={(e) => setVisionPrompt(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
            />
            <button
              type="button"
              onClick={() => {
                const reqCr = workspace.config.creditRates.imageAnalysis;
                if (
                  !workspace.user.isSubscriptionActive ||
                  workspace.credits.remaining < reqCr
                ) {
                  onRequireRecharge(
                    `Vision Image Analysis requires an active subscription and ${reqCr} credits. Please recharge to continue.`
                  );
                  return;
                }
                onInspectImageInChat(visionFile, visionPrompt);
              }}
              className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
            >
              Analyze Image in Chat ({workspace.config.creditRates.imageAnalysis}{' '}
              cr)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================================
 * 4. PDF & DOCUMENT UPLOAD + SUMMARIZATION STUDIO
 * ========================================================================== */
export function PdfDocsPanel({
  workspace,
  onAnalyzeDoc,
  onRequireRecharge,
}: {
  workspace: WorkspacePayload;
  onAnalyzeDoc: (file: LocalUploadFile, prompt: string) => void;
  onRequireRecharge: (reasonMsg: string) => void;
}) {
  const [docFile, setDocFile] = useState<LocalUploadFile | null>(null);
  const [question, setQuestion] = useState(
    'Provide a structured executive summary, key metrics table, and actionable takeaways from this document.'
  );

  const loadSampleReport = () => {
    const content = `QAAGA AGENT ENTERPRISE AUDIT & TELEMETRY REPORT (2026)
1. Platform Active Subscribers: 1,420 verified seats across Dhaka & Chattogram
2. Monthly BDT MFS Collections: 184,500 BDT (99.4% reconciliation accuracy)
3. Average First-Token Streaming Latency: 340ms
4. Security Posture: Scrypt salted credentials, append-only credit ledger, zero client-exposed API keys.`;
    const b64 = btoa(content);
    setDocFile({
      name: 'QAAGA_Enterprise_Audit_2026.txt',
      mimeType: 'text/plain',
      sizeBytes: content.length,
      base64Data: b64,
    });
  };

  return (
    <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6 overflow-y-auto h-full">
      <div>
        <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white">
          PDF & Document Summarization
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Upload PDF reports, CSV spreadsheets, or technical docs for instant Q&A
          ({workspace.config.creditRates.pdfAnalysis} base credits).
        </p>
      </div>

      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <div className="flex flex-wrap gap-3">
          <label className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer inline-flex items-center gap-2">
            <FileText className="w-4 h-4" />
            <span>Upload PDF / TXT / CSV</span>
            <input
              type="file"
              accept=".pdf,.txt,.csv,.md,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const r = new FileReader();
                r.onload = () => {
                  const res = String(r.result);
                  setDocFile({
                    name: f.name,
                    mimeType: f.type || 'application/pdf',
                    sizeBytes: f.size,
                    base64Data: res.split(',')[1] || '',
                  });
                };
                r.readAsDataURL(f);
              }}
            />
          </label>

          <button
            type="button"
            onClick={loadSampleReport}
            className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            Load Sample Executive Brief
          </button>
        </div>

        {docFile && (
          <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="text-xs font-mono text-emerald-600 dark:text-emerald-400">
              Staged: {docFile.name} (
              {Math.max(0.1, docFile.sizeBytes / 1024).toFixed(1)} KB)
            </div>
            <textarea
              rows={3}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white"
            />
            <button
              type="button"
              onClick={() => {
                const reqCr = workspace.config.creditRates.pdfAnalysis;
                if (
                  !workspace.user.isSubscriptionActive ||
                  workspace.credits.remaining < reqCr
                ) {
                  onRequireRecharge(
                    `PDF & Document Analysis requires an active subscription and ${reqCr} credits. Please recharge to continue.`
                  );
                  return;
                }
                onAnalyzeDoc(docFile, question);
              }}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
            >
              Summarize & Query Document
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================================
 * 5. VOICE CONVERSATION STUDIO & PROFILE SETTINGS
 * ========================================================================== */
export function VoiceConversationPanel({
  workspace,
  onTranscribe,
  onVoiceTurn,
  onRequireRecharge,
}: {
  workspace: WorkspacePayload;
  onTranscribe: (b64: string, mime: string) => Promise<string>;
  onVoiceTurn: (spokenPrompt: string) => Promise<void>;
  onRequireRecharge: (reasonMsg: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [manualText, setManualText] = useState('');
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const checkVoiceCredits = () => {
    const minCr =
      workspace.config.creditRates.voiceStt +
      workspace.config.creditRates.voiceTts;
    if (
      !workspace.user.isSubscriptionActive ||
      workspace.credits.remaining < minCr
    ) {
      onRequireRecharge(
        `Voice Conversation requires an active subscription and at least ${minCr} credits. Please recharge to continue.`
      );
      return false;
    }
    return true;
  };

  const toggle = async () => {
    if (!checkVoiceCredits()) return;
    if (recording && recRef.current) {
      recRef.current.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || 'audio/webm',
        });
        if (!blob.size) return;
        setBusy(true);
        try {
          const url = await new Promise<string>((resolve) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.readAsDataURL(blob);
          });
          const text = await onTranscribe(
            url.split(',')[1] || '',
            blob.type || 'audio/webm'
          );
          if (text) await onVoiceTurn(text);
        } finally {
          setBusy(false);
        }
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      // Fallback input available below
    }
  };

  return (
    <div className="max-w-2xl mx-auto w-full px-4 sm:px-6 py-8 space-y-6 overflow-y-auto h-full text-center">
      <div>
        <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white">
          Voice Conversations (STT + Neural TTS)
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Speak in English or বাংলা ({workspace.config.creditRates.voiceStt} cr
          STT + {workspace.config.creditRates.voiceTts} cr TTS).
        </p>
      </div>

      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 flex flex-col items-center space-y-5">
        <button
          type="button"
          disabled={busy || !workspace.config.toolsEnabled.voiceChat}
          onClick={toggle}
          className={`w-20 h-20 rounded-full flex items-center justify-center text-white shadow-md transition-transform cursor-pointer ${
            recording
              ? 'bg-rose-600 scale-105'
              : 'bg-emerald-600 hover:bg-emerald-700'
          } disabled:opacity-45`}
        >
          {busy ? (
            <Loader2 className="w-8 h-8 animate-spin" />
          ) : recording ? (
            <Square className="w-7 h-7 fill-current" />
          ) : (
            <Mic className="w-8 h-8" />
          )}
        </button>
        <p className="text-xs text-slate-500">
          {recording
            ? 'Recording microphone... click again to send'
            : busy
            ? 'Processing voice turn & synthesizing audio reply...'
            : 'Tap microphone to speak'}
        </p>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!manualText.trim() || busy) return;
            if (!checkVoiceCredits()) return;
            const q = manualText.trim();
            setManualText('');
            setBusy(true);
            try {
              await onVoiceTurn(q);
            } finally {
              setBusy(false);
            }
          }}
          className="w-full flex gap-2 pt-2"
        >
          <input
            type="text"
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder="Or type a prompt to converse with spoken audio..."
            className="flex-1 px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
          />
          <button
            type="submit"
            disabled={!manualText.trim() || busy}
            className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
          >
            Speak Reply
          </button>
        </form>
      </div>
    </div>
  );
}

export function ProfileSettingsPanel({
  workspace,
  onNavigate,
  onSave,
}: {
  workspace: WorkspacePayload;
  onNavigate: (nav: NavSection) => void;
  onSave: (patch: {
    fullName?: string;
    preferredModel?: string;
    preferredVoice?: string;
  }) => Promise<void>;
}) {
  const [fullName, setFullName] = useState(workspace.user.fullName);
  const [preferredModel, setPreferredModel] = useState(
    workspace.user.preferredModel
  );
  const [preferredVoice, setPreferredVoice] = useState(
    workspace.user.preferredVoice
  );
  const [saved, setSaved] = useState(false);

  const { user, credits, payments } = workspace;
  const usedPct =
    credits.totalGranted > 0
      ? Math.min(
          100,
          Math.round((credits.totalUsed / credits.totalGranted) * 100)
        )
      : 0;

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6 overflow-y-auto h-full">
      {/* Top User Identity & Quick Actions Banner */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="scale-125 origin-left">
            <UserAvatarBadge name={user.fullName} role={user.role} />
          </div>
          <div className="pl-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="font-heading font-extrabold text-xl sm:text-2xl text-slate-900 dark:text-white">
                {user.fullName}
              </h1>
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                ·{' '}
                {user.isSubscriptionActive
                  ? 'Active Member'
                  : 'Recharge Required'}
              </span>
            </div>
            <p className="text-xs sm:text-sm font-mono text-slate-500 dark:text-slate-400 mt-0.5">
              {user.email} · Joined{' '}
              {new Date(user.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate('chat')}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
          >
            Open Front Page & Chat
          </button>
          <button
            type="button"
            onClick={() => onNavigate('recharge')}
            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer"
          >
            Recharge Credits (BDT)
          </button>
        </div>
      </div>

      {/* Subscription & Credit Overview Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
          <p className="text-xs text-slate-500">30-Day Subscription</p>
          <p
            className={`text-xl font-heading font-extrabold mt-1 ${
              user.isSubscriptionActive ? 'text-emerald-600' : 'text-amber-600'
            }`}
          >
            {user.isSubscriptionActive
              ? `Active · ${user.daysRemaining}d left`
              : 'Recharge Needed'}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            {user.subscriptionExpiresAt
              ? `Valid till ${new Date(
                  user.subscriptionExpiresAt
                ).toLocaleDateString()}`
              : 'Recharge 20–200 BDT to activate'}
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
          <p className="text-xs text-slate-500">Total Credits Assigned</p>
          <p className="text-2xl font-mono font-extrabold tabular-nums text-slate-900 dark:text-white mt-1">
            {credits.totalGranted}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Lifetime granted</p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
          <p className="text-xs text-slate-500">Used Credits</p>
          <p className="text-2xl font-mono font-extrabold tabular-nums text-amber-600 mt-1">
            {credits.totalUsed}
          </p>
          <div className="mt-2 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-emerald-600 rounded-full"
              style={{ width: `${usedPct}%` }}
            />
          </div>
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
      </div>

      {/* Two-Column Split: Preferences Form + Recent Recharges & Quick Tools */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await onSave({ fullName, preferredModel, preferredVoice });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
          }}
          className="lg:col-span-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4"
        >
          <h2 className="text-sm font-heading font-bold text-slate-900 dark:text-white">
            Account & AI Preferences
          </h2>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Full Name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Preferred Default Model
            </label>
            <select
              value={preferredModel}
              onChange={(e) => setPreferredModel(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
            >
              {workspace.config.models
                .filter((m) => m.enabled)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Preferred Voice Persona
            </label>
            <select
              value={preferredVoice}
              onChange={(e) => setPreferredVoice(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
            >
              {['alloy', 'nova', 'echo', 'onyx', 'shimmer'].map((v) => (
                <option key={v} value={v}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between pt-2">
            {saved ? (
              <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> Saved!
              </span>
            ) : (
              <span className="text-xs text-slate-400">
                Daily limit: {user.dailyCreditLimit} cr/day
              </span>
            )}
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Profile</span>
            </button>
          </div>
        </form>

        {/* Right: Modality Summary + Recent Recharges */}
        <div className="lg:col-span-6 space-y-5">
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-heading font-bold text-slate-900 dark:text-white">
                Your Feature Usage
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('credit-dashboard')}
                className="text-xs font-semibold text-emerald-600 hover:underline cursor-pointer"
              >
                Full Ledger
              </button>
            </div>

            <div className="grid grid-cols-5 gap-2 text-center text-xs pt-1">
              {[
                {
                  l: 'Chat',
                  v: credits.byFeature.chat,
                  nav: 'chat' as NavSection,
                },
                {
                  l: 'Images',
                  v: credits.byFeature.image,
                  nav: 'image-studio' as NavSection,
                },
                {
                  l: 'PDF',
                  v: credits.byFeature.pdf,
                  nav: 'pdf-docs' as NavSection,
                },
                {
                  l: 'Search',
                  v: credits.byFeature.search,
                  nav: 'web-search' as NavSection,
                },
                {
                  l: 'Voice',
                  v: credits.byFeature.voice,
                  nav: 'voice-studio' as NavSection,
                },
              ].map((item) => (
                <button
                  key={item.l}
                  type="button"
                  onClick={() => onNavigate(item.nav)}
                  className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 hover:border-emerald-500 border border-slate-200/70 dark:border-slate-700 cursor-pointer"
                >
                  <div className="font-mono font-bold text-sm tabular-nums text-slate-900 dark:text-white">
                    {item.v}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {item.l}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-heading font-bold text-slate-900 dark:text-white">
                Recent Recharge History
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('recharge')}
                className="text-xs font-semibold text-emerald-600 hover:underline cursor-pointer"
              >
                Add Recharge
              </button>
            </div>

            {payments.length === 0 ? (
              <p className="text-xs text-slate-400 py-3">
                No BDT recharges submitted yet.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {payments.slice(0, 3).map((p) => (
                  <div
                    key={p.id}
                    className="py-2.5 flex items-center justify-between gap-2"
                  >
                    <div>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">
                        {p.amountBdt} BDT
                      </span>{' '}
                      <span className="text-slate-500">· {p.paymentMethod}</span>
                    </div>
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
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
