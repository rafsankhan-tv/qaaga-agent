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
  Plus,
  ChevronDown,
  Folder,
  BookOpen,
  Compass,
  Monitor,
  ArrowUp,
  AudioLines,
  KeyRound,
  RefreshCw,
} from 'lucide-react';
import type {
  ChatMessageDTO,
  ChatSessionDTO,
  ModelConfigItem,
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
  workspaceTab = 'work',
  selectedModelId,
  onSelectModel,
  reasoningEffort = 'low',
  onChangeReasoningEffort,
  activeSession,
  streamingText,
  isStreaming,
  streamError,
  missingOpenAISecret = false,
  onRefreshOpenAISecretStatus,
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
  workspaceTab?: 'chat' | 'work';
  selectedModelId?: string;
  onSelectModel?: (id: string) => void;
  reasoningEffort?: 'low' | 'medium' | 'high';
  onChangeReasoningEffort?: (effort: 'low' | 'medium' | 'high') => void;
  activeSession: ChatSessionDTO | null;
  streamingText: string;
  isStreaming: boolean;
  streamError: string | null;
  missingOpenAISecret?: boolean;
  onRefreshOpenAISecretStatus?: () => Promise<void> | void;
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
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [checkingSecret, setCheckingSecret] = useState(false);

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (
        modelMenuRef.current &&
        !modelMenuRef.current.contains(e.target as Node)
      ) {
        setModelPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  // Quick Recharge Panel state (Right Column)
  const activePackages = workspace.packages.filter((p) => p.active);
  const [quickBdt, setQuickBdt] = useState<number>(
    activePackages[1]?.amountBdt || activePackages[0]?.amountBdt || 50
  );
  const [quickMethod, setQuickMethod] = useState<PaymentMethodType>('bKash');

  const messages: ChatMessageDTO[] = activeSession?.messages || [];

  const enabledModels: ModelConfigItem[] = workspace.config.models.filter(
    (m) => m.enabled
  );
  const selectableModels = [
    ...enabledModels.filter((m) => m.provider === 'openai'),
    ...enabledModels.filter((m) => m.provider !== 'openai'),
  ];

  const activeModelConfig =
    selectableModels.find((m) => m.id === selectedModelId) ||
    selectableModels.find((m) => m.id === workspace.defaultOpenAIModel) ||
    selectableModels.find((m) => m.provider === 'openai') ||
    selectableModels[0] ||
    workspace.config.models[0];

  const showOpenAISecretSetup =
    (activeModelConfig?.provider === 'openai' || !activeModelConfig) &&
    (!workspace.capabilities.openaiConfigured || missingOpenAISecret);

  const compactModelName = (activeModelConfig?.label || 'GPT-4o mini')
    .replace(/\s*\(.*?\)\s*/g, '')
    .trim();

  const effortDisplay =
    reasoningEffort === 'high'
      ? 'High'
      : reasoningEffort === 'medium'
      ? 'Medium'
      : 'Low';

  const conversationCreditsTotal = messages.reduce(
    (sum, m) => sum + (m.creditsCharged || 0),
    0
  );
  const conversationTokensTotal = messages.reduce(
    (sum, m) => sum + (m.tokensUsed || 0),
    0
  );

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
      requiredCredits > 0 &&
      (!workspace.user.isSubscriptionActive ||
        workspace.credits.remaining < requiredCredits)
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

  const openFilePickerGated = () => {
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

  const hasTypedContent = Boolean(input.trim() || uploads.length > 0);

  const renderComposerCard = (opts: { showBottomTray: boolean; dropUp?: boolean }) => (
    <div className="w-full max-w-[680px] mx-auto">
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

      {/* Main Rounded White Composer Box */}
      <div className="relative z-10 rounded-[26px] bg-white dark:bg-[#161B26] border border-slate-200/90 dark:border-slate-700/90 px-5 pt-4 pb-3 shadow-[0_6px_32px_-8px_rgba(0,0,0,0.08)]">
        {uploads.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2.5 pb-2 border-b border-slate-100 dark:border-slate-800">
            {uploads.map((u, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200"
              >
                <FileText className="w-3.5 h-3.5 text-emerald-600" />
                <span className="truncate max-w-[160px]">{u.name}</span>
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
              if (!isStreaming && hasTypedContent) {
                handleSubmitPrompt();
              }
            }
          }}
          placeholder={
            recording
              ? 'Listening... click stop when done speaking'
              : workspaceTab === 'work'
              ? 'Work with QAAGA AGENT'
              : 'Message QAAGA AGENT'
          }
          className="w-full min-h-[52px] resize-none bg-transparent text-[15px] leading-relaxed text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
        />

        {/* Composer Bottom Action Bar */}
        <div className="flex items-center justify-between gap-2 pt-1.5">
          {/* Left: + Attachment Trigger & Active Plugin State */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={openFilePickerGated}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Attach PDF, document, or image"
              aria-label="Attach file"
            >
              <Plus className="w-5 h-5 stroke-[1.9]" />
            </button>

            {webSearch && !isGuest && (
              <button
                type="button"
                onClick={onToggleWebSearch}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 text-xs font-medium cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Search on</span>
              </button>
            )}
          </div>

          {/* Right: Inline Model + Effort Selector, Mic, and Blue Waveform/Send Circle */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="relative" ref={modelMenuRef}>
              <button
                type="button"
                onClick={() => setModelPickerOpen((o) => !o)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-[13px] transition-colors cursor-pointer whitespace-nowrap"
              >
                <span className="font-medium text-slate-900 dark:text-slate-100 max-w-[140px] truncate">
                  {compactModelName}
                </span>
                <span className="text-slate-400 dark:text-slate-500">
                  {effortDisplay}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>

              {modelPickerOpen && (
                <div
                  className={`absolute right-0 ${
                    opts.dropUp ? 'bottom-full mb-2' : 'top-full mt-2'
                  } w-76 max-h-[340px] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl p-2 z-50 text-left`}
                >
                  {onChangeReasoningEffort && (
                    <div className="px-2.5 pt-1 pb-2 mb-1.5 border-b border-slate-100 dark:border-slate-800">
                      <div className="text-[11px] font-medium text-slate-400 mb-1.5">
                        Thinking effort
                      </div>
                      <div className="grid grid-cols-3 gap-1 p-0.5 rounded-xl bg-slate-100 dark:bg-slate-800">
                        {(['low', 'medium', 'high'] as const).map((eff) => (
                          <button
                            key={eff}
                            type="button"
                            onClick={() => onChangeReasoningEffort(eff)}
                            className={`py-1 rounded-lg text-xs font-medium capitalize transition-colors cursor-pointer ${
                              reasoningEffort === eff
                                ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-2xs'
                                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                            }`}
                          >
                            {eff}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="px-2.5 py-1 text-[11px] font-medium text-slate-400">
                    Available models
                  </div>
                  <div className="space-y-0.5">
                    {selectableModels.map((m) => {
                      const selected = m.id === activeModelConfig?.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            onSelectModel?.(m.id);
                            setModelPickerOpen(false);
                          }}
                          className={`w-full text-left px-2.5 py-2 rounded-xl flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                            selected
                              ? 'bg-slate-100 dark:bg-slate-800'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium text-slate-900 dark:text-white truncate">
                              {m.label}
                            </p>
                            <p className="text-[11px] text-slate-400 font-mono tabular-nums">
                              {m.baseCreditCost} cr · {m.provider === 'openai' ? 'OpenAI' : 'Gemini'}
                            </p>
                          </div>
                          {selected && (
                            <Check className="w-4 h-4 text-slate-900 dark:text-white shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {workspace.capabilities.features.speechToText.available && (
              <button
                type="button"
                disabled={transcribing}
                onClick={toggleMic}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                  recording
                    ? 'bg-rose-50 text-rose-600'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                title="Voice dictation"
                aria-label="Voice dictation"
              >
                {transcribing ? (
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                ) : recording ? (
                  <Square className="w-3.5 h-3.5 fill-current" />
                ) : (
                  <Mic className="w-[18px] h-[18px]" />
                )}
              </button>
            )}

            <button
              type="button"
              disabled={isStreaming}
              onClick={() => {
                if (hasTypedContent) {
                  handleSubmitPrompt();
                } else {
                  guardFeatureAccess(
                    'Voice Chat',
                    'voice-studio',
                    workspace.config.creditRates.voiceStt
                  );
                }
              }}
              className="w-9 h-9 rounded-full bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white flex items-center justify-center transition-colors shadow-xs cursor-pointer shrink-0"
              title={hasTypedContent ? 'Send message' : 'Open Live Voice'}
              aria-label={hasTypedContent ? 'Send message' : 'Open Live Voice'}
            >
              {isStreaming ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : hasTypedContent ? (
                <ArrowUp className="w-[18px] h-[18px] stroke-[2.25]" />
              ) : (
                <AudioLines className="w-[18px] h-[18px]" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Attached Bottom Action Tray (Displayed in Work mode empty hero) */}
      {opts.showBottomTray && (
        <div className="-mt-5 pt-7 pb-2.5 px-4 rounded-b-[22px] bg-[#F5F5F6] dark:bg-slate-900/90 border border-t-0 border-slate-200/75 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-slate-600 dark:text-slate-300">
          <div className="flex flex-wrap items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() =>
                guardFeatureAccess('Project History', 'history', 0, () =>
                  onNavigate('history')
                )
              }
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-black/[0.05] dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <Folder className="w-3.5 h-3.5 text-slate-500" />
              <span>Choose project</span>
            </button>

            <button
              type="button"
              onClick={openFilePickerGated}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-black/[0.05] dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 text-slate-500" />
              <span>Files</span>
            </button>

            <button
              type="button"
              onClick={() =>
                guardFeatureAccess(
                  'Live Web Search',
                  'web-search',
                  workspace.config.creditRates.webSearch,
                  () => {
                    onToggleWebSearch();
                    inputRef.current?.focus();
                  }
                )
              }
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                webSearch && !isGuest
                  ? 'bg-sky-100/80 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 font-medium'
                  : 'hover:bg-black/[0.05] dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Compass className="w-3.5 h-3.5 text-slate-500" />
              <span>Plugins</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() =>
              guardFeatureAccess(
                'Image Generation',
                'image-studio',
                workspace.config.creditRates.imageGeneration
              )
            }
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-black/[0.05] dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            <Monitor className="w-3.5 h-3.5 text-slate-500" />
            <span>Image studio</span>
          </button>
        </div>
      )}
    </div>
  );

  const renderOpenAISecretPrompt = () => {
    if (!showOpenAISecretSetup) return null;
    return (
      <div className="rounded-2xl bg-amber-50/90 dark:bg-amber-950/35 border border-amber-200/90 dark:border-amber-800/80 p-4 text-left space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 flex items-center justify-center shrink-0 mt-0.5">
              <KeyRound className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <h3 className="font-heading font-semibold text-xs sm:text-sm text-amber-950 dark:text-amber-100">
                OpenAI API Secret Setup Required
              </h3>
              <p className="text-xs leading-relaxed text-amber-900/90 dark:text-amber-200/90">
                <code className="font-mono font-semibold px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/70">
                  OPENAI_API_KEY
                </code>{' '}
                {workspace.capabilities.openaiConfigured
                  ? 'was rejected by OpenAI (HTTP 401 Invalid API Key).'
                  : 'is missing on the server.'}{' '}
                To connect live OpenAI Responses API chat securely without
                exposing secrets in the browser:
              </p>
              <ol className="list-decimal list-inside text-[11.5px] leading-relaxed text-amber-900/85 dark:text-amber-200/85 space-y-0.5 pt-0.5">
                <li>
                  Open <strong>Settings → Secrets</strong> in AI Studio (or your
                  Node.js server environment).
                </li>
                <li>
                  Add{' '}
                  <code className="font-mono font-semibold">OPENAI_API_KEY</code>{' '}
                  with your official OpenAI API key (optional:{' '}
                  <code className="font-mono font-semibold">OPENAI_MODEL</code>,
                  default{' '}
                  <code className="font-mono">
                    {workspace.defaultOpenAIModel || 'gpt-4o-mini'}
                  </code>
                  ).
                </li>
                <li>
                  Save the secret, then click <strong>Check Connection</strong>{' '}
                  below.
                </li>
              </ol>
            </div>
          </div>

          {onRefreshOpenAISecretStatus && (
            <button
              type="button"
              disabled={checkingSecret}
              onClick={async () => {
                setCheckingSecret(true);
                try {
                  await onRefreshOpenAISecretStatus();
                } finally {
                  setCheckingSecret(false);
                }
              }}
              className="px-3 py-1.5 rounded-xl bg-amber-900 hover:bg-amber-950 dark:bg-amber-500 dark:hover:bg-amber-400 text-white dark:text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${checkingSecret ? 'animate-spin' : ''}`}
              />
              <span>Check Connection</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full w-full flex overflow-hidden bg-white dark:bg-[#0F1117]">
      {/* CENTER COLUMN: Clean Minimalist Hero Composer OR Active Conversation Stream */}
      <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
        {messages.length === 0 && !isStreaming ? (
          <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 flex flex-col items-center justify-center">
            <div className="w-full max-w-[680px] mx-auto -mt-4 space-y-6">
              <h1 className="font-heading font-medium text-[26px] sm:text-[31px] leading-tight tracking-[-0.02em] text-slate-900 dark:text-white text-center text-balance">
                {workspaceTab === 'work'
                  ? 'What should we work on?'
                  : 'How can I help you today?'}
              </h1>

              {renderOpenAISecretPrompt()}

              {renderComposerCard({
                showBottomTray: workspaceTab === 'work',
                dropUp: false,
              })}

              {/* Clean Starter Workflow Suggestions Below Tray */}
              <div className="pt-1 pl-3 space-y-2.5">
                <button
                  type="button"
                  onClick={() =>
                    handleSubmitPrompt(
                      'Help me unblock pending project tasks and draft clear replies.'
                    )
                  }
                  className="flex items-center gap-3 text-left text-[13.5px] text-slate-400 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 transition-colors cursor-pointer group"
                >
                  <span className="w-5 h-5 rounded-full bg-slate-900 dark:bg-slate-200 text-white dark:text-slate-900 flex items-center justify-center shrink-0">
                    <Zap className="w-3 h-3" />
                  </span>
                  <span>
                    Unblock project tasks that are waiting on my reply
                  </span>
                </button>

                {streamError && (
                  <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 px-4 py-3 text-xs text-rose-700 dark:text-rose-300">
                    {streamError}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 space-y-5">
              <div className="max-w-3xl mx-auto space-y-5 py-2">
                {renderOpenAISecretPrompt()}
                {!isGuest && activeSession && (
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-200 truncate max-w-xs">
                      {activeSession.title}
                    </span>
                    <div className="flex items-center gap-3 font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                      <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                        Conversation: {conversationCreditsTotal} cr used
                      </span>
                      <span>·</span>
                      <span>
                        {conversationTokensTotal.toLocaleString()} tokens
                      </span>
                    </div>
                  </div>
                )}

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
                            ? 'bg-[#F4F4F5] dark:bg-slate-800 text-slate-900 dark:text-white'
                            : 'bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-slate-800 dark:text-slate-100'
                        }`}
                      >
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-2">
                            {msg.attachments.map((att, i) => (
                              <div
                                key={i}
                                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-black/10 dark:bg-white/10"
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

                        {!isUser &&
                          msg.citations &&
                          msg.citations.length > 0 && (
                            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-2">
                              {msg.citations.map((cit, i) => (
                                <a
                                  key={i}
                                  href={cit.uri}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
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
                                {isGuest
                                  ? 'Free Chat'
                                  : `${msg.creditsCharged} cr`}
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
                                  className="flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                                >
                                  {speakingId === msg.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
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
                                  className="flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
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

                {isStreaming && (
                  <div className="flex items-start gap-3.5">
                    <QaagaLogo className="w-8 h-8 shrink-0 mt-0.5" />
                    <div className="max-w-[85%] rounded-2xl px-4 py-3.5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-slate-800 dark:text-slate-100">
                      {streamingText ? (
                        <div className="qaaga-markdown text-sm">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {streamingText}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                          <span>QAAGA AGENT is working...</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {streamError && (
                  <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 px-4 py-3 text-xs text-rose-700 dark:text-rose-300">
                    {streamError}
                  </div>
                )}

                <div ref={endRef} />
              </div>
            </div>

            {/* Docked Bottom Composer during Active Conversation */}
            <div className="px-4 sm:px-7 pb-4 pt-2 shrink-0">
              {renderComposerCard({ showBottomTray: false, dropUp: true })}
            </div>
          </>
        )}
      </div>

      {/* RIGHT SIDEBAR PANEL: Previous Subscription, Credits, Quick Recharge & Usage Plans */}
      <aside className="hidden lg:flex w-[320px] xl:w-[336px] shrink-0 flex-col h-full border-l border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0D1425] overflow-y-auto p-4 space-y-4">
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
          filtered.map((s) => {
            const sessCredits = (s.messages || []).reduce(
              (acc, m) => acc + (m.creditsCharged || 0),
              0
            );
            const sessTokens = (s.messages || []).reduce(
              (acc, m) => acc + (m.tokensUsed || 0),
              0
            );
            return (
              <div
                key={s.id}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between gap-4"
              >
                <button
                  type="button"
                  onClick={() => onSelectSession(s.id)}
                  className="flex-1 text-left min-w-0 cursor-pointer"
                >
                  <div className="text-xs text-slate-400 flex flex-wrap items-center gap-2 font-mono tabular-nums">
                    <span>{s.model}</span>
                    <span>·</span>
                    <span className="capitalize font-sans">{s.mode}</span>
                    <span>·</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                      {sessCredits} cr
                    </span>
                    {sessTokens > 0 && (
                      <>
                        <span>·</span>
                        <span>{sessTokens.toLocaleString()} tok</span>
                      </>
                    )}
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
            );
          })
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-heading font-bold text-slate-900 dark:text-white">
            1. Generate New Image (OpenAI DALL-E 3)
          </h2>
          <span
            className={`text-xs font-semibold ${
              workspace.capabilities.features.imageGeneration.available
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-amber-600 dark:text-amber-400'
            }`}
          >
            {workspace.capabilities.features.imageGeneration.available
              ? 'Active · OpenAI DALL-E 3'
              : 'Unconfigured · Requires Valid OPENAI_API_KEY'}
          </span>
        </div>

        {!workspace.capabilities.features.imageGeneration.available && (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-200">
            {workspace.capabilities.features.imageGeneration.note}. Multimodal
            Vision Image Analysis below remains active and ready via{' '}
            {workspace.capabilities.features.imageAnalysis.provider}.
          </div>
        )}
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
  authToken,
  onTranscribe,
  onVoiceTurn,
  onRequireRecharge,
  onRefreshWorkspace,
}: {
  workspace: WorkspacePayload;
  authToken?: string | null;
  onTranscribe: (b64: string, mime: string) => Promise<string>;
  onVoiceTurn: (spokenPrompt: string) => Promise<void>;
  onRequireRecharge: (reasonMsg: string) => void;
  onRefreshWorkspace?: () => void;
}) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [manualText, setManualText] = useState('');
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Realtime Duplex WebSocket Voice State
  const [realtimeActive, setRealtimeActive] = useState(false);
  const [realtimeConnecting, setRealtimeConnecting] = useState(false);
  const [realtimeProvider, setRealtimeProvider] = useState<'gemini' | 'openai'>(
    workspace.capabilities.openaiLiveVerified ? 'openai' : 'gemini'
  );
  const [realtimeError, setRealtimeError] = useState<string | null>(null);
  const [realtimeTranscripts, setRealtimeTranscripts] = useState<
    Array<{ role: 'user' | 'assistant'; text: string }>
  >([]);
  const [realtimePromptInput, setRealtimePromptInput] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextPlayTimeRef = useRef<number>(0);

  const stopRealtimeSession = () => {
    try {
      processorRef.current?.disconnect();
      processorRef.current = null;
    } catch {
      // ignore
    }
    try {
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    } catch {
      // ignore
    }
    try {
      wsRef.current?.close();
      wsRef.current = null;
    } catch {
      // ignore
    }
    try {
      audioCtxRef.current?.close();
      audioCtxRef.current = null;
    } catch {
      // ignore
    }
    nextPlayTimeRef.current = 0;
    setRealtimeActive(false);
    setRealtimeConnecting(false);
    onRefreshWorkspace?.();
  };

  useEffect(() => {
    return () => {
      stopRealtimeSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playPcm24kBase64 = (base64Data: string, sampleRate = 24000) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const bin = atob(base64Data);
    const byteLen = bin.length - (bin.length % 2);
    const int16 = new Int16Array(byteLen / 2);
    for (let i = 0; i < int16.length; i++) {
      const lo = bin.charCodeAt(i * 2);
      const hi = bin.charCodeAt(i * 2 + 1);
      const val = (hi << 8) | lo;
      int16[i] = val >= 0x8000 ? val - 0x10000 : val;
    }
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }
    const audioBuf = ctx.createBuffer(1, float32.length, sampleRate);
    audioBuf.copyToChannel(float32, 0);

    const src = ctx.createBufferSource();
    src.buffer = audioBuf;
    src.connect(ctx.destination);
    const startAt = Math.max(ctx.currentTime, nextPlayTimeRef.current);
    src.start(startAt);
    nextPlayTimeRef.current = startAt + audioBuf.duration;
  };

  const startRealtimeSession = async () => {
    const reqCr = workspace.config.creditRates.voiceRealtime || 6;
    if (
      !workspace.user.isSubscriptionActive ||
      workspace.credits.remaining < reqCr
    ) {
      onRequireRecharge(
        `Realtime Duplex Voice requires an active subscription and ${reqCr} credits (${workspace.credits.remaining} available). Please recharge to continue.`
      );
      return;
    }
    if (!authToken) return;

    setRealtimeError(null);
    setRealtimeConnecting(true);
    setRealtimeTranscripts([]);

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtx({ sampleRate: 16000 });
      audioCtxRef.current = ctx;
      nextPlayTimeRef.current = ctx.currentTime;

      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const wsUrl = `${proto}://${window.location.host}/api/realtime/voice?token=${encodeURIComponent(
        authToken
      )}&provider=${realtimeProvider}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = async (ev) => {
        try {
          const data = JSON.parse(String(ev.data)) as {
            type?: string;
            base64?: string;
            sampleRate?: number;
            role?: 'user' | 'assistant';
            text?: string;
            message?: string;
            code?: string;
          };

          if (data.type === 'ready') {
            setRealtimeConnecting(false);
            setRealtimeActive(true);
            try {
              const micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                  channelCount: 1,
                  sampleRate: 16000,
                  echoCancellation: true,
                  noiseSuppression: true,
                },
              });
              micStreamRef.current = micStream;
              const micSource = ctx.createMediaStreamSource(micStream);
              const proc = ctx.createScriptProcessor(4096, 1, 1);
              processorRef.current = proc;

              proc.onaudioprocess = (audioEv) => {
                if (ws.readyState !== WebSocket.OPEN) return;
                const inputCh = audioEv.inputBuffer.getChannelData(0);
                const pcm16 = new Int16Array(inputCh.length);
                for (let i = 0; i < inputCh.length; i++) {
                  const s = Math.max(-1, Math.min(1, inputCh[i]));
                  pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
                }
                const bytes = new Uint8Array(pcm16.buffer);
                let bin = '';
                for (let i = 0; i < bytes.byteLength; i++) {
                  bin += String.fromCharCode(bytes[i]);
                }
                ws.send(JSON.stringify({ type: 'audio', base64: btoa(bin) }));
              };

              micSource.connect(proc);
              proc.connect(ctx.destination);
            } catch {
              // Microphone permission unavailable — user can still send live text turns over the Realtime socket
            }
          } else if (data.type === 'audio' && data.base64) {
            playPcm24kBase64(data.base64, data.sampleRate || 24000);
          } else if (data.type === 'transcript' && data.text && data.role) {
            setRealtimeTranscripts((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === data.role) {
                return [
                  ...prev.slice(0, -1),
                  { role: data.role!, text: `${last.text}${data.text}` },
                ];
              }
              return [...prev, { role: data.role!, text: data.text! }];
            });
          } else if (data.type === 'interrupted') {
            if (audioCtxRef.current) {
              nextPlayTimeRef.current = audioCtxRef.current.currentTime;
            }
          } else if (data.type === 'error') {
            if (data.code === 'RECHARGE_REQUIRED') {
              onRequireRecharge(data.message || 'Please recharge credits.');
            } else {
              setRealtimeError(data.message || 'Realtime voice error.');
            }
            stopRealtimeSession();
          }
        } catch {
          // ignore parse error
        }
      };

      ws.onerror = () => {
        setRealtimeError('Realtime WebSocket connection interrupted.');
        stopRealtimeSession();
      };

      ws.onclose = () => {
        setRealtimeActive(false);
        setRealtimeConnecting(false);
      };
    } catch (err: unknown) {
      setRealtimeError(
        err instanceof Error ? err.message : 'Unable to start Realtime Voice.'
      );
      stopRealtimeSession();
    }
  };

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
    <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6 overflow-y-auto h-full">
      <div>
        <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white">
          Voice Studio (Realtime Duplex + STT / Neural TTS)
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Low-latency Realtime Voice ({workspace.config.creditRates.voiceRealtime || 6}{' '}
          cr/session) or turn-based Speech-to-Text ({workspace.config.creditRates.voiceStt}{' '}
          cr) + Neural TTS ({workspace.config.creditRates.voiceTts} cr).
        </p>
      </div>

      {/* 1. Realtime Duplex Voice Card (WebSocket PCM Audio) */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-heading font-bold text-slate-900 dark:text-white">
              1. Realtime Duplex Voice Session
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Bi-directional live audio streaming with instant spoken replies.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={realtimeProvider}
              disabled={realtimeActive || realtimeConnecting}
              onChange={(e) =>
                setRealtimeProvider(e.target.value as 'gemini' | 'openai')
              }
              className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100"
            >
              {workspace.capabilities.geminiConfigured && (
                <option value="gemini">Google Gemini 3.8 Live (Ready)</option>
              )}
              <option value="openai">
                OpenAI Realtime API{' '}
                {workspace.capabilities.openaiLiveVerified
                  ? '(Ready)'
                  : '(Requires Valid OPENAI_API_KEY)'}
              </option>
            </select>

            {realtimeActive || realtimeConnecting ? (
              <button
                type="button"
                onClick={stopRealtimeSession}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
              >
                End Live Session
              </button>
            ) : (
              <button
                type="button"
                disabled={!workspace.config.toolsEnabled.voiceChat}
                onClick={startRealtimeSession}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
              >
                Start Live Voice ({workspace.config.creditRates.voiceRealtime || 6} cr)
              </button>
            )}
          </div>
        </div>

        {realtimeConnecting && (
          <div className="flex items-center gap-2 text-xs text-emerald-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Connecting secure Realtime Voice socket...</span>
          </div>
        )}

        {realtimeActive && (
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                ● Live Audio Connected — Speak naturally into your microphone
              </span>
            </div>

            {realtimeTranscripts.length > 0 && (
              <div className="max-h-44 overflow-y-auto space-y-2 rounded-xl bg-slate-50 dark:bg-slate-800/70 p-3 text-xs">
                {realtimeTranscripts.map((t, idx) => (
                  <div key={idx}>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {t.role === 'user' ? 'You: ' : 'QAAGA: '}
                    </span>
                    <span className="text-slate-600 dark:text-slate-300">
                      {t.text}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (
                  !realtimePromptInput.trim() ||
                  !wsRef.current ||
                  wsRef.current.readyState !== WebSocket.OPEN
                ) {
                  return;
                }
                const msg = realtimePromptInput.trim();
                setRealtimeTranscripts((prev) => [
                  ...prev,
                  { role: 'user', text: msg },
                ]);
                wsRef.current.send(JSON.stringify({ type: 'text', text: msg }));
                setRealtimePromptInput('');
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={realtimePromptInput}
                onChange={(e) => setRealtimePromptInput(e.target.value)}
                placeholder="Send a prompt into the live voice stream..."
                className="flex-1 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
              />
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
              >
                Speak Live
              </button>
            </form>
          </div>
        )}

        {realtimeError && (
          <p className="text-xs text-rose-600 dark:text-rose-400">
            {realtimeError}
          </p>
        )}
      </div>

      {/* 2. Turn-Based STT + Neural TTS Card */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 flex flex-col items-center space-y-4 text-center">
        <h2 className="text-sm font-heading font-bold text-slate-900 dark:text-white self-start">
          2. Turn-Based Dictation & Neural Speech Reply
        </h2>
        <button
          type="button"
          disabled={busy || !workspace.config.toolsEnabled.voiceChat}
          onClick={toggle}
          className={`w-16 h-16 rounded-full flex items-center justify-center text-white shadow-md transition-transform cursor-pointer ${
            recording
              ? 'bg-rose-600 scale-105'
              : 'bg-emerald-600 hover:bg-emerald-700'
          } disabled:opacity-45`}
        >
          {busy ? (
            <Loader2 className="w-7 h-7 animate-spin" />
          ) : recording ? (
            <Square className="w-6 h-6 fill-current" />
          ) : (
            <Mic className="w-7 h-7" />
          )}
        </button>
        <p className="text-xs text-slate-500">
          {recording
            ? 'Recording microphone... click again to send'
            : busy
            ? 'Processing voice turn & synthesizing audio reply...'
            : 'Tap microphone to dictate'}
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
          className="w-full flex gap-2 pt-1"
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
                .filter((m) => m.enabled && m.available !== false)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} ({m.baseCreditCost} cr)
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
