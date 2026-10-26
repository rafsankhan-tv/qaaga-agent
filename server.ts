import crypto from 'crypto';
import http from 'http';
import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from './src/db/index.ts';
import {
  auditLogs,
  chatMessages,
  chatSessions,
  creditLedger,
  notifications,
  paymentRequests,
  providerUsageLogs,
  rechargePackages,
  users,
} from './src/db/schema.ts';
import {
  buildAdminDashboardData,
  computeUserCredits,
  ensureSeeded,
  finalizeCreditReservation,
  getActivePackages,
  getOrCreateGoogleUser,
  getPlatformConfig,
  mapUserRowToDTO,
  recordProviderApiError,
  reserveCreditsForUsage,
  reviewPaymentRequestAtomic,
  savePlatformConfig,
} from './src/db/repository.ts';
import {
  createRateLimiter,
  hashPassword,
  signLocalJwt,
  verifyLocalJwt,
  verifyPassword,
} from './src/lib/cryptoAuth.ts';
import { adminAuth } from './src/lib/firebase-admin.ts';
import { requireAdmin, requireAuth } from './src/middleware/auth.ts';
import type { AuthRequest } from './src/middleware/auth.ts';
import {
  calculateInternalCreditCharge,
  connectGeminiLiveVoiceSession,
  enrichConfigWithLiveAvailability,
  extractProviderErrorMeta,
  generateImageAsset,
  getOpenAIRealtimeAuthHeaders,
  streamChatCompletion,
  synthesizeSpeechAudio,
  testAllProvidersConnection,
  testOpenAIConnection,
  transcribeAudioBuffer,
} from './src/services/aiProvider.ts';
import type {
  AuthUser,
  ChatMessageDTO,
  ChatSessionDTO,
  PaymentMethodType,
  PlatformConfigDTO,
} from './src/types/qaaga.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '25mb' }));

  const authLimiter = createRateLimiter(20, 60_000);
  const aiLimiter = createRateLimiter(45, 60_000);
  const paymentLimiter = createRateLimiter(12, 60_000);

  const guestChatLimiter = createRateLimiter(40, 60_000);

  const sendCommandError = (res: express.Response, err: unknown, fallback: string) => {
    const raw = err instanceof Error ? err.message : fallback;
    if (raw.startsWith('RECHARGE_REQUIRED:')) {
      res.status(402).json({
        code: 'RECHARGE_REQUIRED',
        error: raw.replace(/^RECHARGE_REQUIRED:\s*/, ''),
      });
      return;
    }
    if (raw.startsWith('ACCOUNT_SUSPENDED:')) {
      res.status(403).json({
        code: 'ACCOUNT_SUSPENDED',
        error: raw.replace(/^ACCOUNT_SUSPENDED:\s*/, ''),
      });
      return;
    }
    res.status(400).json({ error: raw });
  };

  const enforcePlatformSpendCaps = async (config: PlatformConfigDTO) => {
    const providerLogs = await db.select().from(providerUsageLogs);
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    let todaySpendUsd = 0;
    let monthSpendUsd = 0;

    for (const r of providerLogs) {
      const usd = Number(r.providerCostUsd) || 0;
      const ts = new Date(r.createdAt);
      if (ts >= todayStart) todaySpendUsd += usd;
      if (ts >= monthStart) monthSpendUsd += usd;
    }

    const dailyCap = config.openaiWallet.dailySpendLimitUsd ?? 15.0;
    const monthlyCap = config.openaiWallet.monthlySpendLimitUsd ?? 50.0;

    if (dailyCap > 0 && todaySpendUsd >= dailyCap) {
      throw new Error(
        `Platform daily API spending cap ($${dailyCap.toFixed(2)}/day) reached. Administrator review required.`
      );
    }
    if (monthlyCap > 0 && monthSpendUsd >= monthlyCap) {
      throw new Error(
        `Platform monthly API spending cap ($${monthlyCap.toFixed(2)}/month) reached. Administrator review required.`
      );
    }
  };

  // Public Health & Provider Transparency Endpoint
  app.get('/api/public/status', async (_req, res) => {
    try {
      const rawConfig = await getPlatformConfig();
      const { capabilities } = await enrichConfigWithLiveAvailability(rawConfig);
      res.json({ capabilities });
    } catch (error: unknown) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Status check failed.',
      });
    }
  });

  // Public Front-Page Hydrator (Models, Recharge Plans & Capabilities for Unauthenticated Visitors)
  app.get('/api/public/frontpage', async (_req, res) => {
    try {
      await ensureSeeded();
      const rawConfig = await getPlatformConfig();
      const { enrichedConfig, capabilities } =
        await enrichConfigWithLiveAvailability(rawConfig);
      const packages = await getActivePackages();
      res.json({ config: enrichedConfig, packages, capabilities });
    } catch (error: unknown) {
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to load frontpage configuration.',
      });
    }
  });

  // Public Guest Text-Only Chat Stream (Non-chat commands require Login)
  app.post('/api/public/chat/stream', guestChatLimiter, async (req, res) => {
    try {
      await ensureSeeded();
      const {
        prompt,
        modelId,
        history,
        webSearch,
        attachments,
        reasoningEffort,
      } = req.body || {};
      const cleanPrompt = String(prompt || '').trim();

      if (!cleanPrompt) {
        res.status(400).json({ error: 'Please enter a message.' });
        return;
      }

      const isNonChatCommand =
        Boolean(webSearch) ||
        (Array.isArray(attachments) && attachments.length > 0) ||
        /^(?:\/(?:image|img|draw|pdf|doc|search|web|voice|speak|audio))\b/i.test(
          cleanPrompt
        ) ||
        /\b(?:create an image|generate an? image|draw an? image|make an? image|chobi banao|image banao|analyze (?:this )?pdf|search latest|search the web)\b/i.test(
          cleanPrompt
        );

      if (isNonChatCommand) {
        res.status(401).json({
          code: 'LOGIN_REQUIRED',
          error:
            'Basic Chat is free on the front page. Please sign in to use Image Generation, PDF Analysis, Web Search, or Voice commands.',
        });
        return;
      }

      const rawConfig = await getPlatformConfig();
      try {
        await enforcePlatformSpendCaps(rawConfig);
      } catch (capErr: unknown) {
        res.status(403).json({
          error:
            capErr instanceof Error
              ? capErr.message
              : 'Platform API spending limit reached.',
        });
        return;
      }

      const { enrichedConfig } = await enrichConfigWithLiveAvailability(rawConfig);

      const liveAvailableModels = enrichedConfig.models.filter(
        (m) => m.enabled && m.available !== false
      );
      const fastGuestDefault =
        liveAvailableModels.find((m) => m.id === 'gpt-4o-mini') ||
        liveAvailableModels.find((m) => m.id === 'gemini-3.1-flash-lite') ||
        liveAvailableModels[0] ||
        enrichedConfig.models.find((m) => m.enabled) ||
        enrichedConfig.models[0];

      const chosenModel =
        liveAvailableModels.find((m) => m.id === modelId) || fastGuestDefault;

      const safeHistory: Array<{ role: 'user' | 'assistant'; content: string }> =
        Array.isArray(history)
          ? history
              .slice(-8)
              .map((h: { role?: string; content?: string }) => ({
                role: (h.role === 'assistant' ? 'assistant' : 'user') as
                  | 'user'
                  | 'assistant',
                content: String(h.content || '').slice(0, 2000),
              }))
          : [];

      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      const sendSSE = (obj: Record<string, unknown>) => {
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify(obj)}\n\n`);
        }
      };

      const heartbeatTimer = setInterval(() => {
        if (!res.writableEnded) {
          res.write(`: heartbeat\n\n`);
        }
      }, 5000);
      res.on('close', () => clearInterval(heartbeatTimer));

      sendSSE({ type: 'meta', model: chosenModel.id });

      try {
        const result = await streamChatCompletion({
          modelConfig: chosenModel,
          history: safeHistory,
          prompt: cleanPrompt,
          webSearch: false,
          reasoningEffort: ['low', 'medium', 'high'].includes(reasoningEffort)
            ? reasoningEffort
            : 'low',
          userFullName: 'Guest Visitor',
          onDelta: (delta) => sendSSE({ type: 'delta', text: delta }),
        });

        sendSSE({
          type: 'done',
          tokensUsed: result.totalTokens,
          modelUsed: result.modelUsed,
        });
        clearInterval(heartbeatTimer);
        res.end();
      } catch (streamErr: unknown) {
        clearInterval(heartbeatTimer);
        const errMeta = extractProviderErrorMeta(streamErr);
        await recordProviderApiError({
          actorUserId: null,
          actorEmail: 'guest@qaaga.ai',
          provider:
            chosenModel.provider === 'gemini' || chosenModel.provider === 'bridge'
              ? 'gemini'
              : 'openai',
          model: chosenModel.id,
          feature: 'guest_chat',
          status: errMeta.status,
          errorCode: errMeta.errorCode,
          safeMessage: errMeta.safeMessage,
        });
        sendSSE({
          type: 'error',
          error:
            streamErr instanceof Error
              ? streamErr.message
              : 'Guest chat streaming failed.',
        });
        res.end();
      }
    } catch (err: unknown) {
      res.status(500).json({
        error:
          err instanceof Error ? err.message : 'Unable to start guest chat.',
      });
    }
  });

  // 1. Email/Password Registration (New accounts start PENDING unless bootstrap admin)
  app.post('/api/auth/register', authLimiter, async (req, res) => {
    try {
      await ensureSeeded();
      const { fullName, email, password } = req.body || {};
      const cleanEmail = String(email || '')
        .trim()
        .toLowerCase();
      const cleanName = String(fullName || '').trim();
      const rawPass = String(password || '');

      if (!cleanName || cleanName.length < 2) {
        res.status(400).json({ error: 'Please provide your full name.' });
        return;
      }
      if (!cleanEmail.includes('@') || cleanEmail.length < 5) {
        res.status(400).json({ error: 'Please enter a valid email address.' });
        return;
      }
      if (rawPass.length < 6) {
        res
          .status(400)
          .json({ error: 'Password must be at least 6 characters long.' });
        return;
      }

      const existing = await db
        .select()
        .from(users)
        .where(eq(users.email, cleanEmail));
      if (existing.length > 0) {
        res.status(409).json({
          error: 'An account with this email already exists. Please sign in.',
        });
        return;
      }

      const bootstrapAdmin = (
        process.env.ADMIN_BOOTSTRAP_EMAIL || 'rafsankhan.tv@gmail.com'
      )
        .trim()
        .toLowerCase();
      const isBootstrapAdmin = cleanEmail === bootstrapAdmin;

      const uid = `local_${crypto.randomUUID()}`;
      const passwordHash = await hashPassword(rawPass);
      const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const [created] = await db
        .insert(users)
        .values({
          uid,
          email: cleanEmail,
          fullName: cleanName,
          passwordHash,
          role: isBootstrapAdmin ? 'admin' : 'user',
          status: isBootstrapAdmin ? 'ACTIVE' : 'PENDING',
          subscriptionExpiresAt: isBootstrapAdmin ? in30Days : null,
          dailyCreditLimit: isBootstrapAdmin ? 5000 : 500,
        })
        .returning();

      if (isBootstrapAdmin) {
        await db.insert(creditLedger).values({
          userId: created.id,
          entryType: 'GRANT_RECHARGE',
          feature: 'recharge',
          deltaCredits: 500,
          balanceAfter: 500,
          description: 'Bootstrap Administrator Starter Credits',
        });
      } else {
        await db.insert(notifications).values({
          userId: created.id,
          title: 'Account Pending Administrator Approval',
          detail:
            'Welcome to QAAGA AGENT! Your registration is in queue for administrator review.',
        });
      }

      await db.insert(auditLogs).values({
        actorUserId: created.id,
        actorEmail: created.email,
        action: 'USER_REGISTERED',
        targetType: 'user',
        targetId: String(created.id),
        detailsJson: JSON.stringify({ status: created.status }),
        ipAddress: req.socket.remoteAddress || null,
      });

      const token = signLocalJwt(created.uid, created.email);
      res.status(201).json({
        token,
        user: mapUserRowToDTO(created),
      });
    } catch (error: unknown) {
      console.error('Register error:', error);
      res.status(500).json({
        error:
          error instanceof Error ? error.message : 'Account registration failed.',
      });
    }
  });

  // 2. Email/Password Login
  app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
      await ensureSeeded();
      const cleanEmail = String(req.body?.email || '')
        .trim()
        .toLowerCase();
      const rawPass = String(req.body?.password || '');

      if (!cleanEmail || !rawPass) {
        res
          .status(400)
          .json({ error: 'Please enter both email and password.' });
        return;
      }

      const [userRow] = await db
        .select()
        .from(users)
        .where(eq(users.email, cleanEmail));

      if (!userRow || !userRow.passwordHash) {
        res.status(401).json({
          error:
            'Invalid email or password (if registered via Google, use Google Sign-In).',
        });
        return;
      }

      const valid = await verifyPassword(rawPass, userRow.passwordHash);
      if (!valid) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }

      const token = signLocalJwt(userRow.uid, userRow.email);
      res.json({
        token,
        user: mapUserRowToDTO(userRow),
      });
    } catch (error: unknown) {
      console.error('Login error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Sign-in failed.',
      });
    }
  });

  // 3. Authenticated Workspace Hydrator
  app.get('/api/workspace', requireAuth, async (req: AuthRequest, res) => {
    try {
      const authUser = req.authUser!;
      const rawConfig = await getPlatformConfig();
      const { enrichedConfig: config, capabilities } =
        await enrichConfigWithLiveAvailability(rawConfig);
      const packages = await getActivePackages();
      const { summary: credits, recentLedger: ledger } =
        await computeUserCredits(authUser.id, authUser.dailyCreditLimit);

      const userPayments = await db
        .select()
        .from(paymentRequests)
        .where(eq(paymentRequests.userId, authUser.id))
        .orderBy(desc(paymentRequests.id));

      const rawSessions = await db
        .select()
        .from(chatSessions)
        .where(eq(chatSessions.userId, authUser.id))
        .orderBy(desc(chatSessions.updatedAt));

      const rawMessages = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.userId, authUser.id))
        .orderBy(asc(chatMessages.id));

      const msgBySession = new Map<number, ChatMessageDTO[]>();
      for (const m of rawMessages) {
        const list = msgBySession.get(m.sessionId) || [];
        list.push({
          id: m.id,
          sessionId: m.sessionId,
          role: (m.role as 'user' | 'assistant') || 'assistant',
          content: m.content,
          model: m.model,
          mode: m.mode,
          attachments: m.attachmentsJson ? JSON.parse(m.attachmentsJson) : [],
          citations: m.citationsJson ? JSON.parse(m.citationsJson) : [],
          imageDataUrl: m.imageDataUrl,
          creditsCharged: m.creditsCharged,
          tokensUsed: m.tokensUsed,
          createdAt: m.createdAt.toISOString(),
        });
        msgBySession.set(m.sessionId, list);
      }

      const sessionsDTO: ChatSessionDTO[] = rawSessions.map((s) => ({
        id: s.id,
        title: s.title,
        model: s.model,
        mode: s.mode,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
        messages: msgBySession.get(s.id) || [],
      }));

      const userNotifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, authUser.id))
        .orderBy(desc(notifications.id))
        .limit(25);

      res.json({
        user: authUser,
        credits,
        ledger,
        packages,
        payments: userPayments.map((p) => ({
          id: p.id,
          userId: p.userId,
          packageId: p.packageId,
          paymentMethod: p.paymentMethod as PaymentMethodType,
          receiverNumber: p.receiverNumber,
          senderNumber: p.senderNumber,
          transactionId: p.transactionId,
          amountBdt: p.amountBdt,
          creditsToGrant: p.creditsToGrant,
          hasScreenshot: Boolean(p.screenshotData),
          status: p.status,
          adminNote: p.adminNote,
          reviewedAt: p.reviewedAt ? p.reviewedAt.toISOString() : null,
          createdAt: p.createdAt.toISOString(),
        })),
        sessions: sessionsDTO,
        notifications: userNotifs.map((n) => ({
          id: n.id,
          title: n.title,
          detail: n.detail,
          isRead: n.isRead,
          createdAt: n.createdAt.toISOString(),
        })),
        config,
        capabilities,
      });
    } catch (error: unknown) {
      console.error('Workspace fetch error:', error);
      res.status(500).json({
        error:
          error instanceof Error ? error.message : 'Failed to load workspace.',
      });
    }
  });

  // 4. Update User Profile & Theme
  app.patch('/api/profile', requireAuth, async (req: AuthRequest, res) => {
    try {
      const authUser = req.authUser!;
      const { fullName, preferredModel, preferredVoice, theme } = req.body || {};

      const patch: Partial<typeof users.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (typeof fullName === 'string' && fullName.trim().length >= 2) {
        patch.fullName = fullName.trim();
      }
      if (typeof preferredModel === 'string' && preferredModel.trim()) {
        patch.preferredModel = preferredModel.trim();
      }
      if (typeof preferredVoice === 'string' && preferredVoice.trim()) {
        patch.preferredVoice = preferredVoice.trim();
      }
      if (theme === 'light' || theme === 'dark') {
        patch.theme = theme;
      }

      const [updated] = await db
        .update(users)
        .set(patch)
        .where(eq(users.id, authUser.id))
        .returning();

      res.json({ user: mapUserRowToDTO(updated) });
    } catch (error: unknown) {
      res.status(500).json({
        error:
          error instanceof Error ? error.message : 'Failed to save profile.',
      });
    }
  });

  // 5. Mark Notifications Read
  app.post(
    '/api/notifications/read',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        await db
          .update(notifications)
          .set({ isRead: true })
          .where(eq(notifications.userId, req.authUser!.id));
        res.json({ ok: true });
      } catch (error: unknown) {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Update failed.',
        });
      }
    }
  );

  // 6. Delete Chat Session
  app.delete('/api/chats/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const sessionId = Number(req.params.id);
      const authUser = req.authUser!;
      const [sess] = await db
        .select()
        .from(chatSessions)
        .where(
          and(
            eq(chatSessions.id, sessionId),
            eq(chatSessions.userId, authUser.id)
          )
        );
      if (!sess) {
        res.status(404).json({ error: 'Conversation not found.' });
        return;
      }
      await db
        .delete(chatMessages)
        .where(eq(chatMessages.sessionId, sessionId));
      await db.delete(chatSessions).where(eq(chatSessions.id, sessionId));
      res.json({ ok: true });
    } catch (error: unknown) {
      res.status(500).json({
        error:
          error instanceof Error ? error.message : 'Failed to delete session.',
      });
    }
  });

  // 7. Submit Manual MFS Recharge Request (bKash / Nagad / Rocket + Private Screenshot)
  app.post(
    '/api/payments/submit',
    requireAuth,
    paymentLimiter,
    async (req: AuthRequest, res) => {
      try {
        const authUser = req.authUser!;
        const {
          packageId,
          paymentMethod,
          senderNumber,
          transactionId,
          amountBdt,
          screenshotData,
          screenshotMime,
        } = req.body || {};

        if (!['bKash', 'Nagad', 'Rocket'].includes(paymentMethod)) {
          res.status(400).json({ error: 'Select bKash, Nagad, or Rocket.' });
          return;
        }
        const cleanSender = String(senderNumber || '').trim();
        const cleanTrx = String(transactionId || '')
          .trim()
          .toUpperCase();

        if (cleanSender.length < 9) {
          res
            .status(400)
            .json({ error: 'Enter a valid sender mobile wallet number.' });
          return;
        }
        if (cleanTrx.length < 5) {
          res
            .status(400)
            .json({ error: 'Enter a valid MFS Transaction ID (TrxID).' });
          return;
        }
        if (
          !screenshotData ||
          typeof screenshotData !== 'string' ||
          !screenshotData.startsWith('data:image/')
        ) {
          res.status(400).json({
            error: 'Please attach a valid payment receipt screenshot image.',
          });
          return;
        }

        // Prevent duplicate transaction ID submissions
        const dup = await db
          .select()
          .from(paymentRequests)
          .where(eq(paymentRequests.transactionId, cleanTrx));
        if (dup.length > 0) {
          res.status(409).json({
            error: `Transaction ID ${cleanTrx} has already been submitted.`,
          });
          return;
        }

        const config = await getPlatformConfig();
        const packages = await getActivePackages();
        const matchedPack =
          packages.find((p) => p.id === Number(packageId)) ||
          packages.find((p) => p.amountBdt === Number(amountBdt));

        if (!matchedPack || !matchedPack.active) {
          res.status(400).json({
            error: 'Selected recharge package is unavailable.',
          });
          return;
        }

        const receiverNumber =
          config.receiverNumbers[paymentMethod as PaymentMethodType];

        const [created] = await db
          .insert(paymentRequests)
          .values({
            userId: authUser.id,
            packageId: matchedPack.id,
            paymentMethod,
            receiverNumber,
            senderNumber: cleanSender,
            transactionId: cleanTrx,
            amountBdt: matchedPack.amountBdt,
            creditsToGrant: matchedPack.credits,
            screenshotData,
            screenshotMime: screenshotMime || 'image/png',
            status: 'PENDING',
          })
          .returning();

        await db.insert(auditLogs).values({
          actorUserId: authUser.id,
          actorEmail: authUser.email,
          action: 'PAYMENT_SUBMITTED',
          targetType: 'payment_request',
          targetId: String(created.id),
          detailsJson: JSON.stringify({
            method: paymentMethod,
            amountBdt: matchedPack.amountBdt,
            trxId: cleanTrx,
          }),
          ipAddress: req.socket.remoteAddress || null,
        });

        res.status(201).json({
          payment: {
            id: created.id,
            paymentMethod: created.paymentMethod,
            amountBdt: created.amountBdt,
            creditsToGrant: created.creditsToGrant,
            transactionId: created.transactionId,
            status: created.status,
            createdAt: created.createdAt.toISOString(),
          },
        });
      } catch (error: unknown) {
        console.error('Payment submit error:', error);
        res.status(500).json({
          error:
            error instanceof Error
              ? error.message
              : 'Failed to submit recharge request.',
        });
      }
    }
  );

  // 8. Private Authenticated Screenshot Access (Owner or Admin only)
  app.get(
    '/api/payments/:id/screenshot',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const authUser = req.authUser!;
        const paymentId = Number(req.params.id);
        const [payment] = await db
          .select()
          .from(paymentRequests)
          .where(eq(paymentRequests.id, paymentId));

        if (!payment) {
          res.status(404).json({ error: 'Payment record not found.' });
          return;
        }
        if (authUser.role !== 'admin' && payment.userId !== authUser.id) {
          res.status(403).json({ error: 'Forbidden.' });
          return;
        }

        res.json({
          screenshotDataUrl: payment.screenshotData,
          transactionId: payment.transactionId,
          senderNumber: payment.senderNumber,
          amountBdt: payment.amountBdt,
        });
      } catch (error: unknown) {
        res.status(500).json({
          error:
            error instanceof Error
              ? error.message
              : 'Could not retrieve screenshot.',
        });
      }
    }
  );

  // 9. Streaming AI Chat + Multimodal Vision/PDF + Grounded Search (Atomic Ledger Reservation)
  app.post(
    '/api/chat/stream',
    requireAuth,
    aiLimiter,
    async (req: AuthRequest, res) => {
      const authUser = req.authUser!;
      const {
        sessionId,
        prompt,
        modelId,
        webSearch,
        reasoningEffort,
        attachments,
        regenerateLast,
      }: {
        sessionId?: number | null;
        prompt?: string;
        modelId?: string;
        webSearch?: boolean;
        reasoningEffort?: 'low' | 'medium' | 'high';
        regenerateLast?: boolean;
        attachments?: Array<{
          name: string;
          mimeType: string;
          sizeBytes: number;
          base64Data: string;
          previewDataUrl?: string;
        }>;
      } = req.body || {};

      try {
        const rawConfig = await getPlatformConfig();
        try {
          await enforcePlatformSpendCaps(rawConfig);
        } catch (capErr: unknown) {
          res.status(403).json({
            error:
              capErr instanceof Error
                ? capErr.message
                : 'Platform API spending limit reached.',
          });
          return;
        }

        const { enrichedConfig: config } =
          await enrichConfigWithLiveAvailability(rawConfig);

        // Honor explicit modelId if enabled (allows direct provider calls & testing), otherwise default to first available enabled model
        const chosenModel =
          config.models.find((m) => m.id === modelId && m.enabled) ||
          config.models.find((m) => m.enabled && m.available !== false) ||
          config.models.find((m) => m.enabled) ||
          config.models[0];

        if (!chosenModel || !chosenModel.enabled) {
          res.status(400).json({
            error: 'Selected model is currently disabled by administrator.',
          });
          return;
        }

        const hasPdf = Boolean(
          attachments?.some((a) => !a.mimeType.startsWith('image/'))
        );
        const hasImage = Boolean(
          attachments?.some((a) => a.mimeType.startsWith('image/'))
        );

        if (hasPdf && !config.toolsEnabled.pdfAnalysis) {
          res.status(403).json({
            error: 'Document/PDF analysis is currently disabled by administrator.',
          });
          return;
        }
        if (hasImage && !config.toolsEnabled.imageAnalysis) {
          res.status(403).json({
            error: 'Image analysis is currently disabled by administrator.',
          });
          return;
        }
        if (webSearch && !config.toolsEnabled.webSearch) {
          res.status(403).json({
            error: 'Web Search is currently disabled by administrator.',
          });
          return;
        }

        const featureCategory: 'chat' | 'image' | 'pdf' | 'search' = hasPdf
          ? 'pdf'
          : hasImage
          ? 'image'
          : webSearch
          ? 'search'
          : 'chat';

        const baseReserve =
          featureCategory === 'pdf'
            ? config.creditRates.pdfAnalysis
            : featureCategory === 'image'
            ? config.creditRates.imageAnalysis
            : featureCategory === 'search'
            ? config.creditRates.webSearch
            : chosenModel.baseCreditCost || config.creditRates.chatBase;

        const per1kTokenRate =
          chosenModel.creditsPer1kTokens ?? config.creditRates.chatPer1kTokens;

        // Reserve base + buffer (refunded upon settlement if unused, or 100% refunded on failure)
        const reserveAmount = baseReserve + 2;
        const reservation = await reserveCreditsForUsage({
          userId: authUser.id,
          feature: featureCategory,
          reserveAmount,
          description: `${chosenModel.label} (${featureCategory})`,
        });

        let targetSessionId = sessionId ? Number(sessionId) : null;
        let effectivePrompt = String(prompt || '').trim();

        if (!targetSessionId) {
          const [createdSess] = await db
            .insert(chatSessions)
            .values({
              userId: authUser.id,
              title: (
                effectivePrompt ||
                attachments?.[0]?.name ||
                'New Conversation'
              ).slice(0, 60),
              model: chosenModel.id,
              mode: featureCategory,
            })
            .returning();
          targetSessionId = createdSess.id;
        }

        // Handle Regenerate Last Assistant Response
        if (regenerateLast && targetSessionId) {
          const existingMsgs = await db
            .select()
            .from(chatMessages)
            .where(eq(chatMessages.sessionId, targetSessionId))
            .orderBy(asc(chatMessages.id));

          const lastMsg = existingMsgs[existingMsgs.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            await db
              .delete(chatMessages)
              .where(eq(chatMessages.id, lastMsg.id));
            const prevUser = existingMsgs[existingMsgs.length - 2];
            if (prevUser && !effectivePrompt) {
              effectivePrompt = prevUser.content;
            }
          }
        } else {
          // Insert user message
          await db.insert(chatMessages).values({
            sessionId: targetSessionId,
            userId: authUser.id,
            role: 'user',
            content:
              effectivePrompt ||
              `Analyze attached file: ${attachments?.[0]?.name || 'file'}`,
            model: chosenModel.id,
            mode: featureCategory,
            attachmentsJson: attachments
              ? JSON.stringify(
                  attachments.map((a) => ({
                    name: a.name,
                    mimeType: a.mimeType,
                    sizeBytes: a.sizeBytes,
                    previewDataUrl: a.previewDataUrl,
                  }))
                )
              : null,
          });
        }

        const priorMsgs = await db
          .select()
          .from(chatMessages)
          .where(eq(chatMessages.sessionId, targetSessionId))
          .orderBy(asc(chatMessages.id));

        const historyForModel = priorMsgs.slice(0, -1).map((m) => ({
          role: (m.role as 'user' | 'assistant') || 'user',
          content: m.content,
        }));

        // Start SSE Stream
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders?.();

        const sendSSE = (obj: Record<string, unknown>) => {
          if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify(obj)}\n\n`);
          }
        };

        const authHeartbeatTimer = setInterval(() => {
          if (!res.writableEnded) {
            res.write(`: heartbeat\n\n`);
          }
        }, 5000);
        res.on('close', () => clearInterval(authHeartbeatTimer));

        sendSSE({
          type: 'meta',
          sessionId: targetSessionId,
          model: chosenModel.id,
        });

        try {
          const result = await streamChatCompletion({
            modelConfig: chosenModel,
            history: historyForModel,
            prompt: effectivePrompt,
            webSearch: Boolean(webSearch),
            reasoningEffort:
              reasoningEffort &&
              ['low', 'medium', 'high'].includes(reasoningEffort)
                ? reasoningEffort
                : 'medium',
            attachments: attachments?.map((a) => ({
              name: a.name,
              mimeType: a.mimeType,
              base64Data: a.base64Data,
            })),
            userFullName: authUser.fullName,
            onDelta: (delta) => sendSSE({ type: 'delta', text: delta }),
          });

          const actualCredits = calculateInternalCreditCharge(
            baseReserve,
            per1kTokenRate,
            result.totalTokens
          );

          await finalizeCreditReservation({
            userId: authUser.id,
            reservationId: reservation.reservationId,
            reservedAmount: reserveAmount,
            actualAmount: actualCredits,
            feature: featureCategory,
            description: `${result.modelUsed} · ${result.totalTokens} tokens`,
          });

          // Log Provider Token & USD Spend independently from User Internal Credits
          await db.insert(providerUsageLogs).values({
            userId: authUser.id,
            provider: result.providerUsed,
            model: result.modelUsed,
            feature: featureCategory,
            promptTokens: result.promptTokens,
            completionTokens: result.completionTokens,
            totalTokens: result.totalTokens,
            providerCostUsd: result.providerCostUsd.toFixed(6),
            internalCreditsCharged: actualCredits,
          });

          const [savedAssistant] = await db
            .insert(chatMessages)
            .values({
              sessionId: targetSessionId,
              userId: authUser.id,
              role: 'assistant',
              content: result.fullText || 'Completed.',
              model: chosenModel.id,
              mode: featureCategory,
              citationsJson:
                result.citations.length > 0
                  ? JSON.stringify(result.citations)
                  : null,
              creditsCharged: actualCredits,
              tokensUsed: result.totalTokens,
              providerCostUsd: result.providerCostUsd.toFixed(6),
            })
            .returning();

          await db
            .update(chatSessions)
            .set({ updatedAt: new Date() })
            .where(eq(chatSessions.id, targetSessionId));

          sendSSE({
            type: 'done',
            sessionId: targetSessionId,
            messageId: savedAssistant.id,
            creditsCharged: actualCredits,
            tokensUsed: result.totalTokens,
            providerUsed: result.providerUsed,
            modelUsed: result.modelUsed,
            citations: result.citations,
          });
          clearInterval(authHeartbeatTimer);
          res.end();
        } catch (streamErr: unknown) {
          clearInterval(authHeartbeatTimer);
          // Full Atomic Refund on AI Provider Failure!
          await finalizeCreditReservation({
            userId: authUser.id,
            reservationId: reservation.reservationId,
            reservedAmount: reserveAmount,
            actualAmount: 0,
            feature: featureCategory,
            description: 'Provider failure refund',
          });
          const errMeta = extractProviderErrorMeta(streamErr);
          await recordProviderApiError({
            actorUserId: authUser.id,
            actorEmail: authUser.email,
            provider:
              chosenModel.provider === 'gemini' ||
              chosenModel.provider === 'bridge'
                ? 'gemini'
                : 'openai',
            model: chosenModel.id,
            feature: featureCategory,
            status: errMeta.status,
            errorCode: errMeta.errorCode,
            safeMessage: errMeta.safeMessage,
          });
          sendSSE({
            type: 'error',
            error:
              streamErr instanceof Error
                ? streamErr.message
                : 'AI generation failed. Reserved credits have been refunded.',
          });
          res.end();
        }
      } catch (outerErr: unknown) {
        sendCommandError(res, outerErr, 'Unable to start chat request.');
      }
    }
  );

  // 10. Image Generation Endpoint (Atomic Reservation & Refund)
  app.post(
    '/api/image/generate',
    requireAuth,
    aiLimiter,
    async (req: AuthRequest, res) => {
      const authUser = req.authUser!;
      try {
        const config = await getPlatformConfig();
        if (!config.toolsEnabled.imageGeneration) {
          res.status(403).json({
            error: 'Image Generation is currently disabled by administrator.',
          });
          return;
        }

        await enforcePlatformSpendCaps(config);

        const prompt = String(req.body?.prompt || '').trim();
        const aspectRatio: '1:1' | '16:9' | '3:4' = ['1:1', '16:9', '3:4'].includes(
          req.body?.aspectRatio
        )
          ? req.body.aspectRatio
          : '1:1';

        if (!prompt) {
          res.status(400).json({ error: 'Please enter an image prompt.' });
          return;
        }

        const costCredits = config.creditRates.imageGeneration;
        const reservation = await reserveCreditsForUsage({
          userId: authUser.id,
          feature: 'image',
          reserveAmount: costCredits,
          description: `Image Generation (${aspectRatio})`,
        });

        try {
          const generated = await generateImageAsset(prompt, aspectRatio);

          await finalizeCreditReservation({
            userId: authUser.id,
            reservationId: reservation.reservationId,
            reservedAmount: costCredits,
            actualAmount: costCredits,
            feature: 'image',
            description: `Image Generation: ${prompt.slice(0, 40)}`,
          });

          await db.insert(providerUsageLogs).values({
            userId: authUser.id,
            provider: generated.providerUsed,
            model: generated.modelUsed,
            feature: 'image',
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            providerCostUsd: generated.providerCostUsd.toFixed(6),
            internalCreditsCharged: costCredits,
          });

          // Persist inside a dedicated Image Studio chat session so user always has history
          const [imgSession] = await db
            .insert(chatSessions)
            .values({
              userId: authUser.id,
              title: `Image: ${prompt.slice(0, 44)}`,
              model: generated.modelUsed,
              mode: 'image',
            })
            .returning();

          await db.insert(chatMessages).values({
            sessionId: imgSession.id,
            userId: authUser.id,
            role: 'assistant',
            content: generated.revisedPrompt,
            model: imgSession.model,
            mode: 'image',
            imageDataUrl: generated.imageDataUrl,
            creditsCharged: costCredits,
            providerCostUsd: generated.providerCostUsd.toFixed(6),
          });

          res.json({
            imageDataUrl: generated.imageDataUrl,
            revisedPrompt: generated.revisedPrompt,
            creditsCharged: costCredits,
            providerUsed: generated.providerUsed,
          });
        } catch (genErr: unknown) {
          await finalizeCreditReservation({
            userId: authUser.id,
            reservationId: reservation.reservationId,
            reservedAmount: costCredits,
            actualAmount: 0,
            feature: 'image',
            description: 'Failed image generation refund',
          });
          const errMeta = extractProviderErrorMeta(genErr);
          await recordProviderApiError({
            actorUserId: authUser.id,
            actorEmail: authUser.email,
            provider: 'openai',
            model: 'dall-e-3',
            feature: 'image',
            status: errMeta.status,
            errorCode: errMeta.errorCode,
            safeMessage: errMeta.safeMessage,
          });
          throw genErr;
        }
      } catch (error: unknown) {
        sendCommandError(res, error, 'Image generation failed.');
      }
    }
  );

  // 11. Speech-to-Text Endpoint
  app.post(
    '/api/voice/transcribe',
    requireAuth,
    aiLimiter,
    async (req: AuthRequest, res) => {
      const authUser = req.authUser!;
      try {
        const config = await getPlatformConfig();
        if (!config.toolsEnabled.voiceChat) {
          res.status(403).json({
            error: 'Voice features are currently disabled by administrator.',
          });
          return;
        }
        await enforcePlatformSpendCaps(config);

        const { base64Audio, mimeType, provider } = req.body || {};
        if (!base64Audio) {
          res.status(400).json({ error: 'Audio payload missing.' });
          return;
        }

        const preferredProvider: 'openai' | 'gemini' | undefined =
          provider === 'openai' || provider === 'gemini' ? provider : undefined;

        const sttCredits = config.creditRates.voiceStt;
        const reservation = await reserveCreditsForUsage({
          userId: authUser.id,
          feature: 'voice',
          reserveAmount: sttCredits,
          description: 'Speech-to-Text Dictation',
        });

        try {
          const out = await transcribeAudioBuffer(
            base64Audio,
            mimeType || 'audio/webm',
            preferredProvider
          );
          await finalizeCreditReservation({
            userId: authUser.id,
            reservationId: reservation.reservationId,
            reservedAmount: sttCredits,
            actualAmount: sttCredits,
            feature: 'voice',
            description: 'Speech-to-Text Dictation',
          });

          await db.insert(providerUsageLogs).values({
            userId: authUser.id,
            provider: out.providerUsed,
            model: out.modelUsed,
            feature: 'voice',
            internalCreditsCharged: sttCredits,
            providerCostUsd: out.providerCostUsd.toFixed(6),
          });

          res.json({
            transcript: out.transcript,
            creditsCharged: sttCredits,
            providerUsed: out.providerUsed,
          });
        } catch (err) {
          await finalizeCreditReservation({
            userId: authUser.id,
            reservationId: reservation.reservationId,
            reservedAmount: sttCredits,
            actualAmount: 0,
            feature: 'voice',
            description: 'Failed STT refund',
          });
          const errMeta = extractProviderErrorMeta(err);
          await recordProviderApiError({
            actorUserId: authUser.id,
            actorEmail: authUser.email,
            provider: preferredProvider || 'gemini',
            model:
              preferredProvider === 'openai'
                ? 'gpt-4o-mini-transcribe'
                : 'gemini-3.5-transcribe',
            feature: 'voice_stt',
            status: errMeta.status,
            errorCode: errMeta.errorCode,
            safeMessage: errMeta.safeMessage,
          });
          throw err;
        }
      } catch (error: unknown) {
        sendCommandError(res, error, 'Transcription failed.');
      }
    }
  );

  // 12. Text-to-Speech Endpoint
  app.post(
    '/api/voice/speak',
    requireAuth,
    aiLimiter,
    async (req: AuthRequest, res) => {
      const authUser = req.authUser!;
      try {
        const config = await getPlatformConfig();
        if (!config.toolsEnabled.voiceChat) {
          res.status(403).json({
            error: 'Voice features are currently disabled by administrator.',
          });
          return;
        }
        await enforcePlatformSpendCaps(config);

        const { text, voice, provider } = req.body || {};
        if (!text?.trim()) {
          res.status(400).json({ error: 'Text required for TTS.' });
          return;
        }

        const preferredProvider: 'openai' | 'gemini' | undefined =
          provider === 'openai' || provider === 'gemini' ? provider : undefined;

        const ttsCredits = config.creditRates.voiceTts;
        const reservation = await reserveCreditsForUsage({
          userId: authUser.id,
          feature: 'voice',
          reserveAmount: ttsCredits,
          description: 'Neural Text-to-Speech',
        });

        try {
          const out = await synthesizeSpeechAudio(
            String(text),
            voice || authUser.preferredVoice || 'alloy',
            preferredProvider
          );
          await finalizeCreditReservation({
            userId: authUser.id,
            reservationId: reservation.reservationId,
            reservedAmount: ttsCredits,
            actualAmount: ttsCredits,
            feature: 'voice',
            description: 'Neural Text-to-Speech',
          });

          await db.insert(providerUsageLogs).values({
            userId: authUser.id,
            provider: out.providerUsed,
            model: out.modelUsed,
            feature: 'voice',
            internalCreditsCharged: ttsCredits,
            providerCostUsd: out.providerCostUsd.toFixed(6),
          });

          res.json({
            audioDataUrl: out.audioDataUrl,
            creditsCharged: ttsCredits,
            providerUsed: out.providerUsed,
          });
        } catch (err) {
          await finalizeCreditReservation({
            userId: authUser.id,
            reservationId: reservation.reservationId,
            reservedAmount: ttsCredits,
            actualAmount: 0,
            feature: 'voice',
            description: 'Failed TTS refund',
          });
          const errMeta = extractProviderErrorMeta(err);
          await recordProviderApiError({
            actorUserId: authUser.id,
            actorEmail: authUser.email,
            provider: preferredProvider || 'gemini',
            model:
              preferredProvider === 'openai'
                ? 'tts-1'
                : 'gemini-3.8-flash-lite-tts',
            feature: 'voice_tts',
            status: errMeta.status,
            errorCode: errMeta.errorCode,
            safeMessage: errMeta.safeMessage,
          });
          throw err;
        }
      } catch (error: unknown) {
        sendCommandError(res, error, 'TTS failed.');
      }
    }
  );

  // =========================================================================
  // PROTECTED ADMINISTRATOR ROUTES
  // =========================================================================

  app.get(
    '/api/admin/dashboard',
    requireAuth,
    requireAdmin,
    async (_req: AuthRequest, res) => {
      try {
        const dashboard = await buildAdminDashboardData();
        res.json(dashboard);
      } catch (error: unknown) {
        res.status(500).json({
          error:
            error instanceof Error
              ? error.message
              : 'Failed to load admin dashboard.',
        });
      }
    }
  );

  // Approve / Suspend User, Update Daily Limit, or Grant Manual Credits
  app.post(
    '/api/admin/users/:id/manage',
    requireAuth,
    requireAdmin,
    async (req: AuthRequest, res) => {
      try {
        const targetId = Number(req.params.id);
        const admin = req.authUser!;
        const {
          status,
          role,
          dailyCreditLimit,
          bonusCredits,
          activate30Days,
        } = req.body || {};

        const [target] = await db
          .select()
          .from(users)
          .where(eq(users.id, targetId));
        if (!target) {
          res.status(404).json({ error: 'User not found.' });
          return;
        }

        const patch: Partial<typeof users.$inferInsert> = {
          updatedAt: new Date(),
        };
        if (['PENDING', 'ACTIVE', 'SUSPENDED'].includes(status)) {
          patch.status = status;
        }
        if (['user', 'admin'].includes(role)) {
          patch.role = role;
        }
        if (typeof dailyCreditLimit === 'number' && dailyCreditLimit >= 0) {
          patch.dailyCreditLimit = dailyCreditLimit;
        }
        if (activate30Days || (status === 'ACTIVE' && !target.subscriptionExpiresAt)) {
          patch.subscriptionExpiresAt = new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000
          );
        }

        await db.update(users).set(patch).where(eq(users.id, targetId));

        if (typeof bonusCredits === 'number' && bonusCredits !== 0) {
          const entries = await db
            .select()
            .from(creditLedger)
            .where(eq(creditLedger.userId, targetId));
          let bal = 0;
          for (const e of entries) bal += e.deltaCredits;
          const nextBal = Math.max(0, bal + bonusCredits);
          await db.insert(creditLedger).values({
            userId: targetId,
            entryType: 'ADMIN_ADJUST',
            feature: 'admin',
            deltaCredits: bonusCredits,
            balanceAfter: nextBal,
            description: `Administrator credit adjustment by ${admin.email}`,
          });
        }

        if (status && status !== target.status) {
          await db.insert(notifications).values({
            userId: targetId,
            title:
              status === 'ACTIVE'
                ? 'Account Approved by Administrator'
                : `Account Status Changed to ${status}`,
            detail:
              status === 'ACTIVE'
                ? 'Your QAAGA AGENT account is now active! Submit a recharge or use allocated credits to begin.'
                : 'Contact platform administrator if you need assistance.',
          });
        }

        await db.insert(auditLogs).values({
          actorUserId: admin.id,
          actorEmail: admin.email,
          action: 'ADMIN_USER_UPDATE',
          targetType: 'user',
          targetId: String(targetId),
          detailsJson: JSON.stringify({
            status,
            role,
            dailyCreditLimit,
            bonusCredits,
            activate30Days,
          }),
        });

        res.json({ ok: true });
      } catch (error: unknown) {
        res.status(500).json({
          error:
            error instanceof Error ? error.message : 'User update failed.',
        });
      }
    }
  );

  // Approve or Reject Manual Payment Request
  app.post(
    '/api/admin/payments/:id/review',
    requireAuth,
    requireAdmin,
    async (req: AuthRequest, res) => {
      try {
        const paymentId = Number(req.params.id);
        const decision = req.body?.decision;
        const adminNote = req.body?.adminNote;

        if (decision !== 'APPROVED' && decision !== 'REJECTED') {
          res
            .status(400)
            .json({ error: 'Decision must be APPROVED or REJECTED.' });
          return;
        }

        await reviewPaymentRequestAtomic({
          paymentId,
          decision,
          adminNote,
          adminUser: { id: req.authUser!.id, email: req.authUser!.email },
        });

        res.json({ ok: true });
      } catch (error: unknown) {
        res.status(400).json({
          error:
            error instanceof Error ? error.message : 'Payment review failed.',
        });
      }
    }
  );

  // Create New Recharge Package (Add Plan)
  app.post(
    '/api/admin/packages',
    requireAuth,
    requireAdmin,
    async (req: AuthRequest, res) => {
      try {
        const { name, amountBdt, credits, validityDays } = req.body || {};
        const cleanName = String(name || '').trim();
        const bdt = Number(amountBdt);
        const cr = Number(credits);
        const days = Number(validityDays) || 30;

        if (!cleanName || bdt <= 0 || cr <= 0) {
          res.status(400).json({
            error: 'Provide a valid plan name, BDT price, and credit amount.',
          });
          return;
        }

        const existing = await db
          .select()
          .from(rechargePackages)
          .where(eq(rechargePackages.amountBdt, bdt));
        if (existing.length > 0) {
          res.status(409).json({
            error: `A plan with price ${bdt} BDT already exists. Edit the existing plan instead.`,
          });
          return;
        }

        const [created] = await db
          .insert(rechargePackages)
          .values({
            name: cleanName,
            amountBdt: bdt,
            credits: cr,
            validityDays: days,
            active: true,
          })
          .returning();

        await db.insert(auditLogs).values({
          actorUserId: req.authUser!.id,
          actorEmail: req.authUser!.email,
          action: 'CREATE_RECHARGE_PACKAGE',
          targetType: 'recharge_package',
          targetId: String(created.id),
          detailsJson: JSON.stringify({
            name: cleanName,
            amountBdt: bdt,
            credits: cr,
            validityDays: days,
          }),
        });

        res.status(201).json({ packages: await getActivePackages() });
      } catch (error: unknown) {
        res.status(500).json({
          error:
            error instanceof Error ? error.message : 'Failed to create plan.',
        });
      }
    }
  );

  // Customize Recharge Package Credits (20, 50, 100, 200 BDT)
  app.put(
    '/api/admin/packages/:id',
    requireAuth,
    requireAdmin,
    async (req: AuthRequest, res) => {
      try {
        const pkgId = Number(req.params.id);
        const { name, amountBdt, credits, validityDays, active } =
          req.body || {};

        const patch: Partial<typeof rechargePackages.$inferInsert> = {
          updatedAt: new Date(),
        };
        if (typeof name === 'string' && name.trim()) patch.name = name.trim();
        if (typeof amountBdt === 'number' && amountBdt > 0)
          patch.amountBdt = amountBdt;
        if (typeof credits === 'number' && credits > 0) patch.credits = credits;
        if (typeof validityDays === 'number' && validityDays > 0)
          patch.validityDays = validityDays;
        if (typeof active === 'boolean') patch.active = active;

        await db
          .update(rechargePackages)
          .set(patch)
          .where(eq(rechargePackages.id, pkgId));

        await db.insert(auditLogs).values({
          actorUserId: req.authUser!.id,
          actorEmail: req.authUser!.email,
          action: 'UPDATE_RECHARGE_PACKAGE',
          targetType: 'recharge_package',
          targetId: String(pkgId),
          detailsJson: JSON.stringify({
            name,
            amountBdt,
            credits,
            validityDays,
            active,
          }),
        });

        res.json({ packages: await getActivePackages() });
      } catch (error: unknown) {
        res.status(500).json({
          error:
            error instanceof Error ? error.message : 'Package update failed.',
        });
      }
    }
  );

  // Broadcast Announcement to All Platform Users
  app.post(
    '/api/admin/announcements',
    requireAuth,
    requireAdmin,
    async (req: AuthRequest, res) => {
      try {
        const title = String(req.body?.title || '').trim();
        const detail = String(req.body?.detail || '').trim();
        if (!title || !detail) {
          res
            .status(400)
            .json({ error: 'Announcement title and message are required.' });
          return;
        }

        const allUsers = await db.select().from(users);
        if (allUsers.length > 0) {
          await db.insert(notifications).values(
            allUsers.map((u) => ({
              userId: u.id,
              title,
              detail,
              isRead: false,
            }))
          );
        }

        await db.insert(auditLogs).values({
          actorUserId: req.authUser!.id,
          actorEmail: req.authUser!.email,
          action: 'BROADCAST_ANNOUNCEMENT',
          targetType: 'notifications',
          targetId: 'all_users',
          detailsJson: JSON.stringify({
            title,
            detail,
            recipients: allUsers.length,
          }),
        });

        res.status(201).json({ ok: true, recipients: allUsers.length });
      } catch (error: unknown) {
        res.status(500).json({
          error:
            error instanceof Error
              ? error.message
              : 'Failed to broadcast announcement.',
        });
      }
    }
  );

  // Save Platform Settings (Receiver numbers, credit rates, OpenAI/Gemini USD caps, models, tools)
  app.put(
    '/api/admin/config',
    requireAuth,
    requireAdmin,
    async (req: AuthRequest, res) => {
      try {
        const incoming = req.body as PlatformConfigDTO;
        const saved = await savePlatformConfig(incoming, {
          id: req.authUser!.id,
          email: req.authUser!.email,
        });
        const { enrichedConfig } = await enrichConfigWithLiveAvailability(
          saved,
          true
        );
        res.json({ config: enrichedConfig });
      } catch (error: unknown) {
        res.status(500).json({
          error:
            error instanceof Error
              ? error.message
              : 'Configuration update failed.',
        });
      }
    }
  );

  // Live OpenAI API Connection Diagnostic (Protected Admin Route — Never Exposes OPENAI_API_KEY)
  app.post(
    '/api/admin/openai/test',
    requireAuth,
    requireAdmin,
    async (_req: AuthRequest, res) => {
      try {
        const diagnostic = await testOpenAIConnection();
        res.json(diagnostic);
      } catch (error: unknown) {
        res.status(500).json({
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : 'OpenAI connection diagnostic failed.',
        });
      }
    }
  );

  // Live Multi-Provider (OpenAI + Google Gemini) Connectivity & Model Discovery Diagnostic
  app.post(
    '/api/admin/providers/test',
    requireAuth,
    requireAdmin,
    async (_req: AuthRequest, res) => {
      try {
        const diagnostics = await testAllProvidersConnection();
        res.json(diagnostics);
      } catch (error: unknown) {
        res.status(500).json({
          error:
            error instanceof Error
              ? error.message
              : 'Provider diagnostics failed.',
        });
      }
    }
  );

  // Bind HTTP listener immediately so container readiness probes pass without waiting for Vite cold dependency pre-bundling
  if (process.env.NODE_ENV !== 'production') {
    let viteInstance: Awaited<
      ReturnType<typeof import('vite')['createServer']>
    > | null = null;
    const viteReady = import('vite')
      .then(({ createServer: createViteServer }) =>
        createViteServer({
          server: { middlewareMode: true },
          appType: 'spa',
        })
      )
      .then((v) => {
        viteInstance = v;
        return v;
      });

    app.use(async (req, res, next) => {
      try {
        const vite = viteInstance || (await viteReady);
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  const resolveWsUser = async (token: string): Promise<AuthUser | null> => {
    if (!token) return null;
    try {
      await ensureSeeded();
      const localPayload = verifyLocalJwt(token);
      if (localPayload) {
        const [row] = await db
          .select()
          .from(users)
          .where(eq(users.uid, localPayload.sub));
        return row ? mapUserRowToDTO(row) : null;
      }
      const decoded = await adminAuth.verifyIdToken(token);
      const synced = await getOrCreateGoogleUser(
        decoded.uid,
        decoded.email || `${decoded.uid}@google.user`,
        decoded.name
      );
      return mapUserRowToDTO(synced);
    } catch {
      return null;
    }
  };

  httpServer.on('upgrade', (request, socket, head) => {
    try {
      const parsedUrl = new URL(request.url || '/', 'http://localhost');
      if (parsedUrl.pathname !== '/api/realtime/voice') {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request, parsedUrl);
      });
    } catch {
      socket.destroy();
    }
  });

  wss.on(
    'connection',
    async (
      clientWs: WebSocket,
      _req: http.IncomingMessage,
      parsedUrl: URL
    ) => {
      const sendClient = (payload: Record<string, unknown>) => {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify(payload));
        }
      };

      const token = parsedUrl.searchParams.get('token') || '';
      const requestedProvider =
        parsedUrl.searchParams.get('provider') === 'openai'
          ? 'openai'
          : 'gemini';

      const wsUser = await resolveWsUser(token);
      if (!wsUser) {
        sendClient({
          type: 'error',
          code: 'LOGIN_REQUIRED',
          message: 'Unauthorized session. Please sign in again.',
        });
        clientWs.close();
        return;
      }

      const rawConfig = await getPlatformConfig();
      if (!rawConfig.toolsEnabled.voiceChat) {
        sendClient({
          type: 'error',
          message: 'Realtime voice is disabled by administrator.',
        });
        clientWs.close();
        return;
      }

      try {
        await enforcePlatformSpendCaps(rawConfig);
      } catch (capErr: unknown) {
        sendClient({
          type: 'error',
          message:
            capErr instanceof Error
              ? capErr.message
              : 'Platform spending cap reached.',
        });
        clientWs.close();
        return;
      }

      const reserveCredits = rawConfig.creditRates.voiceRealtime || 6;
      let reservationId = '';
      try {
        const resv = await reserveCreditsForUsage({
          userId: wsUser.id,
          feature: 'voice',
          reserveAmount: reserveCredits,
          description: `Realtime Voice (${requestedProvider.toUpperCase()})`,
        });
        reservationId = resv.reservationId;
      } catch (resvErr: unknown) {
        const msg =
          resvErr instanceof Error
            ? resvErr.message
            : 'Insufficient credits for Realtime Voice.';
        sendClient({
          type: 'error',
          code: msg.startsWith('RECHARGE_REQUIRED:')
            ? 'RECHARGE_REQUIRED'
            : 'RESERVE_FAILED',
          message: msg.replace(/^RECHARGE_REQUIRED:\s*/, ''),
        });
        clientWs.close();
        return;
      }

      let settled = false;
      let audioFramesReceived = 0;
      let geminiLiveSession: Awaited<
        ReturnType<typeof connectGeminiLiveVoiceSession>
      > | null = null;
      let openaiUpstreamWs: WebSocket | null = null;

      const settleSession = async (failed: boolean, failReason?: string) => {
        if (settled) return;
        settled = true;
        try {
          const shouldCharge = !failed && audioFramesReceived > 0;
          await finalizeCreditReservation({
            userId: wsUser.id,
            reservationId,
            reservedAmount: reserveCredits,
            actualAmount: shouldCharge ? reserveCredits : 0,
            feature: 'voice',
            description: failed
              ? failReason || 'Realtime voice failure refund'
              : 'Realtime voice session completed',
          });

          if (shouldCharge) {
            await db.insert(providerUsageLogs).values({
              userId: wsUser.id,
              provider: requestedProvider,
              model:
                requestedProvider === 'openai'
                  ? 'gpt-4o-mini-realtime-preview'
                  : 'gemini-3.8-live',
              feature: 'voice',
              promptTokens: 350,
              completionTokens: 350,
              totalTokens: 700,
              providerCostUsd:
                requestedProvider === 'openai' ? '0.014000' : '0.002200',
              internalCreditsCharged: reserveCredits,
            });
          }
        } catch (err) {
          console.error('Realtime settlement error:', err);
        }
      };

      if (requestedProvider === 'gemini') {
        try {
          geminiLiveSession = await connectGeminiLiveVoiceSession({
            userFullName: wsUser.fullName,
            voiceName: wsUser.preferredVoice,
            onAudioBase64: (pcm24kBase64) => {
              audioFramesReceived++;
              sendClient({
                type: 'audio',
                sampleRate: 24000,
                base64: pcm24kBase64,
              });
            },
            onTranscript: (role, text) => {
              sendClient({ type: 'transcript', role, text });
            },
            onInterrupted: () => {
              sendClient({ type: 'interrupted' });
            },
            onError: async (safeError) => {
              await recordProviderApiError({
                actorUserId: wsUser.id,
                actorEmail: wsUser.email,
                provider: 'gemini',
                model: 'gemini-3.8-live',
                feature: 'voice_realtime',
                status: 500,
                errorCode: 'gemini_live_error',
                safeMessage: safeError,
              });
              sendClient({ type: 'error', message: safeError });
              await settleSession(true, safeError);
              clientWs.close();
            },
          });

          sendClient({
            type: 'ready',
            provider: 'gemini',
            model: 'gemini-3.8-live',
            creditsReserved: reserveCredits,
          });
        } catch (connErr: unknown) {
          const meta = extractProviderErrorMeta(connErr);
          await recordProviderApiError({
            actorUserId: wsUser.id,
            actorEmail: wsUser.email,
            provider: 'gemini',
            model: 'gemini-3.8-live',
            feature: 'voice_realtime',
            status: meta.status,
            errorCode: meta.errorCode,
            safeMessage: meta.safeMessage,
          });
          sendClient({ type: 'error', message: meta.safeMessage });
          await settleSession(true, 'Gemini Live connect failed');
          clientWs.close();
          return;
        }
      } else {
        // Official OpenAI Realtime WebSocket Bridge (strictly OpenAI — never falls back to Gemini)
        try {
          const headers = getOpenAIRealtimeAuthHeaders();
          openaiUpstreamWs = new WebSocket(
            'wss://api.openai.com/v1/realtime?model=gpt-4o-mini-realtime-preview',
            { headers }
          );

          openaiUpstreamWs.on('open', () => {
            openaiUpstreamWs?.send(
              JSON.stringify({
                type: 'session.update',
                session: {
                  modalities: ['audio', 'text'],
                  instructions: `You are QAAGA AGENT Realtime Voice Assistant speaking with ${wsUser.fullName}. Keep spoken responses concise and natural.`,
                  voice: 'alloy',
                  input_audio_format: 'pcm16',
                  output_audio_format: 'pcm16',
                  turn_detection: { type: 'server_vad' },
                },
              })
            );
            sendClient({
              type: 'ready',
              provider: 'openai',
              model: 'gpt-4o-mini-realtime-preview',
              creditsReserved: reserveCredits,
            });
          });

          openaiUpstreamWs.on('message', (raw) => {
            try {
              const evt = JSON.parse(raw.toString()) as {
                type?: string;
                delta?: string;
                transcript?: string;
                error?: { message?: string; code?: string };
              };
              if (evt.type === 'response.audio.delta' && evt.delta) {
                audioFramesReceived++;
                sendClient({
                  type: 'audio',
                  sampleRate: 24000,
                  base64: evt.delta,
                });
              } else if (
                evt.type === 'response.audio_transcript.delta' &&
                evt.delta
              ) {
                sendClient({
                  type: 'transcript',
                  role: 'assistant',
                  text: evt.delta,
                });
              } else if (
                evt.type ===
                  'conversation.item.input_audio_transcription.completed' &&
                evt.transcript
              ) {
                sendClient({
                  type: 'transcript',
                  role: 'user',
                  text: evt.transcript,
                });
              } else if (evt.type === 'error') {
                const meta = extractProviderErrorMeta(evt.error || evt);
                sendClient({ type: 'error', message: meta.safeMessage });
              }
            } catch {
              // ignore malformed upstream event
            }
          });

          openaiUpstreamWs.on('unexpected-response', async (_reqUp, resUp) => {
            const status = resUp.statusCode || 401;
            const safeMsg =
              status === 401
                ? 'OpenAI Realtime failed (HTTP 401 — Invalid API Key). Configure a valid OPENAI_API_KEY in Settings > Secrets. Reserved credits refunded.'
                : `OpenAI Realtime rejected connection (HTTP ${status}). Reserved credits refunded.`;
            await recordProviderApiError({
              actorUserId: wsUser.id,
              actorEmail: wsUser.email,
              provider: 'openai',
              model: 'gpt-4o-mini-realtime-preview',
              feature: 'voice_realtime',
              status,
              errorCode: `http_${status}`,
              safeMessage: safeMsg,
            });
            sendClient({ type: 'error', message: safeMsg });
            await settleSession(true, safeMsg);
            clientWs.close();
          });

          openaiUpstreamWs.on('error', async (wsErr) => {
            const meta = extractProviderErrorMeta(wsErr);
            await recordProviderApiError({
              actorUserId: wsUser.id,
              actorEmail: wsUser.email,
              provider: 'openai',
              model: 'gpt-4o-mini-realtime-preview',
              feature: 'voice_realtime',
              status: meta.status,
              errorCode: meta.errorCode,
              safeMessage: meta.safeMessage,
            });
            sendClient({ type: 'error', message: meta.safeMessage });
            await settleSession(true, meta.safeMessage);
            clientWs.close();
          });
        } catch (initErr: unknown) {
          const meta = extractProviderErrorMeta(initErr);
          await recordProviderApiError({
            actorUserId: wsUser.id,
            actorEmail: wsUser.email,
            provider: 'openai',
            model: 'gpt-4o-mini-realtime-preview',
            feature: 'voice_realtime',
            status: meta.status,
            errorCode: meta.errorCode,
            safeMessage: meta.safeMessage,
          });
          sendClient({ type: 'error', message: meta.safeMessage });
          await settleSession(true, meta.safeMessage);
          clientWs.close();
          return;
        }
      }

      clientWs.on('message', (rawMsg) => {
        try {
          const msg = JSON.parse(rawMsg.toString()) as {
            type?: string;
            base64?: string;
            text?: string;
          };
          if (msg.type === 'audio' && msg.base64) {
            if (geminiLiveSession) {
              geminiLiveSession.sendRealtimeInput({
                media: {
                  data: msg.base64,
                  mimeType: 'audio/pcm;rate=16000',
                },
              });
            } else if (
              openaiUpstreamWs &&
              openaiUpstreamWs.readyState === WebSocket.OPEN
            ) {
              openaiUpstreamWs.send(
                JSON.stringify({
                  type: 'input_audio_buffer.append',
                  audio: msg.base64,
                })
              );
            }
          } else if (msg.type === 'text' && msg.text) {
            if (geminiLiveSession) {
              geminiLiveSession.sendClientContent({
                turns: [
                  {
                    role: 'user',
                    parts: [{ text: msg.text }],
                  },
                ],
                turnComplete: true,
              });
            } else if (
              openaiUpstreamWs &&
              openaiUpstreamWs.readyState === WebSocket.OPEN
            ) {
              openaiUpstreamWs.send(
                JSON.stringify({
                  type: 'conversation.item.create',
                  item: {
                    type: 'message',
                    role: 'user',
                    content: [{ type: 'input_text', text: msg.text }],
                  },
                })
              );
              openaiUpstreamWs.send(JSON.stringify({ type: 'response.create' }));
            }
          }
        } catch {
          // ignore malformed client frame
        }
      });

      clientWs.on('close', async () => {
        try {
          geminiLiveSession?.close();
        } catch {
          // ignore
        }
        try {
          openaiUpstreamWs?.close();
        } catch {
          // ignore
        }
        await settleSession(false);
      });
    }
  );

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`QAAGA AGENT SaaS Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
