export type UserRole = 'user' | 'admin';
export type AccountStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED';
export type PaymentMethodType = 'bKash' | 'Nagad' | 'Rocket';
export type PaymentStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type FeatureCategory = 'chat' | 'image' | 'pdf' | 'search' | 'voice' | 'recharge' | 'admin';

export type NavSection =
  | 'chat'
  | 'history'
  | 'image-studio'
  | 'pdf-docs'
  | 'web-search'
  | 'voice-studio'
  | 'credit-dashboard'
  | 'recharge'
  | 'profile'
  | 'admin-overview'
  | 'admin-users'
  | 'admin-approvals'
  | 'admin-payments'
  | 'admin-pricing'
  | 'admin-api-usage'
  | 'admin-openai-billing'
  | 'admin-chat-logs'
  | 'admin-image-logs'
  | 'admin-pdf-logs'
  | 'admin-announcements'
  | 'admin-branding'
  | 'admin-models'
  | 'admin-audit';

export interface AuthUser {
  id: number;
  uid: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: AccountStatus;
  subscriptionExpiresAt: string | null;
  isSubscriptionActive: boolean;
  daysRemaining: number;
  dailyCreditLimit: number;
  preferredModel: string;
  preferredVoice: string;
  theme: 'light' | 'dark';
  createdAt: string;
}

export interface CreditSummary {
  totalGranted: number;
  totalUsed: number;
  remaining: number;
  usedToday: number;
  dailyLimit: number;
  byFeature: {
    chat: number;
    image: number;
    pdf: number;
    search: number;
    voice: number;
  };
}

export interface LedgerEntryDTO {
  id: number;
  entryType: string;
  feature: string;
  deltaCredits: number;
  balanceAfter: number;
  reservationId: string | null;
  description: string;
  createdAt: string;
}

export interface RechargePackageDTO {
  id: number;
  name: string;
  amountBdt: number;
  credits: number;
  validityDays: number;
  active: boolean;
}

export interface PaymentRequestDTO {
  id: number;
  userId: number;
  userEmail?: string;
  userName?: string;
  packageId: number | null;
  paymentMethod: PaymentMethodType;
  receiverNumber: string;
  senderNumber: string;
  transactionId: string;
  amountBdt: number;
  creditsToGrant: number;
  hasScreenshot: boolean;
  status: PaymentStatus;
  adminNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export type ModelTier =
  | 'openai-reasoning'
  | 'openai-standard'
  | 'openai-economical'
  | 'gemini';

export interface ModelConfigItem {
  id: string;
  label: string;
  provider: 'openai' | 'gemini' | 'bridge';
  tier?: ModelTier;
  category: 'chat' | 'reasoning' | 'image' | 'audio';
  enabled: boolean;
  available?: boolean;
  availabilityNote?: string;
  inputUsdPer1M: number;
  outputUsdPer1M: number;
  baseCreditCost: number;
  creditsPer1kTokens: number;
  description: string;
}

export interface BrandIdentityConfig {
  logoDataUrl: string | null;
  faviconDataUrl: string | null;
}

export interface PlatformConfigDTO {
  branding?: BrandIdentityConfig;
  receiverNumbers: {
    bKash: string;
    Nagad: string;
    Rocket: string;
  };
  creditRates: {
    chatBase: number;
    chatPer1kTokens: number;
    imageGeneration: number;
    imageAnalysis: number;
    pdfAnalysis: number;
    webSearch: number;
    voiceStt: number;
    voiceTts: number;
    voiceRealtime?: number;
  };
  toolsEnabled: {
    imageGeneration: boolean;
    imageAnalysis: boolean;
    pdfAnalysis: boolean;
    webSearch: boolean;
    voiceChat: boolean;
  };
  openaiWallet: {
    purchasedUsd: number;
    dailySpendLimitUsd?: number;
    monthlySpendLimitUsd: number;
    alertThresholdPct: number;
    walletVerificationMode: 'admin-reconciled-estimate';
  };
  models: ModelConfigItem[];
}

export interface OpenAIAccountDiscoveryDTO {
  checkedAt: string;
  keyPresent: boolean;
  reachable: boolean;
  status: number | null;
  errorCode: string | null;
  message: string;
  totalModelsCount: number;
  categorizedModels: {
    reasoning: string[];
    standard: string[];
    economical: string[];
    image: string[];
    audio: string[];
    realtime: string[];
    search: string[];
  };
}

export interface ProviderDiagnosticsDTO {
  openai: {
    ok: boolean;
    keyPresent: boolean;
    status: number | null;
    errorCode: string | null;
    message: string;
    latencyMs: number;
    availableTargetModels: string[];
    categorizedModels: OpenAIAccountDiscoveryDTO['categorizedModels'];
    apiNote: string;
  };
  gemini: {
    ok: boolean;
    keyPresent: boolean;
    status: number | null;
    errorCode: string | null;
    message: string;
    latencyMs: number;
    availableModels: string[];
  };
}

export interface ProviderCapabilitiesDTO {
  openaiConfigured: boolean;
  openaiLiveVerified?: boolean;
  geminiConfigured?: boolean;
  geminiBridgeConfigured: boolean;
  activeMode:
    | 'multi-provider-live'
    | 'openai-live'
    | 'gemini-live'
    | 'sandbox-bridge'
    | 'demo-simulation';
  openaiDiscovery?: OpenAIAccountDiscoveryDTO;
  features: {
    chatStreaming: { available: boolean; provider: string; note: string };
    reasoning?: { available: boolean; provider: string; note: string };
    imageGeneration: { available: boolean; provider: string; note: string };
    imageAnalysis: { available: boolean; provider: string; note: string };
    pdfAnalysis: { available: boolean; provider: string; note: string };
    webSearch: { available: boolean; provider: string; note: string };
    speechToText: { available: boolean; provider: string; note: string };
    textToSpeech: { available: boolean; provider: string; note: string };
    realtimeVoice?: { available: boolean; provider: string; note: string };
  };
}

export interface ChatAttachmentMeta {
  name: string;
  mimeType: string;
  sizeBytes: number;
  previewDataUrl?: string;
}

export interface GroundingLink {
  title: string;
  uri: string;
}

export interface ChatMessageDTO {
  id: number;
  sessionId: number;
  role: 'user' | 'assistant';
  content: string;
  model: string | null;
  mode: string;
  attachments: ChatAttachmentMeta[];
  citations: GroundingLink[];
  imageDataUrl: string | null;
  creditsCharged: number;
  tokensUsed: number;
  createdAt: string;
}

export interface ChatSessionDTO {
  id: number;
  title: string;
  model: string;
  mode: string;
  createdAt: string;
  updatedAt: string;
  messages?: ChatMessageDTO[];
}

export interface WorkspacePayload {
  user: AuthUser;
  credits: CreditSummary;
  ledger: LedgerEntryDTO[];
  packages: RechargePackageDTO[];
  payments: PaymentRequestDTO[];
  sessions: ChatSessionDTO[];
  notifications: Array<{
    id: number;
    title: string;
    detail: string;
    isRead: boolean;
    createdAt: string;
  }>;
  config: PlatformConfigDTO;
  capabilities: ProviderCapabilitiesDTO;
}

export interface AdminActivityLogItem {
  id: number;
  sessionId: number;
  userId: number;
  userName: string;
  userEmail: string;
  role: 'user' | 'assistant';
  mode: string;
  model: string;
  content: string;
  imageDataUrl: string | null;
  attachmentNames: string[];
  creditsCharged: number;
  tokensUsed: number;
  createdAt: string;
}

export interface ProviderErrorLogDTO {
  id: number;
  provider: string;
  model: string;
  feature: string;
  status: number | null;
  errorCode: string;
  message: string;
  userEmail: string;
  createdAt: string;
}

export interface AdminDashboardDTO {
  kpis: {
    totalUsers: number;
    activeUsers: number;
    pendingUsers: number;
    suspendedUsers: number;
    expiredUsers: number;
    totalRevenueBdt: number;
    pendingPaymentsCount: number;
    pendingPaymentsBdt: number;
    approvedPaymentsCount: number;
    openaiPurchasedUsd: number;
    openaiUsedUsd: number;
    openaiTodayUsd: number;
    geminiUsedUsd: number;
    geminiTodayUsd: number;
    totalProviderUsedUsd: number;
    todayProviderUsedUsd: number;
    openaiRemainingEstimatedUsd: number;
    dailySpendLimitUsd: number;
    monthlySpendLimitUsd: number;
    totalTokensUsed: number;
    walletSourceLabel: string;
  };
  creditPool: {
    totalAssigned: number;
    totalUsed: number;
    totalRemaining: number;
  };
  dailyUsage: Array<{
    date: string;
    credits: number;
    usdCost: number;
    openaiUsdCost?: number;
    geminiUsdCost?: number;
    tokens: number;
    requests: number;
  }>;
  featureBreakdown: Array<{
    feature: string;
    credits: number;
    usdCost: number;
    requests: number;
  }>;
  modelBreakdown: Array<{
    model: string;
    provider: string;
    totalTokens: number;
    usdCost: number;
    creditsCharged: number;
    requests: number;
  }>;
  topApiUsers: Array<{
    userId: number;
    fullName: string;
    email: string;
    usdCost: number;
    openaiUsdCost: number;
    geminiUsdCost: number;
    requests: number;
    tokens: number;
    creditsCharged: number;
  }>;
  users: Array<{
    id: number;
    email: string;
    fullName: string;
    role: UserRole;
    status: AccountStatus;
    subscriptionExpiresAt: string | null;
    isExpired: boolean;
    dailyCreditLimit: number;
    usedTodayCredits: number;
    latestPlanBdt: number | null;
    creditsAssigned: number;
    creditsUsed: number;
    creditsRemaining: number;
    chatCredits: number;
    imageCredits: number;
    pdfCredits: number;
    searchCredits: number;
    voiceCredits: number;
    openaiUsdCost: number;
    geminiUsdCost: number;
    totalUsdCost: number;
    totalTokens: number;
    apiRequests: number;
    createdAt: string;
  }>;
  payments: PaymentRequestDTO[];
  activityLogs: AdminActivityLogItem[];
  providerErrors: ProviderErrorLogDTO[];
  announcements: Array<{
    id: number;
    title: string;
    detail: string;
    createdAt: string;
  }>;
  auditLogs: Array<{
    id: number;
    actorEmail: string;
    action: string;
    targetType: string;
    targetId: string | null;
    detailsJson: string | null;
    createdAt: string;
  }>;
}
