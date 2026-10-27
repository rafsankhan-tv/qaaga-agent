import { desc, eq } from 'drizzle-orm';
import { db } from './index.ts';
import {
  auditLogs,
  chatMessages,
  chatSessions,
  creditLedger,
  notifications,
  paymentRequests,
  platformSettings,
  providerUsageLogs,
  rechargePackages,
  users,
} from './schema.ts';
import { hashPassword } from '../lib/cryptoAuth.ts';
import type {
  AccountStatus,
  AdminDashboardDTO,
  AuthUser,
  CreditSummary,
  LedgerEntryDTO,
  PaymentMethodType,
  PaymentRequestDTO,
  PlatformConfigDTO,
  RechargePackageDTO,
} from '../types/qaaga.ts';

export const DEFAULT_PLATFORM_CONFIG: PlatformConfigDTO = {
  branding: {
    logoDataUrl: null,
    faviconDataUrl: null,
  },
  receiverNumbers: {
    bKash: '01711-948201 (Merchant)',
    Nagad: '01819-550312 (Merchant)',
    Rocket: '01914-772109-6 (Personal/Send Money)',
  },
  creditRates: {
    chatBase: 2,
    chatPer1kTokens: 2,
    imageGeneration: 12,
    imageAnalysis: 5,
    pdfAnalysis: 6,
    webSearch: 4,
    voiceStt: 3,
    voiceTts: 3,
    voiceRealtime: 6,
  },
  toolsEnabled: {
    imageGeneration: true,
    imageAnalysis: true,
    pdfAnalysis: true,
    webSearch: true,
    voiceChat: true,
  },
  openaiWallet: {
    purchasedUsd: 120.0,
    dailySpendLimitUsd: 15.0,
    monthlySpendLimitUsd: 100.0,
    alertThresholdPct: 80,
    walletVerificationMode: 'admin-reconciled-estimate',
  },
  models: [
    // 1. OpenAI Advanced Reasoning Models
    {
      id: 'o3-mini',
      label: 'OpenAI o3-mini (Reasoning)',
      provider: 'openai',
      tier: 'openai-reasoning',
      category: 'reasoning',
      enabled: true,
      inputUsdPer1M: 1.1,
      outputUsdPer1M: 4.4,
      baseCreditCost: 6,
      creditsPer1kTokens: 3,
      description: 'Multi-step STEM, algorithms, SQL & architectural reasoning',
    },
    {
      id: 'o4-mini',
      label: 'OpenAI o4-mini (Advanced Reasoning)',
      provider: 'openai',
      tier: 'openai-reasoning',
      category: 'reasoning',
      enabled: true,
      inputUsdPer1M: 1.1,
      outputUsdPer1M: 4.4,
      baseCreditCost: 7,
      creditsPer1kTokens: 4,
      description: 'Next-gen fast reasoning for math, debugging & analytical workflows',
    },
    {
      id: 'o3',
      label: 'OpenAI o3 (Deep Reasoning)',
      provider: 'openai',
      tier: 'openai-reasoning',
      category: 'reasoning',
      enabled: true,
      inputUsdPer1M: 2.0,
      outputUsdPer1M: 8.0,
      baseCreditCost: 10,
      creditsPer1kTokens: 6,
      description: 'Frontier deep reasoning for complex research & multi-step proofs',
    },
    // 2. OpenAI Standard Flagship Models
    {
      id: 'gpt-4o',
      label: 'OpenAI GPT-4o (Standard Flagship)',
      provider: 'openai',
      tier: 'openai-standard',
      category: 'chat',
      enabled: true,
      inputUsdPer1M: 2.5,
      outputUsdPer1M: 10.0,
      baseCreditCost: 5,
      creditsPer1kTokens: 4,
      description: 'High-accuracy multimodal flagship for code, vision & PDFs',
    },
    {
      id: 'gpt-4.1',
      label: 'OpenAI GPT-4.1 (Standard Coding)',
      provider: 'openai',
      tier: 'openai-standard',
      category: 'chat',
      enabled: true,
      inputUsdPer1M: 2.0,
      outputUsdPer1M: 8.0,
      baseCreditCost: 5,
      creditsPer1kTokens: 3,
      description: 'Long-context software engineering & structured instruction following',
    },
    // 3. OpenAI Economical Models
    {
      id: 'gpt-4o-mini',
      label: 'OpenAI GPT-4o mini (Economical)',
      provider: 'openai',
      tier: 'openai-economical',
      category: 'chat',
      enabled: true,
      inputUsdPer1M: 0.15,
      outputUsdPer1M: 0.6,
      baseCreditCost: 2,
      creditsPer1kTokens: 1,
      description: 'Low-latency everyday assistant for drafting, translation & Q&A',
    },
    {
      id: 'gpt-4.1-mini',
      label: 'OpenAI GPT-4.1 mini (Economical)',
      provider: 'openai',
      tier: 'openai-economical',
      category: 'chat',
      enabled: true,
      inputUsdPer1M: 0.4,
      outputUsdPer1M: 1.6,
      baseCreditCost: 2,
      creditsPer1kTokens: 1,
      description: 'Balanced speed, coding intelligence & economical token pricing',
    },
    // 4. Google Gemini Models (Fast Flash Lite ordered first for sub-second response)
    {
      id: 'gemini-3.1-flash-lite',
      label: 'Google Gemini 3.1 Flash Lite',
      provider: 'gemini',
      tier: 'gemini',
      category: 'chat',
      enabled: true,
      inputUsdPer1M: 0.075,
      outputUsdPer1M: 0.3,
      baseCreditCost: 1,
      creditsPer1kTokens: 1,
      description: 'Ultra-fast, low-cost everyday chat, PDF, vision & search',
    },
    {
      id: 'gemini-3.8-flash',
      label: 'Google Gemini 3.8 Flash',
      provider: 'gemini',
      tier: 'gemini',
      category: 'chat',
      enabled: true,
      inputUsdPer1M: 0.15,
      outputUsdPer1M: 0.6,
      baseCreditCost: 2,
      creditsPer1kTokens: 1,
      description: 'Deep multimodal reasoning, native PDF vision & Google Search grounding',
    },
  ],
};

let seedPromise: Promise<void> | null = null;

function createSampleReceiptDataUrl(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="540" viewBox="0 0 420 540">
  <rect width="420" height="540" rx="20" fill="#FDF2F8"/>
  <rect x="24" y="24" width="372" height="492" rx="16" fill="#FFFFFF" stroke="#FBCFE8" stroke-width="2"/>
  <rect x="24" y="24" width="372" height="76" rx="16" fill="#E2136E"/>
  <text x="210" y="68" fill="#FFFFFF" font-family="sans-serif" font-size="22" font-weight="bold" text-anchor="middle">bKash Send Money Receipt</text>
  <text x="52" y="145" fill="#64748B" font-family="sans-serif" font-size="13">Receiver Merchant</text>
  <text x="52" y="168" fill="#0F172A" font-family="monospace" font-size="16" font-weight="bold">01711-948201</text>
  <text x="52" y="215" fill="#64748B" font-family="sans-serif" font-size="13">Sender Wallet</text>
  <text x="52" y="238" fill="#0F172A" font-family="monospace" font-size="16" font-weight="bold">01712-884920</text>
  <text x="52" y="285" fill="#64748B" font-family="sans-serif" font-size="13">Transaction ID (TrxID)</text>
  <text x="52" y="308" fill="#059669" font-family="monospace" font-size="18" font-weight="bold">BKS88Q49LM</text>
  <text x="52" y="355" fill="#64748B" font-family="sans-serif" font-size="13">Amount Paid</text>
  <text x="52" y="382" fill="#0F172A" font-family="monospace" font-size="24" font-weight="bold">50.00 BDT</text>
  <rect x="52" y="425" width="316" height="52" rx="10" fill="#ECFDF5"/>
  <text x="210" y="456" fill="#065F46" font-family="sans-serif" font-size="14" font-weight="bold" text-anchor="middle">Payment Successful · Manual Review Screenshot</text>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export async function ensureSeeded(): Promise<void> {
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    try {
      // 1. Seed Platform Config
      await db
        .insert(platformSettings)
        .values({
          key: 'core_config',
          valueJson: JSON.stringify(DEFAULT_PLATFORM_CONFIG),
        })
        .onConflictDoNothing();

      // 2. Seed 20, 50, 100, 200 BDT Recharge Packages
      const defaultPacks = [
        { name: 'Starter 20 BDT Pack', amountBdt: 20, credits: 50, validityDays: 30 },
        { name: 'Standard 50 BDT Pack', amountBdt: 50, credits: 150, validityDays: 30 },
        { name: 'Plus 100 BDT Pack', amountBdt: 100, credits: 350, validityDays: 30 },
        { name: 'Power 200 BDT Pack', amountBdt: 200, credits: 800, validityDays: 30 },
      ];
      for (const pack of defaultPacks) {
        await db
          .insert(rechargePackages)
          .values(pack)
          .onConflictDoNothing({ target: rechargePackages.amountBdt });
      }

      // 3. Always ensure exact `admin` / `admin` Administrator account exists
      const existingSimpleAdmin = await db
        .select()
        .from(users)
        .where(eq(users.email, 'admin'));
      if (existingSimpleAdmin.length === 0) {
        const simpleAdminPass = await hashPassword('admin');
        const in365Days = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
        const [simpleAdminRow] = await db
          .insert(users)
          .values({
            uid: 'local_admin_simple',
            email: 'admin',
            fullName: 'QAAGA Administrator',
            passwordHash: simpleAdminPass,
            role: 'admin',
            status: 'ACTIVE',
            subscriptionExpiresAt: in365Days,
            dailyCreditLimit: 10000,
          })
          .returning();

        await db.insert(creditLedger).values({
          userId: simpleAdminRow.id,
          entryType: 'GRANT_RECHARGE',
          feature: 'recharge',
          deltaCredits: 1000,
          balanceAfter: 1000,
          description: 'Administrator Starter Allocation',
        });
      }

      // 3b. Always ensure quick test `user` / `user` (0 credits -> needs recharge) exists
      const existingSimpleUser = await db
        .select()
        .from(users)
        .where(eq(users.email, 'user'));
      if (existingSimpleUser.length === 0) {
        const simpleUserPass = await hashPassword('user');
        const [simpleUserRow] = await db
          .insert(users)
          .values({
            uid: 'local_user_simple',
            email: 'user',
            fullName: 'QAAGA User',
            passwordHash: simpleUserPass,
            role: 'user',
            status: 'PENDING',
            subscriptionExpiresAt: null,
            dailyCreditLimit: 500,
          })
          .returning();

        await db.insert(notifications).values({
          userId: simpleUserRow.id,
          title: 'Welcome to QAAGA AGENT!',
          detail:
            'Recharge a 20, 50, 100, or 200 BDT plan via bKash, Nagad, or Rocket to unlock all AI commands for 30 days.',
        });
      }

      // 4. Seed Reference Demo Accounts if tanvir@qaaga.ai does not exist yet
      const existingTanvir = await db
        .select()
        .from(users)
        .where(eq(users.email, 'tanvir@qaaga.ai'));
      if (existingTanvir.length === 0) {
        const adminPass = await hashPassword('Admin@12345');
        const userPass = await hashPassword('User@12345');
        const pendingPass = await hashPassword('Pending@12345');
        const expiredPass = await hashPassword('Expired@12345');

        const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        const in18Days = new Date(Date.now() + 18 * 24 * 60 * 60 * 1000);
        const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

        const [adminRow] = await db
          .insert(users)
          .values({
            uid: 'local_admin_root',
            email: 'admin@qaaga.ai',
            fullName: 'QAAGA Platform Admin',
            passwordHash: adminPass,
            role: 'admin',
            status: 'ACTIVE',
            subscriptionExpiresAt: in30Days,
            dailyCreditLimit: 5000,
          })
          .returning();

        const [tanvirRow] = await db
          .insert(users)
          .values({
            uid: 'local_tanvir_ahmed',
            email: 'tanvir@qaaga.ai',
            fullName: 'Tanvir Ahmed',
            passwordHash: userPass,
            role: 'user',
            status: 'ACTIVE',
            subscriptionExpiresAt: in18Days,
            dailyCreditLimit: 500,
          })
          .returning();

        await db.insert(users).values({
          uid: 'local_nusrat_pending',
          email: 'nusrat.jahan@example.com',
          fullName: 'Nusrat Jahan',
          passwordHash: pendingPass,
          role: 'user',
          status: 'PENDING',
          subscriptionExpiresAt: null,
          dailyCreditLimit: 300,
        });

        const [expiredUser] = await db
          .insert(users)
          .values({
            uid: 'local_arif_expired',
            email: 'arif.hossain@example.com',
            fullName: 'Arif Hossain',
            passwordHash: expiredPass,
            role: 'user',
            status: 'ACTIVE',
            subscriptionExpiresAt: twoDaysAgo,
            dailyCreditLimit: 300,
          })
          .returning();

        // Admin starter ledger
        await db.insert(creditLedger).values({
          userId: adminRow.id,
          entryType: 'GRANT_RECHARGE',
          feature: 'recharge',
          deltaCredits: 1000,
          balanceAfter: 1000,
          description: 'Initial Administrator Platform Allocation',
        });

        // Tanvir realistic append-only ledger (350 granted -> 120 used -> 230 remaining)
        await db.insert(creditLedger).values([
          {
            userId: tanvirRow.id,
            entryType: 'GRANT_RECHARGE',
            feature: 'recharge',
            deltaCredits: 350,
            balanceAfter: 350,
            description: 'Approved 100 BDT Nagad Recharge (TrxID NGD71K09LP) · 30-Day Subscription',
          },
          {
            userId: tanvirRow.id,
            entryType: 'SETTLE',
            feature: 'chat',
            deltaCredits: -58,
            balanceAfter: 292,
            description: 'AI Chat & Code Synthesis (gpt-4o / gpt-4o-mini)',
          },
          {
            userId: tanvirRow.id,
            entryType: 'SETTLE',
            feature: 'image',
            deltaCredits: -36,
            balanceAfter: 256,
            description: 'Image Generation & Vision Inspections (3 runs)',
          },
          {
            userId: tanvirRow.id,
            entryType: 'SETTLE',
            feature: 'pdf',
            deltaCredits: -12,
            balanceAfter: 244,
            description: 'PDF Document Summarization & Q&A (2 documents)',
          },
          {
            userId: tanvirRow.id,
            entryType: 'SETTLE',
            feature: 'search',
            deltaCredits: -8,
            balanceAfter: 236,
            description: 'Live Grounded Web Search Queries',
          },
          {
            userId: tanvirRow.id,
            entryType: 'SETTLE',
            feature: 'voice',
            deltaCredits: -6,
            balanceAfter: 230,
            description: 'Speech-to-Text & Neural TTS Voice Turns',
          },
        ]);

        // Expired user carry-forward balance waiting for renewal
        await db.insert(creditLedger).values({
          userId: expiredUser.id,
          entryType: 'GRANT_RECHARGE',
          feature: 'recharge',
          deltaCredits: 65,
          balanceAfter: 65,
          description: 'Previous Plan Unused Carry-Forward Balance (Awaiting Renewal)',
        });

        // Seed realistic Provider Usage Logs (USD vs Internal Credits tracked separately)
        await db.insert(providerUsageLogs).values([
          {
            userId: tanvirRow.id,
            provider: 'openai',
            model: 'gpt-4o',
            feature: 'chat',
            promptTokens: 14200,
            completionTokens: 8600,
            totalTokens: 22800,
            providerCostUsd: '0.121500',
            internalCreditsCharged: 58,
          },
          {
            userId: tanvirRow.id,
            provider: 'openai',
            model: 'gpt-4o-mini',
            feature: 'pdf',
            promptTokens: 28400,
            completionTokens: 4900,
            totalTokens: 33300,
            providerCostUsd: '0.007200',
            internalCreditsCharged: 12,
          },
          {
            userId: tanvirRow.id,
            provider: 'openai',
            model: 'dall-e-3',
            feature: 'image',
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            providerCostUsd: '0.120000',
            internalCreditsCharged: 36,
          },
        ]);

        // Seed 1 Approved + 1 Pending manual MFS payment request with private screenshot
        await db.insert(paymentRequests).values([
          {
            userId: tanvirRow.id,
            paymentMethod: 'Nagad',
            receiverNumber: '01819-550312 (Merchant)',
            senderNumber: '01845-339120',
            transactionId: 'NGD71K09LP',
            amountBdt: 100,
            creditsToGrant: 350,
            screenshotData: createSampleReceiptDataUrl(),
            screenshotMime: 'image/svg+xml',
            status: 'APPROVED',
            adminNote: 'Verified against Nagad merchant statement.',
            reviewedBy: adminRow.id,
            reviewedAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000),
          },
          {
            userId: tanvirRow.id,
            paymentMethod: 'bKash',
            receiverNumber: '01711-948201 (Merchant)',
            senderNumber: '01712-884920',
            transactionId: 'BKS88Q49LM',
            amountBdt: 50,
            creditsToGrant: 150,
            screenshotData: createSampleReceiptDataUrl(),
            screenshotMime: 'image/svg+xml',
            status: 'PENDING',
          },
        ]);

        // Seed Notifications & Initial Chat Session
        await db.insert(notifications).values([
          {
            userId: tanvirRow.id,
            title: '30-Day Subscription Active',
            detail: 'Your QAAGA AGENT account is approved with 230 internal credits available.',
            isRead: false,
          },
          {
            userId: adminRow.id,
            title: 'Pending Verifications Waiting',
            detail: '1 user account (Nusrat Jahan) and 1 bKash payment (50 BDT) await review.',
            isRead: false,
          },
        ]);

        const [welcomeSess] = await db
          .insert(chatSessions)
          .values({
            userId: tanvirRow.id,
            title: 'Production SaaS Credit Ledger Architecture',
            model: 'gpt-4o',
            mode: 'chat',
          })
          .returning();

        await db.insert(chatMessages).values([
          {
            sessionId: welcomeSess.id,
            userId: tanvirRow.id,
            role: 'user',
            content: 'How does QAAGA AGENT separate internal credits from provider API costs?',
            model: 'gpt-4o',
            mode: 'chat',
          },
          {
            sessionId: welcomeSess.id,
            userId: tanvirRow.id,
            role: 'assistant',
            content:
              '### Dual-Ledger Metering Architecture\n\n1. **Internal Platform Credits (`credit_ledger`)**: Append-only ACID transactions (`RESERVE` → `SETTLE` / `REFUND`) govern user-facing prepaid credits and 30-day carry-forward validity.\n2. **Provider API Telemetry (`provider_usage_logs`)**: Tracks exact prompt/completion token counts and real USD costs per model independently for administrator financial reconciliation.',
            model: 'gpt-4o',
            mode: 'chat',
            creditsCharged: 4,
            tokensUsed: 185,
            providerCostUsd: '0.001420',
          },
        ]);

        await db.insert(auditLogs).values({
          actorUserId: adminRow.id,
          actorEmail: adminRow.email,
          action: 'SYSTEM_BOOTSTRAP',
          targetType: 'platform',
          targetId: 'core',
          detailsJson: JSON.stringify({ note: 'Initialized QAAGA AGENT schema & packages' }),
        });
      }
    } catch (error) {
      seedPromise = null;
      console.error('Seed initialization failed:', error);
      throw new Error('Failed to initialize workspace configuration.', { cause: error });
    }
  })();

  return seedPromise;
}

export function mapUserRowToDTO(row: typeof users.$inferSelect): AuthUser {
  const now = Date.now();
  const expMs = row.subscriptionExpiresAt
    ? new Date(row.subscriptionExpiresAt).getTime()
    : 0;
  const isSubscriptionActive = expMs > now;
  const daysRemaining = isSubscriptionActive
    ? Math.max(1, Math.ceil((expMs - now) / (1000 * 60 * 60 * 24)))
    : 0;

  return {
    id: row.id,
    uid: row.uid,
    email: row.email,
    fullName: row.fullName,
    role: (row.role as 'user' | 'admin') || 'user',
    status: (row.status as AccountStatus) || 'PENDING',
    subscriptionExpiresAt: row.subscriptionExpiresAt
      ? row.subscriptionExpiresAt.toISOString()
      : null,
    isSubscriptionActive,
    daysRemaining,
    dailyCreditLimit: row.dailyCreditLimit,
    preferredModel: row.preferredModel,
    preferredVoice: row.preferredVoice,
    theme: row.theme === 'dark' ? 'dark' : 'light',
    createdAt: row.createdAt.toISOString(),
  };
}

let cachedPlatformConfig: {
  data: PlatformConfigDTO;
  expiresAt: number;
} | null = null;

export async function getPlatformConfig(): Promise<PlatformConfigDTO> {
  if (cachedPlatformConfig && cachedPlatformConfig.expiresAt > Date.now()) {
    return cachedPlatformConfig.data;
  }
  try {
    await ensureSeeded();
    const rows = await db
      .select()
      .from(platformSettings)
      .where(eq(platformSettings.key, 'core_config'));
    if (rows.length === 0) {
      cachedPlatformConfig = {
        data: DEFAULT_PLATFORM_CONFIG,
        expiresAt: Date.now() + 45_000,
      };
      return DEFAULT_PLATFORM_CONFIG;
    }

    const stored = JSON.parse(rows[0].valueJson) as Partial<PlatformConfigDTO>;
    const storedById = new Map(
      (stored.models || []).map((m) => [m.id, m] as const)
    );

    // Non-destructively merge default catalog models with any stored admin customizations
    const mergedModels = DEFAULT_PLATFORM_CONFIG.models.map((defModel) => {
      const existing = storedById.get(defModel.id);
      if (!existing) return defModel;
      storedById.delete(defModel.id);
      return {
        ...defModel,
        ...existing,
        provider:
          existing.provider === 'bridge'
            ? ('gemini' as const)
            : existing.provider || defModel.provider,
        tier: existing.tier || defModel.tier,
      };
    });

    // Preserve any custom models added previously
    for (const extra of storedById.values()) {
      mergedModels.push({
        ...extra,
        provider: extra.provider === 'bridge' ? 'gemini' : extra.provider,
      });
    }

    const mergedConfig: PlatformConfigDTO = {
      ...DEFAULT_PLATFORM_CONFIG,
      ...stored,
      branding: {
        logoDataUrl:
          typeof stored.branding?.logoDataUrl === 'string' &&
          stored.branding.logoDataUrl.trim().length > 0
            ? stored.branding.logoDataUrl.trim()
            : null,
        faviconDataUrl:
          typeof stored.branding?.faviconDataUrl === 'string' &&
          stored.branding.faviconDataUrl.trim().length > 0
            ? stored.branding.faviconDataUrl.trim()
            : null,
      },
      receiverNumbers: {
        ...DEFAULT_PLATFORM_CONFIG.receiverNumbers,
        ...(stored.receiverNumbers || {}),
      },
      creditRates: {
        ...DEFAULT_PLATFORM_CONFIG.creditRates,
        ...(stored.creditRates || {}),
      },
      toolsEnabled: {
        ...DEFAULT_PLATFORM_CONFIG.toolsEnabled,
        ...(stored.toolsEnabled || {}),
      },
      openaiWallet: {
        ...DEFAULT_PLATFORM_CONFIG.openaiWallet,
        ...(stored.openaiWallet || {}),
      },
      models: mergedModels,
    };
    cachedPlatformConfig = {
      data: mergedConfig,
      expiresAt: Date.now() + 45_000,
    };
    return mergedConfig;
  } catch (error) {
    console.error('Failed to read platform config:', error);
    throw new Error('Could not load platform configuration.', { cause: error });
  }
}

export async function recordProviderApiError(params: {
  actorUserId?: number | null;
  actorEmail: string;
  provider: 'openai' | 'gemini';
  model: string;
  feature: string;
  status: number | null;
  errorCode: string;
  safeMessage: string;
}): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      actorUserId: params.actorUserId ?? null,
      actorEmail: params.actorEmail,
      action: 'PROVIDER_API_ERROR',
      targetType: params.provider,
      targetId: params.model,
      detailsJson: JSON.stringify({
        provider: params.provider,
        model: params.model,
        feature: params.feature,
        status: params.status,
        errorCode: params.errorCode,
        message: params.safeMessage.slice(0, 320),
      }),
    });
  } catch (err) {
    console.error('Failed to record provider error log:', err);
  }
}

function sanitizeBrandAssetUrl(
  raw: string | null | undefined,
  label: string
): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > 3_000_000) {
    throw new Error(`${label} exceeds maximum size (approx. 2 MB). Please upload a smaller image.`);
  }
  const isAllowedDataUrl = /^data:image\/(png|svg\+xml|webp|jpeg|jpg|gif|x-icon|vnd\.microsoft\.icon);base64,[A-Za-z0-9+/=\s]+$/i.test(
    trimmed
  );
  const isAllowedHttpUrl = /^https?:\/\/[^\s"'<>]+$/i.test(trimmed);
  if (!isAllowedDataUrl && !isAllowedHttpUrl) {
    throw new Error(
      `${label} must be a valid image upload (PNG, SVG, WEBP, JPG, GIF, ICO) or direct https:// URL.`
    );
  }
  return trimmed;
}

export async function savePlatformConfig(
  nextConfig: PlatformConfigDTO,
  actor: { id: number; email: string }
): Promise<PlatformConfigDTO> {
  try {
    const cleanModels = (nextConfig.models || []).map((m) => {
      const { available: _av, availabilityNote: _note, ...persisted } = m;
      return persisted;
    });
    const sanitizedBranding = {
      logoDataUrl: sanitizeBrandAssetUrl(
        nextConfig.branding?.logoDataUrl,
        'Logo Icon'
      ),
      faviconDataUrl: sanitizeBrandAssetUrl(
        nextConfig.branding?.faviconDataUrl,
        'Favicon'
      ),
    };
    const toPersist: PlatformConfigDTO = {
      ...nextConfig,
      branding: sanitizedBranding,
      models: cleanModels,
    };

    await db
      .insert(platformSettings)
      .values({
        key: 'core_config',
        valueJson: JSON.stringify(toPersist),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: platformSettings.key,
        set: {
          valueJson: JSON.stringify(toPersist),
          updatedAt: new Date(),
        },
      });

    await db.insert(auditLogs).values({
      actorUserId: actor.id,
      actorEmail: actor.email,
      action: 'UPDATE_PLATFORM_CONFIG',
      targetType: 'platform_settings',
      targetId: 'core_config',
      detailsJson: JSON.stringify({
        hasCustomLogo: Boolean(sanitizedBranding.logoDataUrl),
        hasCustomFavicon: Boolean(sanitizedBranding.faviconDataUrl),
        receiverNumbers: toPersist.receiverNumbers,
        toolsEnabled: toPersist.toolsEnabled,
        dailySpendLimitUsd: toPersist.openaiWallet.dailySpendLimitUsd,
        monthlySpendLimitUsd: toPersist.openaiWallet.monthlySpendLimitUsd,
      }),
    });
    cachedPlatformConfig = {
      data: toPersist,
      expiresAt: Date.now() + 45_000,
    };
    return toPersist;
  } catch (error) {
    console.error('Failed to save platform config:', error);
    throw new Error(
      error instanceof Error ? error.message : 'Could not update platform settings.',
      { cause: error }
    );
  }
}

export async function getOrCreateGoogleUser(
  uid: string,
  email: string,
  displayName?: string
): Promise<typeof users.$inferSelect> {
  try {
    await ensureSeeded();
    const normalizedEmail = email.trim().toLowerCase();
    const bootstrapAdmin = (
      process.env.ADMIN_BOOTSTRAP_EMAIL || 'rafsankhan.tv@gmail.com'
    )
      .trim()
      .toLowerCase();
    const isOwner = normalizedEmail === bootstrapAdmin;

    // Check by email first in case account already exists
    const byEmail = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail));

    if (byEmail.length > 0) {
      const existing = byEmail[0];
      if (isOwner && existing.role !== 'admin') {
        const [promoted] = await db
          .update(users)
          .set({
            uid,
            role: 'admin',
            status: 'ACTIVE',
            subscriptionExpiresAt:
              existing.subscriptionExpiresAt ||
              new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            updatedAt: new Date(),
          })
          .where(eq(users.id, existing.id))
          .returning();
        return promoted;
      }
      return existing;
    }

    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const [inserted] = await db
      .insert(users)
      .values({
        uid,
        email: normalizedEmail,
        fullName: displayName?.trim() || normalizedEmail.split('@')[0],
        role: isOwner ? 'admin' : 'user',
        status: isOwner ? 'ACTIVE' : 'PENDING',
        subscriptionExpiresAt: isOwner ? in30Days : null,
        dailyCreditLimit: isOwner ? 5000 : 500,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: { email: normalizedEmail, updatedAt: new Date() },
      })
      .returning();

    if (isOwner) {
      await db.insert(creditLedger).values({
        userId: inserted.id,
        entryType: 'GRANT_RECHARGE',
        feature: 'recharge',
        deltaCredits: 500,
        balanceAfter: 500,
        description: 'Administrator Owner Starter Credit Allocation',
      });
    } else {
      await db.insert(notifications).values({
        userId: inserted.id,
        title: 'Registration Received — Pending Approval',
        detail:
          'Your QAAGA AGENT account is awaiting administrator verification before AI tools unlock.',
      });
    }

    return inserted;
  } catch (error) {
    console.error('getOrCreateGoogleUser failed:', error);
    throw new Error('Authentication user sync failed.', { cause: error });
  }
}

export async function computeUserCredits(userId: number, dailyLimit: number): Promise<{
  summary: CreditSummary;
  recentLedger: LedgerEntryDTO[];
}> {
  try {
    const entries = await db
      .select()
      .from(creditLedger)
      .where(eq(creditLedger.userId, userId))
      .orderBy(desc(creditLedger.id));

    let totalGranted = 0;
    let totalNetSpent = 0;
    let usedToday = 0;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const byFeature = {
      chat: 0,
      image: 0,
      pdf: 0,
      search: 0,
      voice: 0,
    };

    // Compute exact balance by summing all append-only deltas
    let currentBalance = 0;
    for (const row of entries) {
      currentBalance += row.deltaCredits;
      if (row.deltaCredits > 0 && (row.entryType === 'GRANT_RECHARGE' || row.entryType === 'ADMIN_ADJUST')) {
        totalGranted += row.deltaCredits;
      }
      if (row.entryType === 'RESERVE' || row.entryType === 'SETTLE' || row.entryType === 'REFUND') {
        const spentDelta = -row.deltaCredits; // positive when spent, negative when refunded
        totalNetSpent += spentDelta;
        if (new Date(row.createdAt) >= startOfToday) {
          usedToday += spentDelta;
        }
        if (row.feature in byFeature) {
          byFeature[row.feature as keyof typeof byFeature] += spentDelta;
        }
      }
    }

    return {
      summary: {
        totalGranted: Math.max(0, totalGranted),
        totalUsed: Math.max(0, totalNetSpent),
        remaining: Math.max(0, currentBalance),
        usedToday: Math.max(0, usedToday),
        dailyLimit,
        byFeature: {
          chat: Math.max(0, byFeature.chat),
          image: Math.max(0, byFeature.image),
          pdf: Math.max(0, byFeature.pdf),
          search: Math.max(0, byFeature.search),
          voice: Math.max(0, byFeature.voice),
        },
      },
      recentLedger: entries.slice(0, 40).map((e) => ({
        id: e.id,
        entryType: e.entryType,
        feature: e.feature,
        deltaCredits: e.deltaCredits,
        balanceAfter: e.balanceAfter,
        reservationId: e.reservationId,
        description: e.description,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  } catch (error) {
    console.error('computeUserCredits failed:', error);
    throw new Error('Failed to read credit ledger.', { cause: error });
  }
}

/**
 * Atomic Reservation before calling external AI API to prevent overspending.
 */
export async function reserveCreditsForUsage(params: {
  userId: number;
  feature: 'chat' | 'image' | 'pdf' | 'search' | 'voice';
  reserveAmount: number;
  description: string;
}): Promise<{ reservationId: string; balanceAfter: number }> {
  const reservationId = `rsv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    return await db.transaction(async (tx) => {
      const [userRow] = await tx
        .select()
        .from(users)
        .where(eq(users.id, params.userId));

      if (!userRow) {
        throw new Error('Account not found.');
      }
      if (userRow.status === 'SUSPENDED') {
        throw new Error('ACCOUNT_SUSPENDED: Your account is currently suspended.');
      }
      if (
        userRow.status === 'PENDING' ||
        !userRow.subscriptionExpiresAt ||
        new Date(userRow.subscriptionExpiresAt).getTime() <= Date.now()
      ) {
        throw new Error(
          'RECHARGE_REQUIRED: Your account does not have an active 30-day plan. Please recharge a 20, 50, 100, or 200 BDT package to run AI commands.'
        );
      }

      const entries = await tx
        .select()
        .from(creditLedger)
        .where(eq(creditLedger.userId, params.userId));

      let balance = 0;
      let spentToday = 0;
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      for (const e of entries) {
        balance += e.deltaCredits;
        if (
          (e.entryType === 'RESERVE' ||
            e.entryType === 'SETTLE' ||
            e.entryType === 'REFUND') &&
          new Date(e.createdAt) >= todayStart
        ) {
          spentToday += -e.deltaCredits;
        }
      }

      if (balance < params.reserveAmount) {
        throw new Error(
          `RECHARGE_REQUIRED: Insufficient credits (${balance} available, ${params.reserveAmount} required). Please recharge your account.`
        );
      }
      if (spentToday + params.reserveAmount > userRow.dailyCreditLimit) {
        throw new Error(
          `Daily usage limit (${userRow.dailyCreditLimit} credits/day) reached.`
        );
      }

      const nextBalance = balance - params.reserveAmount;
      await tx.insert(creditLedger).values({
        userId: params.userId,
        entryType: 'RESERVE',
        feature: params.feature,
        deltaCredits: -params.reserveAmount,
        balanceAfter: nextBalance,
        reservationId,
        description: params.description,
      });

      return { reservationId, balanceAfter: nextBalance };
    });
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error('Failed to reserve credits.', { cause: error });
  }
}

/**
 * Settle or adjust a reservation after actual token count is known, OR refund 100% on error.
 */
export async function finalizeCreditReservation(params: {
  userId: number;
  reservationId: string;
  reservedAmount: number;
  actualAmount: number;
  feature: 'chat' | 'image' | 'pdf' | 'search' | 'voice';
  description: string;
}): Promise<number> {
  try {
    return await db.transaction(async (tx) => {
      const entries = await tx
        .select()
        .from(creditLedger)
        .where(eq(creditLedger.userId, params.userId));

      let balance = 0;
      for (const e of entries) balance += e.deltaCredits;

      const diff = params.reservedAmount - params.actualAmount;
      if (diff === 0) {
        return balance;
      }

      if (diff > 0) {
        // Refund unused portion of reservation (or full refund if actualAmount === 0)
        const nextBalance = balance + diff;
        await tx.insert(creditLedger).values({
          userId: params.userId,
          entryType: 'REFUND',
          feature: params.feature,
          deltaCredits: diff,
          balanceAfter: nextBalance,
          reservationId: params.reservationId,
          description:
            params.actualAmount === 0
              ? `Full refund for failed request (${params.description})`
              : `Reservation settlement refund (+${diff} unused credits)`,
        });
        return nextBalance;
      } else {
        // Additional settlement charge (capped at available balance so never negative)
        const extraCharge = Math.min(balance, Math.abs(diff));
        if (extraCharge > 0) {
          const nextBalance = balance - extraCharge;
          await tx.insert(creditLedger).values({
            userId: params.userId,
            entryType: 'SETTLE',
            feature: params.feature,
            deltaCredits: -extraCharge,
            balanceAfter: nextBalance,
            reservationId: params.reservationId,
            description: `Token usage settlement (${params.description})`,
          });
          return nextBalance;
        }
        return balance;
      }
    });
  } catch (error) {
    console.error('finalizeCreditReservation failed:', error);
    throw new Error('Credit settlement failed.', { cause: error });
  }
}

/**
 * Admin Approves Payment Request:
 * - Prevents duplicate approval
 * - Carries forward remaining credits + adds package credits
 * - Resets expiration to fresh 30 days from approval timestamp
 */
export async function reviewPaymentRequestAtomic(params: {
  paymentId: number;
  decision: 'APPROVED' | 'REJECTED';
  adminNote?: string;
  adminUser: { id: number; email: string };
}): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      const [payment] = await tx
        .select()
        .from(paymentRequests)
        .where(eq(paymentRequests.id, params.paymentId));

      if (!payment) {
        throw new Error('Payment request not found.');
      }
      if (payment.status !== 'PENDING') {
        throw new Error(
          `Payment ${payment.transactionId} has already been ${payment.status.toLowerCase()}. Duplicate approval prevented.`
        );
      }

      await tx
        .update(paymentRequests)
        .set({
          status: params.decision,
          adminNote: params.adminNote || null,
          reviewedBy: params.adminUser.id,
          reviewedAt: new Date(),
        })
        .where(eq(paymentRequests.id, payment.id));

      if (params.decision === 'APPROVED') {
        const entries = await tx
          .select()
          .from(creditLedger)
          .where(eq(creditLedger.userId, payment.userId));

        let existingBalance = 0;
        for (const e of entries) existingBalance += e.deltaCredits;

        const nextBalance = existingBalance + payment.creditsToGrant;
        const fresh30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        await tx.insert(creditLedger).values({
          userId: payment.userId,
          entryType: 'GRANT_RECHARGE',
          feature: 'recharge',
          deltaCredits: payment.creditsToGrant,
          balanceAfter: nextBalance,
          description: `Approved ${payment.amountBdt} BDT ${payment.paymentMethod} (TrxID: ${payment.transactionId}) · +${payment.creditsToGrant} cr (${existingBalance} cr carried forward)`,
        });

        await tx
          .update(users)
          .set({
            status: 'ACTIVE',
            subscriptionExpiresAt: fresh30Days,
            updatedAt: new Date(),
          })
          .where(eq(users.id, payment.userId));

        await tx.insert(notifications).values({
          userId: payment.userId,
          title: 'Recharge Approved — 30-Day Subscription Renewed',
          detail: `${payment.amountBdt} BDT (${payment.paymentMethod} TrxID ${payment.transactionId}) verified! +${payment.creditsToGrant} credits added (New Balance: ${nextBalance} credits). Valid for 30 days.`,
        });
      } else {
        await tx.insert(notifications).values({
          userId: payment.userId,
          title: 'Recharge Verification Declined',
          detail: `Your ${payment.amountBdt} BDT ${payment.paymentMethod} request (TrxID ${payment.transactionId}) was declined. ${
            params.adminNote ? `Reason: ${params.adminNote}` : ''
          }`,
        });
      }

      await tx.insert(auditLogs).values({
        actorUserId: params.adminUser.id,
        actorEmail: params.adminUser.email,
        action: `PAYMENT_${params.decision}`,
        targetType: 'payment_request',
        targetId: String(payment.id),
        detailsJson: JSON.stringify({
          transactionId: payment.transactionId,
          amountBdt: payment.amountBdt,
          creditsToGrant: payment.creditsToGrant,
          adminNote: params.adminNote,
        }),
      });
    });
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error('Failed to process payment review.', { cause: error });
  }
}

export async function buildAdminDashboardData(): Promise<AdminDashboardDTO> {
  try {
    const config = await getPlatformConfig();
    const allUsers = await db.select().from(users).orderBy(desc(users.id));
    const allLedger = await db.select().from(creditLedger);
    const allProviderLogs = await db.select().from(providerUsageLogs);
    const allPayments = await db
      .select()
      .from(paymentRequests)
      .orderBy(desc(paymentRequests.id));
    const recentAudits = await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.id))
      .limit(90);

    const allMessages = await db
      .select()
      .from(chatMessages)
      .orderBy(desc(chatMessages.id))
      .limit(120);

    const userMap = new Map<number, (typeof allUsers)[0]>();
    for (const u of allUsers) userMap.set(u.id, u);

    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    let activeUsers = 0;
    let pendingUsers = 0;
    let suspendedUsers = 0;
    let expiredUsers = 0;

    for (const u of allUsers) {
      const exp = u.subscriptionExpiresAt
        ? new Date(u.subscriptionExpiresAt).getTime()
        : 0;
      if (u.status === 'PENDING') pendingUsers++;
      else if (u.status === 'SUSPENDED') suspendedUsers++;
      else if (u.status === 'ACTIVE') {
        if (exp > now) activeUsers++;
        else expiredUsers++;
      }
    }

    let totalRevenueBdt = 0;
    let pendingPaymentsCount = 0;
    let pendingPaymentsBdt = 0;
    let approvedPaymentsCount = 0;
    const latestPlanByUser = new Map<number, number>();
    for (const p of allPayments) {
      if (p.status === 'APPROVED') {
        totalRevenueBdt += p.amountBdt;
        approvedPaymentsCount++;
        if (!latestPlanByUser.has(p.userId)) {
          latestPlanByUser.set(p.userId, p.amountBdt);
        }
      } else if (p.status === 'PENDING') {
        pendingPaymentsCount++;
        pendingPaymentsBdt += p.amountBdt;
      }
    }

    let openaiUsedUsd = 0;
    let openaiTodayUsd = 0;
    let geminiUsedUsd = 0;
    let geminiTodayUsd = 0;
    let totalTokensUsed = 0;

    const modelMap = new Map<
      string,
      {
        model: string;
        provider: string;
        totalTokens: number;
        usdCost: number;
        creditsCharged: number;
        requests: number;
      }
    >();
    const dailyMap = new Map<
      string,
      {
        date: string;
        credits: number;
        usdCost: number;
        openaiUsdCost: number;
        geminiUsdCost: number;
        tokens: number;
        requests: number;
      }
    >();
    const featureAgg = new Map<
      string,
      { feature: string; credits: number; usdCost: number; requests: number }
    >();
    const userProviderAgg = new Map<
      number,
      {
        usdCost: number;
        openaiUsdCost: number;
        geminiUsdCost: number;
        requests: number;
        tokens: number;
        creditsCharged: number;
      }
    >();

    for (let i = 9; i >= 0; i--) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000);
      const label = d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      dailyMap.set(label, {
        date: label,
        credits: 0,
        usdCost: 0,
        openaiUsdCost: 0,
        geminiUsdCost: 0,
        tokens: 0,
        requests: 0,
      });
    }

    for (const log of allProviderLogs) {
      const usd = Number(log.providerCostUsd) || 0;
      const isGemini =
        log.provider === 'gemini' ||
        log.provider === 'bridge' ||
        log.model.startsWith('gemini');
      const isToday = new Date(log.createdAt) >= todayStart;

      if (isGemini) {
        geminiUsedUsd += usd;
        if (isToday) geminiTodayUsd += usd;
      } else {
        openaiUsedUsd += usd;
        if (isToday) openaiTodayUsd += usd;
      }

      totalTokensUsed += log.totalTokens;

      const dayLabel = new Date(log.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      const dayEntry = dailyMap.get(dayLabel) || {
        date: dayLabel,
        credits: 0,
        usdCost: 0,
        openaiUsdCost: 0,
        geminiUsdCost: 0,
        tokens: 0,
        requests: 0,
      };
      dayEntry.usdCost = Number((dayEntry.usdCost + usd).toFixed(6));
      if (isGemini) {
        dayEntry.geminiUsdCost = Number(
          (dayEntry.geminiUsdCost + usd).toFixed(6)
        );
      } else {
        dayEntry.openaiUsdCost = Number(
          (dayEntry.openaiUsdCost + usd).toFixed(6)
        );
      }
      dayEntry.tokens += log.totalTokens;
      dayEntry.credits += log.internalCreditsCharged;
      dayEntry.requests += 1;
      dailyMap.set(dayLabel, dayEntry);

      const normalizedProvider = isGemini ? 'gemini' : 'openai';
      const mKey = `${normalizedProvider}:${log.model}`;
      const mEntry = modelMap.get(mKey) || {
        model: log.model,
        provider: normalizedProvider,
        totalTokens: 0,
        usdCost: 0,
        creditsCharged: 0,
        requests: 0,
      };
      mEntry.totalTokens += log.totalTokens;
      mEntry.usdCost = Number((mEntry.usdCost + usd).toFixed(6));
      mEntry.creditsCharged += log.internalCreditsCharged;
      mEntry.requests += 1;
      modelMap.set(mKey, mEntry);

      const fEntry = featureAgg.get(log.feature) || {
        feature: log.feature,
        credits: 0,
        usdCost: 0,
        requests: 0,
      };
      fEntry.credits += log.internalCreditsCharged;
      fEntry.usdCost = Number((fEntry.usdCost + usd).toFixed(6));
      fEntry.requests += 1;
      featureAgg.set(log.feature, fEntry);

      const uAgg = userProviderAgg.get(log.userId) || {
        usdCost: 0,
        openaiUsdCost: 0,
        geminiUsdCost: 0,
        requests: 0,
        tokens: 0,
        creditsCharged: 0,
      };
      uAgg.usdCost = Number((uAgg.usdCost + usd).toFixed(6));
      if (isGemini) {
        uAgg.geminiUsdCost = Number((uAgg.geminiUsdCost + usd).toFixed(6));
      } else {
        uAgg.openaiUsdCost = Number((uAgg.openaiUsdCost + usd).toFixed(6));
      }
      uAgg.requests += 1;
      uAgg.tokens += log.totalTokens;
      uAgg.creditsCharged += log.internalCreditsCharged;
      userProviderAgg.set(log.userId, uAgg);
    }

    // Per-user credit & modality aggregation
    const perUserLedger = new Map<
      number,
      {
        assigned: number;
        used: number;
        usedToday: number;
        remaining: number;
        chat: number;
        image: number;
        pdf: number;
        search: number;
        voice: number;
      }
    >();

    let poolTotalAssigned = 0;
    let poolTotalUsed = 0;
    let poolTotalRemaining = 0;

    for (const l of allLedger) {
      const agg = perUserLedger.get(l.userId) || {
        assigned: 0,
        used: 0,
        usedToday: 0,
        remaining: 0,
        chat: 0,
        image: 0,
        pdf: 0,
        search: 0,
        voice: 0,
      };
      agg.remaining += l.deltaCredits;
      if (
        l.deltaCredits > 0 &&
        (l.entryType === 'GRANT_RECHARGE' || l.entryType === 'ADMIN_ADJUST')
      ) {
        agg.assigned += l.deltaCredits;
      }
      if (
        l.entryType === 'RESERVE' ||
        l.entryType === 'SETTLE' ||
        l.entryType === 'REFUND'
      ) {
        const spent = -l.deltaCredits;
        agg.used += spent;
        if (new Date(l.createdAt) >= todayStart) {
          agg.usedToday += spent;
        }
        if (l.feature === 'chat') agg.chat += spent;
        if (l.feature === 'image') agg.image += spent;
        if (l.feature === 'pdf') agg.pdf += spent;
        if (l.feature === 'search') agg.search += spent;
        if (l.feature === 'voice') agg.voice += spent;
      }
      perUserLedger.set(l.userId, agg);
    }

    for (const agg of perUserLedger.values()) {
      poolTotalAssigned += Math.max(0, agg.assigned);
      poolTotalUsed += Math.max(0, agg.used);
      poolTotalRemaining += Math.max(0, agg.remaining);
    }

    const purchasedUsd = config.openaiWallet.purchasedUsd;
    const remainingEstimatedUsd = Math.max(
      0,
      Number((purchasedUsd - openaiUsedUsd).toFixed(4))
    );
    const totalProviderUsedUsd = Number(
      (openaiUsedUsd + geminiUsedUsd).toFixed(6)
    );
    const todayProviderUsedUsd = Number(
      (openaiTodayUsd + geminiTodayUsd).toFixed(6)
    );

    const paymentsDTO: PaymentRequestDTO[] = allPayments.map((p) => {
      const u = userMap.get(p.userId);
      return {
        id: p.id,
        userId: p.userId,
        userEmail: u?.email || 'unknown',
        userName: u?.fullName || 'User',
        packageId: p.packageId,
        paymentMethod: p.paymentMethod as PaymentMethodType,
        receiverNumber: p.receiverNumber,
        senderNumber: p.senderNumber,
        transactionId: p.transactionId,
        amountBdt: p.amountBdt,
        creditsToGrant: p.creditsToGrant,
        hasScreenshot: Boolean(p.screenshotData),
        status: p.status as 'PENDING' | 'APPROVED' | 'REJECTED',
        adminNote: p.adminNote,
        reviewedAt: p.reviewedAt ? p.reviewedAt.toISOString() : null,
        createdAt: p.createdAt.toISOString(),
      };
    });

    const topApiUsers = allUsers
      .map((u) => {
        const pAgg = userProviderAgg.get(u.id);
        const lAgg = perUserLedger.get(u.id);
        return {
          userId: u.id,
          fullName: u.fullName,
          email: u.email,
          usdCost: pAgg?.usdCost || 0,
          openaiUsdCost: pAgg?.openaiUsdCost || 0,
          geminiUsdCost: pAgg?.geminiUsdCost || 0,
          requests: pAgg?.requests || 0,
          tokens: pAgg?.tokens || 0,
          creditsCharged:
            pAgg?.creditsCharged || Math.max(0, lAgg?.used || 0),
        };
      })
      .sort(
        (a, b) =>
          b.usdCost - a.usdCost || b.creditsCharged - a.creditsCharged
      )
      .slice(0, 12);

    const activityLogs = allMessages.map((m) => {
      const u = userMap.get(m.userId);
      let attachmentNames: string[] = [];
      if (m.attachmentsJson) {
        try {
          const parsed = JSON.parse(m.attachmentsJson) as Array<{
            name: string;
          }>;
          attachmentNames = parsed.map((a) => a.name);
        } catch {
          attachmentNames = [];
        }
      }
      return {
        id: m.id,
        sessionId: m.sessionId,
        userId: m.userId,
        userName: u?.fullName || 'User',
        userEmail: u?.email || 'unknown',
        role: (m.role as 'user' | 'assistant') || 'assistant',
        mode: m.mode || 'chat',
        model: m.model || 'gpt-4o',
        content: m.content,
        imageDataUrl: m.imageDataUrl,
        attachmentNames,
        creditsCharged: m.creditsCharged,
        tokensUsed: m.tokensUsed,
        createdAt: m.createdAt.toISOString(),
      };
    });

    const providerErrors = recentAudits
      .filter((a) => a.action === 'PROVIDER_API_ERROR')
      .map((a) => {
        let parsed: {
          provider?: string;
          model?: string;
          feature?: string;
          status?: number | null;
          errorCode?: string;
          message?: string;
        } = {};
        if (a.detailsJson) {
          try {
            parsed = JSON.parse(a.detailsJson);
          } catch {
            // ignore
          }
        }
        return {
          id: a.id,
          provider: parsed.provider || a.targetType || 'openai',
          model: parsed.model || a.targetId || 'unknown',
          feature: parsed.feature || 'chat',
          status: parsed.status ?? null,
          errorCode: parsed.errorCode || 'provider_error',
          message: parsed.message || 'Provider request failed.',
          userEmail: a.actorEmail,
          createdAt: a.createdAt.toISOString(),
        };
      });

    const announcements = recentAudits
      .filter((a) => a.action === 'BROADCAST_ANNOUNCEMENT')
      .map((a) => {
        let parsed = { title: 'Platform Announcement', detail: '' };
        if (a.detailsJson) {
          try {
            parsed = JSON.parse(a.detailsJson);
          } catch {
            // ignore
          }
        }
        return {
          id: a.id,
          title: parsed.title || 'Platform Announcement',
          detail: parsed.detail || '',
          createdAt: a.createdAt.toISOString(),
        };
      });

    return {
      kpis: {
        totalUsers: allUsers.length,
        activeUsers,
        pendingUsers,
        suspendedUsers,
        expiredUsers,
        totalRevenueBdt,
        pendingPaymentsCount,
        pendingPaymentsBdt,
        approvedPaymentsCount,
        openaiPurchasedUsd: purchasedUsd,
        openaiUsedUsd: Number(openaiUsedUsd.toFixed(6)),
        openaiTodayUsd: Number(openaiTodayUsd.toFixed(6)),
        geminiUsedUsd: Number(geminiUsedUsd.toFixed(6)),
        geminiTodayUsd: Number(geminiTodayUsd.toFixed(6)),
        totalProviderUsedUsd,
        todayProviderUsedUsd,
        openaiRemainingEstimatedUsd: remainingEstimatedUsd,
        dailySpendLimitUsd: config.openaiWallet.dailySpendLimitUsd ?? 15.0,
        monthlySpendLimitUsd: config.openaiWallet.monthlySpendLimitUsd,
        totalTokensUsed,
        walletSourceLabel:
          'Separate Provider Metering (OpenAI USD vs. Google Gemini USD · Reconciled Against Daily & Monthly Caps)',
      },
      creditPool: {
        totalAssigned: poolTotalAssigned,
        totalUsed: poolTotalUsed,
        totalRemaining: poolTotalRemaining,
      },
      dailyUsage: Array.from(dailyMap.values()),
      featureBreakdown: ['chat', 'image', 'pdf', 'search', 'voice'].map(
        (f) =>
          featureAgg.get(f) || {
            feature: f,
            credits: 0,
            usdCost: 0,
            requests: 0,
          }
      ),
      modelBreakdown: Array.from(modelMap.values()),
      topApiUsers,
      users: allUsers.map((u) => {
        const agg = perUserLedger.get(u.id) || {
          assigned: 0,
          used: 0,
          usedToday: 0,
          remaining: 0,
          chat: 0,
          image: 0,
          pdf: 0,
          search: 0,
          voice: 0,
        };
        const pAgg = userProviderAgg.get(u.id);
        const exp = u.subscriptionExpiresAt
          ? new Date(u.subscriptionExpiresAt).getTime()
          : 0;
        return {
          id: u.id,
          email: u.email,
          fullName: u.fullName,
          role: (u.role as 'user' | 'admin') || 'user',
          status: (u.status as AccountStatus) || 'PENDING',
          subscriptionExpiresAt: u.subscriptionExpiresAt
            ? u.subscriptionExpiresAt.toISOString()
            : null,
          isExpired: u.status === 'ACTIVE' && exp <= now,
          dailyCreditLimit: u.dailyCreditLimit,
          usedTodayCredits: Math.max(0, agg.usedToday),
          latestPlanBdt: latestPlanByUser.get(u.id) || null,
          creditsAssigned: Math.max(0, agg.assigned),
          creditsUsed: Math.max(0, agg.used),
          creditsRemaining: Math.max(0, agg.remaining),
          chatCredits: Math.max(0, agg.chat),
          imageCredits: Math.max(0, agg.image),
          pdfCredits: Math.max(0, agg.pdf),
          searchCredits: Math.max(0, agg.search),
          voiceCredits: Math.max(0, agg.voice),
          openaiUsdCost: pAgg?.openaiUsdCost || 0,
          geminiUsdCost: pAgg?.geminiUsdCost || 0,
          totalUsdCost: pAgg?.usdCost || 0,
          totalTokens: pAgg?.tokens || 0,
          apiRequests: pAgg?.requests || 0,
          createdAt: u.createdAt.toISOString(),
        };
      }),
      payments: paymentsDTO,
      activityLogs,
      providerErrors,
      announcements,
      auditLogs: recentAudits.map((a) => ({
        id: a.id,
        actorEmail: a.actorEmail,
        action: a.action,
        targetType: a.targetType,
        targetId: a.targetId,
        detailsJson: a.detailsJson,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  } catch (error) {
    console.error('buildAdminDashboardData failed:', error);
    throw new Error('Failed to load administrator analytics.', { cause: error });
  }
}

export async function getActivePackages(): Promise<RechargePackageDTO[]> {
  try {
    await ensureSeeded();
    const rows = await db
      .select()
      .from(rechargePackages)
      .orderBy(rechargePackages.amountBdt);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      amountBdt: r.amountBdt,
      credits: r.credits,
      validityDays: r.validityDays,
      active: r.active,
    }));
  } catch (error) {
    console.error('getActivePackages failed:', error);
    throw new Error('Failed to load recharge packages.', { cause: error });
  }
}
