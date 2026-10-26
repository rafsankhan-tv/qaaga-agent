import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull().unique(),
  fullName: text('full_name').notNull(),
  passwordHash: text('password_hash'),
  role: text('role').notNull().default('user'), // 'user' | 'admin'
  status: text('status').notNull().default('PENDING'), // 'PENDING' | 'ACTIVE' | 'SUSPENDED'
  subscriptionExpiresAt: timestamp('subscription_expires_at'),
  dailyCreditLimit: integer('daily_credit_limit').notNull().default(500),
  preferredModel: text('preferred_model').notNull().default('gpt-4o-mini'),
  preferredVoice: text('preferred_voice').notNull().default('alloy'),
  theme: text('theme').notNull().default('light'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const rechargePackages = pgTable('recharge_packages', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  amountBdt: integer('amount_bdt').notNull().unique(),
  credits: integer('credits').notNull(),
  validityDays: integer('validity_days').notNull().default(30),
  active: boolean('active').notNull().default(true),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const creditLedger = pgTable('credit_ledger', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  entryType: text('entry_type').notNull(), // 'GRANT_RECHARGE' | 'ADMIN_ADJUST' | 'RESERVE' | 'SETTLE' | 'REFUND'
  feature: text('feature').notNull(), // 'recharge' | 'chat' | 'image' | 'pdf' | 'search' | 'voice' | 'admin'
  deltaCredits: integer('delta_credits').notNull(),
  balanceAfter: integer('balance_after').notNull(),
  reservationId: text('reservation_id'),
  description: text('description').notNull(),
  metadataJson: text('metadata_json'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const providerUsageLogs = pgTable('provider_usage_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  provider: text('provider').notNull(), // 'openai' | 'gemini' | 'demo'
  model: text('model').notNull(),
  feature: text('feature').notNull(), // 'chat' | 'image' | 'pdf' | 'search' | 'voice'
  promptTokens: integer('prompt_tokens').notNull().default(0),
  completionTokens: integer('completion_tokens').notNull().default(0),
  totalTokens: integer('total_tokens').notNull().default(0),
  providerCostUsd: numeric('provider_cost_usd', {
    precision: 12,
    scale: 6,
  })
    .notNull()
    .default('0'),
  internalCreditsCharged: integer('internal_credits_charged').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const paymentRequests = pgTable('payment_requests', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  packageId: integer('package_id').references(() => rechargePackages.id),
  paymentMethod: text('payment_method').notNull(), // 'bKash' | 'Nagad' | 'Rocket'
  receiverNumber: text('receiver_number').notNull(),
  senderNumber: text('sender_number').notNull(),
  transactionId: text('transaction_id').notNull().unique(),
  amountBdt: integer('amount_bdt').notNull(),
  creditsToGrant: integer('credits_to_grant').notNull(),
  screenshotData: text('screenshot_data').notNull(),
  screenshotMime: text('screenshot_mime').notNull().default('image/png'),
  status: text('status').notNull().default('PENDING'), // 'PENDING' | 'APPROVED' | 'REJECTED'
  adminNote: text('admin_note'),
  reviewedBy: integer('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const chatSessions = pgTable('chat_sessions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  title: text('title').notNull(),
  model: text('model').notNull().default('gpt-4o-mini'),
  mode: text('mode').notNull().default('chat'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const chatMessages = pgTable('chat_messages', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id')
    .references(() => chatSessions.id)
    .notNull(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  role: text('role').notNull(), // 'user' | 'assistant'
  content: text('content').notNull(),
  model: text('model'),
  mode: text('mode').notNull().default('chat'),
  attachmentsJson: text('attachments_json'),
  citationsJson: text('citations_json'),
  imageDataUrl: text('image_data_url'),
  creditsCharged: integer('credits_charged').notNull().default(0),
  tokensUsed: integer('tokens_used').notNull().default(0),
  providerCostUsd: text('provider_cost_usd').default('0'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  title: text('title').notNull(),
  detail: text('detail').notNull(),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const platformSettings = pgTable('platform_settings', {
  key: text('key').primaryKey(),
  valueJson: text('value_json').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  actorUserId: integer('actor_user_id').references(() => users.id),
  actorEmail: text('actor_email').notNull(),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id'),
  detailsJson: text('details_json'),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  ledgerEntries: many(creditLedger),
  providerLogs: many(providerUsageLogs),
  payments: many(paymentRequests),
  sessions: many(chatSessions),
  notifications: many(notifications),
}));

export const chatSessionsRelations = relations(chatSessions, ({ one, many }) => ({
  user: one(users, {
    fields: [chatSessions.userId],
    references: [users.id],
  }),
  messages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  session: one(chatSessions, {
    fields: [chatMessages.sessionId],
    references: [chatSessions.id],
  }),
}));
