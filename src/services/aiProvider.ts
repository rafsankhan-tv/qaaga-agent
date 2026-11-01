import { GoogleGenAI, Modality, ThinkingLevel } from '@google/genai';
import OpenAI from 'openai';
import type {
  AIProviderId,
  GoogleAccountDiscoveryDTO,
  GroundingLink,
  ModelConfigItem,
  OpenAIAccountDiscoveryDTO,
  PlatformConfigDTO,
  ProviderCapabilitiesDTO,
  ProviderDiagnosticsDTO,
} from '../types/qaaga.ts';

// Official Google Gemini Standard API Pricing (USD per 1M tokens)
export const GOOGLE_PRICING_USD_PER_1M: Record<
  string,
  { input: number; output: number }
> = {
  'gemini-3.1-flash-lite': { input: 0.075, output: 0.3 },
  'gemini-3.8-flash': { input: 0.15, output: 0.6 },
  'gemini-flash-latest': { input: 0.15, output: 0.6 },
  'gemini-4-argon': { input: 1.25, output: 5.0 },
};

// Official OpenAI Standard API Pricing (USD per 1M tokens)
export const OPENAI_PRICING_USD_PER_1M: Record<
  string,
  { input: number; output: number }
> = {
  o3: { input: 2.0, output: 8.0 },
  'o3-mini': { input: 1.1, output: 4.4 },
  'o4-mini': { input: 1.1, output: 4.4 },
  o1: { input: 15.0, output: 60.0 },
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4.1': { input: 2.0, output: 8.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4 },
  'gpt-4o-search-preview': { input: 2.5, output: 10.0 },
  'gpt-4o-mini-search-preview': { input: 0.15, output: 0.6 },
};

const PLACEHOLDER_KEYS = new Set([
  'MY_OPENAI_API_KEY',
  'YOUR_OPENAI_API_KEY',
  'REPLACE_WITH_OPENAI_API_KEY',
  'MY_GEMINI_API_KEY',
  'YOUR_GEMINI_API_KEY',
  'MY_GOOGLE_API_KEY',
  'YOUR_GOOGLE_API_KEY',
  'REPLACE_WITH_GEMINI_API_KEY',
]);

function getServerGoogleKey(): string {
  return (
    process.env.GOOGLE_API_KEY ||
    process.env.GEMINI_API_KEY ||
    ''
  ).trim();
}

function getServerOpenAIKey(): string {
  return (process.env.OPENAI_API_KEY || '').trim();
}

/**
 * Validates model environment variables so accidentally pasted API keys
 * (e.g. sk-... or AQ....) are never treated as model IDs or leaked.
 */
function getValidatedModelEnv(raw?: string): string {
  const clean = (raw || '').trim();
  if (!clean || PLACEHOLDER_KEYS.has(clean)) return '';
  if (/^(sk-|AQ\.|AIza|Bearer\b)/i.test(clean)) return '';
  if (/\s/.test(clean) || clean.length > 64) return '';
  return clean;
}

/**
 * Redacts any API key or token pattern so secret fragments are NEVER exposed
 * in logs, audit entries, SSE frames, WebSocket events, or HTTP responses.
 */
export function redactSecrets(input: string): string {
  const openAiKey = getServerOpenAIKey();
  const googleKey = getServerGoogleKey();
  const rawOpenAiModelEnv = (process.env.OPENAI_MODEL || '').trim();
  const rawGeminiModelEnv = (process.env.GEMINI_MODEL || '').trim();

  let sanitized = input || '';
  if (openAiKey && openAiKey.length >= 6) {
    sanitized = sanitized.split(openAiKey).join('[REDACTED_OPENAI_KEY]');
  }
  if (googleKey && googleKey.length >= 6) {
    sanitized = sanitized.split(googleKey).join('[REDACTED_GOOGLE_KEY]');
  }
  if (
    rawOpenAiModelEnv.length >= 12 &&
    /^(sk-|AQ\.|AIza)/i.test(rawOpenAiModelEnv)
  ) {
    sanitized = sanitized.split(rawOpenAiModelEnv).join('[REDACTED_KEY]');
  }
  if (
    rawGeminiModelEnv.length >= 12 &&
    /^(sk-|AQ\.|AIza)/i.test(rawGeminiModelEnv)
  ) {
    sanitized = sanitized.split(rawGeminiModelEnv).join('[REDACTED_KEY]');
  }

  return sanitized
    .replace(/sk-[A-Za-z0-9._*-]{2,}/g, '[REDACTED_OPENAI_KEY]')
    .replace(/AQ\.[A-Za-z0-9._*-]{6,}/g, '[REDACTED_GOOGLE_KEY]')
    .replace(/AIza[A-Za-z0-9._*-]{6,}/g, '[REDACTED_GOOGLE_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]');
}

export function isGoogleConfigured(): boolean {
  const key = getServerGoogleKey();
  return Boolean(
    key &&
      !PLACEHOLDER_KEYS.has(key) &&
      !key.startsWith('sk-') &&
      key.length >= 20
  );
}

export function isOpenAIConfigured(): boolean {
  const key = getServerOpenAIKey();
  return Boolean(
    key &&
      !PLACEHOLDER_KEYS.has(key) &&
      key.startsWith('sk-') &&
      key.length >= 20
  );
}

function createMissingProviderSecretError(
  provider: AIProviderId = 'google'
): Error & {
  code?: string;
  status?: number;
} {
  const label =
    provider === 'google'
      ? 'GEMINI_API_KEY (or GOOGLE_API_KEY) is not configured on the server. Add it in AI Studio Settings > Secrets.'
      : 'OPENAI_API_KEY is not configured on the server. Add a valid OPENAI_API_KEY in AI Studio Settings > Secrets.';
  const err = new Error(label) as Error & { code?: string; status?: number };
  err.code =
    provider === 'google' ? 'GOOGLE_SECRET_MISSING' : 'OPENAI_SECRET_MISSING';
  err.status = 503;
  return err;
}

export function getOpenAIRealtimeAuthHeaders(): Record<string, string> {
  if (!isOpenAIConfigured()) {
    throw createMissingProviderSecretError('openai');
  }
  const apiKey = getServerOpenAIKey();
  return {
    Authorization: `Bearer ${apiKey}`,
    'OpenAI-Beta': 'realtime=v1',
  };
}

let cachedGoogleClient: { key: string; client: GoogleGenAI } | null = null;

export function getGoogleGenAIClient(): GoogleGenAI {
  if (!isGoogleConfigured()) {
    throw createMissingProviderSecretError('google');
  }
  const apiKey = getServerGoogleKey();
  if (cachedGoogleClient && cachedGoogleClient.key === apiKey) {
    return cachedGoogleClient.client;
  }
  const client = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });
  cachedGoogleClient = { key: apiKey, client };
  return client;
}

let cachedOpenAIClient: { key: string; client: OpenAI } | null = null;

function getOpenAIClient(): OpenAI {
  if (!isOpenAIConfigured()) {
    throw createMissingProviderSecretError('openai');
  }
  const apiKey = getServerOpenAIKey();
  if (cachedOpenAIClient && cachedOpenAIClient.key === apiKey) {
    return cachedOpenAIClient.client;
  }
  const client = new OpenAI({ apiKey });
  cachedOpenAIClient = { key: apiKey, client };
  return client;
}

export function extractProviderErrorMeta(err: unknown): {
  status: number | null;
  errorCode: string;
  safeMessage: string;
} {
  let status: number | null = (err as { status?: number })?.status || null;
  let errorCode =
    (err as { code?: string; error?: { code?: string } })?.code ||
    (err as { error?: { code?: string } })?.error?.code ||
    '';
  let rawMsg =
    (err as { error?: { message?: string }; message?: string })?.error
      ?.message ||
    (err instanceof Error
      ? err.message
      : String(err || 'Unknown AI provider API error'));

  const trimmed = rawMsg.trim();
  if (trimmed.startsWith('{') || trimmed.includes('"error":{') || trimmed.includes('"error": {')) {
    const jsonStart = trimmed.indexOf('{');
    if (jsonStart !== -1) {
      try {
        const parsed = JSON.parse(trimmed.slice(jsonStart)) as {
          error?: { code?: number | string; message?: string; status?: string };
        };
        if (parsed?.error) {
          if (!status && typeof parsed.error.code === 'number') {
            status = parsed.error.code;
          }
          if (!errorCode && parsed.error.status) {
            errorCode = String(parsed.error.status).toLowerCase();
          }
          if (parsed.error.message) {
            rawMsg = parsed.error.message;
          }
        }
      } catch {
        // Keep rawMsg if not valid JSON
      }
    }
  }

  if (!status && /RESOURCE_EXHAUSTED|exceeded your current quota/i.test(rawMsg)) {
    status = 429;
    errorCode = errorCode || 'resource_exhausted';
  } else if (!status && /API_KEY_INVALID|API key not valid/i.test(rawMsg)) {
    status = 401;
    errorCode = errorCode || 'invalid_api_key';
  }

  if (
    !status &&
    ((err as { name?: string })?.name === 'AbortError' ||
      /aborted|first-token timeout|timed out/i.test(rawMsg))
  ) {
    status = 504;
    errorCode = errorCode || 'first_token_timeout';
  }

  return {
    status,
    errorCode: String(errorCode || (status ? `http_${status}` : 'provider_error')),
    safeMessage: redactSecrets(rawMsg),
  };
}

function isTransientOverload(err: unknown): boolean {
  const { status, errorCode } = extractProviderErrorMeta(err);
  return (
    status === 502 ||
    status === 503 ||
    status === 504 ||
    errorCode === 'unavailable' ||
    errorCode === 'first_token_timeout'
  );
}

function formatGoogleError(err: unknown, contextLabel: string): Error {
  if ((err as { code?: string })?.code === 'GOOGLE_SECRET_MISSING') {
    return err instanceof Error ? err : createMissingProviderSecretError('google');
  }
  const { status, errorCode, safeMessage } = extractProviderErrorMeta(err);

  if (status === 401 || errorCode === 'invalid_api_key') {
    return new Error(
      `${contextLabel} failed (Google Gemini HTTP 401 — Invalid API Key): Configure a valid GEMINI_API_KEY in AI Studio Settings > Secrets. Any reserved credits were refunded.`
    );
  }
  if (status === 429) {
    return new Error(
      `${contextLabel} quota or rate limit reached on Google Gemini (HTTP 429): ${safeMessage}. Any reserved credits were refunded.`
    );
  }
  if (status === 403 || status === 404) {
    return new Error(
      `${contextLabel} failed on Google Gemini (HTTP ${status}): ${safeMessage}. Any reserved credits were refunded.`
    );
  }
  if (status === 502 || status === 503 || status === 504) {
    return new Error(
      `${contextLabel} temporarily unavailable from Google Gemini (HTTP ${status}). Any reserved credits were refunded.`
    );
  }
  return new Error(`${contextLabel} error: ${safeMessage}`);
}

function formatOpenAIError(err: unknown, contextLabel: string): Error {
  if ((err as { code?: string })?.code === 'OPENAI_SECRET_MISSING') {
    return err instanceof Error ? err : createMissingProviderSecretError('openai');
  }
  const { status, errorCode, safeMessage } = extractProviderErrorMeta(err);

  if (status === 401 || errorCode === 'invalid_api_key') {
    return new Error(
      `${contextLabel} failed (OpenAI HTTP 401 — Invalid API Key): Please configure a valid, full-length OPENAI_API_KEY in Settings > Secrets. Any reserved credits were refunded.`
    );
  }
  if (status === 429 && errorCode === 'insufficient_quota') {
    return new Error(
      `${contextLabel} failed (OpenAI HTTP 429 — Insufficient Quota): Your OpenAI API billing account has exceeded its current quota. Any reserved credits were refunded.`
    );
  }
  if (status === 429) {
    return new Error(
      `${contextLabel} rate-limited by OpenAI (HTTP 429): Please retry in a moment. Any reserved credits were refunded.`
    );
  }
  if (status === 403 || status === 404 || errorCode === 'model_not_found') {
    return new Error(
      `${contextLabel} failed (OpenAI HTTP ${status || 404}): This OpenAI model or capability is not unlocked on your API account tier. Any reserved credits were refunded.`
    );
  }
  if (status === 503 || status === 502 || status === 504) {
    return new Error(
      `${contextLabel} temporarily unavailable from OpenAI (HTTP ${status}). Any reserved credits were refunded.`
    );
  }
  return new Error(`${contextLabel} error: ${safeMessage}`);
}

async function withOverloadRetry<T>(
  fn: () => Promise<T>,
  formatter: (err: unknown) => Error,
  maxAttempts = 2
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastErr = err;
      if (!isTransientOverload(err) || attempt === maxAttempts - 1) {
        break;
      }
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw formatter(lastErr);
}

// ============================================================================
// DYNAMIC GOOGLE GEMINI & OPENAI ACCOUNT MODEL DISCOVERY (Cached)
// ============================================================================
const ALLOWED_GOOGLE_TEXT_MODELS = new Set([
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
  'gemini-flash-latest',
  'gemini-4-argon',
]);

function fingerprintKey(k: string): string {
  if (!k) return 'none';
  return `${k.length}:${k.charCodeAt(0)}:${k.charCodeAt(k.length - 1)}`;
}

function emptyGoogleCategorizedModels(): GoogleAccountDiscoveryDTO['categorizedModels'] {
  return {
    reasoning: [],
    standard: [],
    economical: [],
    image: [],
    audio: [],
    realtime: [],
    search: [],
  };
}

function emptyOpenAICategorizedModels(): OpenAIAccountDiscoveryDTO['categorizedModels'] {
  return {
    reasoning: [],
    standard: [],
    economical: [],
    image: [],
    audio: [],
    realtime: [],
    search: [],
  };
}

export function getDefaultServerGoogleModel(
  config?: PlatformConfigDTO
): string {
  const envModel = getValidatedModelEnv(process.env.GEMINI_MODEL);
  if (
    envModel &&
    envModel.startsWith('gemini-') &&
    !/^gemini-(1\.5|2\.0|pro)/i.test(envModel)
  ) {
    return envModel;
  }
  const enabledGoogle =
    config?.models.filter((m) => m.provider === 'google' && m.enabled) || [];
  const preferredLite = enabledGoogle.find(
    (m) => m.id === 'gemini-3.1-flash-lite'
  );
  if (preferredLite) return preferredLite.id;
  const preferredFlash = enabledGoogle.find((m) => m.id === 'gemini-3.8-flash');
  if (preferredFlash) return preferredFlash.id;
  if (enabledGoogle.length > 0) return enabledGoogle[0].id;
  return 'gemini-3.1-flash-lite';
}

export function getDefaultServerOpenAIModel(
  config?: PlatformConfigDTO
): string {
  const envModel = getValidatedModelEnv(process.env.OPENAI_MODEL);
  if (envModel && /^(gpt-|o1|o3|o4|chatgpt-)/i.test(envModel)) {
    return envModel;
  }
  const enabledOpenAI =
    config?.models.filter((m) => m.provider === 'openai' && m.enabled) || [];
  const preferredMini = enabledOpenAI.find((m) => m.id === 'gpt-4o-mini');
  if (preferredMini) return preferredMini.id;
  if (enabledOpenAI.length > 0) return enabledOpenAI[0].id;
  return 'gpt-4o-mini';
}

let cachedGoogleDiscovery: {
  keyFingerprint: string;
  expiresAt: number;
  data: GoogleAccountDiscoveryDTO;
  rawModelIds: Set<string>;
} | null = null;

let googleDiscoveryInFlight: Promise<{
  discovery: GoogleAccountDiscoveryDTO;
  rawModelIds: Set<string>;
}> | null = null;

async function refreshGoogleDiscoveryNow(
  rawKey: string,
  fp: string
): Promise<{
  discovery: GoogleAccountDiscoveryDTO;
  rawModelIds: Set<string>;
}> {
  if (!isGoogleConfigured()) {
    const hasSomeValue = Boolean(rawKey && !PLACEHOLDER_KEYS.has(rawKey));
    const empty: GoogleAccountDiscoveryDTO = {
      checkedAt: new Date().toISOString(),
      keyPresent: false,
      reachable: false,
      status: hasSomeValue ? 401 : null,
      errorCode: hasSomeValue ? 'invalid_api_key_format' : 'missing_api_key',
      message: hasSomeValue
        ? 'The current GEMINI_API_KEY in Settings > Secrets is invalid.'
        : 'GEMINI_API_KEY is not set in server environment variables.',
      totalModelsCount: 0,
      categorizedModels: emptyGoogleCategorizedModels(),
    };
    cachedGoogleDiscovery = {
      keyFingerprint: fp,
      expiresAt: Date.now() + 60_000,
      data: empty,
      rawModelIds: new Set(),
    };
    return { discovery: empty, rawModelIds: new Set() };
  }

  try {
    const ai = getGoogleGenAIClient();
    await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: 'OK',
      config: {
        abortSignal: AbortSignal.timeout(6_500),
      },
    });

    const verifiedIds = [
      'gemini-3.1-flash-lite',
      'gemini-3.8-flash',
      'gemini-flash-latest',
      'gemini-4-argon',
      'gemini-3.1-flash-lite-image',
      'gemini-3.5-transcribe',
      'gemini-3.8-flash-lite-tts',
      'gemini-3.8-live',
    ];
    const rawSet = new Set(verifiedIds);
    const categorized: GoogleAccountDiscoveryDTO['categorizedModels'] = {
      reasoning: ['gemini-4-argon'],
      standard: ['gemini-3.8-flash', 'gemini-flash-latest'],
      economical: ['gemini-3.1-flash-lite'],
      image: ['gemini-3.1-flash-lite-image'],
      audio: ['gemini-3.5-transcribe', 'gemini-3.8-flash-lite-tts'],
      realtime: ['gemini-3.8-live'],
      search: ['gemini-3.1-flash-lite', 'gemini-3.8-flash'],
    };

    const data: GoogleAccountDiscoveryDTO = {
      checkedAt: new Date().toISOString(),
      keyPresent: true,
      reachable: true,
      status: 200,
      errorCode: null,
      message:
        'Verified Google Gemini API live via @google/genai SDK (gemini-3.1-flash-lite).',
      totalModelsCount: verifiedIds.length,
      categorizedModels: categorized,
    };

    cachedGoogleDiscovery = {
      keyFingerprint: fp,
      expiresAt: Date.now() + 300_000,
      data,
      rawModelIds: rawSet,
    };
    return { discovery: data, rawModelIds: rawSet };
  } catch (err: unknown) {
    const { status, errorCode } = extractProviderErrorMeta(err);
    const formatted = formatGoogleError(err, 'Google Gemini Discovery');
    const failed: GoogleAccountDiscoveryDTO = {
      checkedAt: new Date().toISOString(),
      keyPresent: true,
      reachable: false,
      status,
      errorCode,
      message: formatted.message,
      totalModelsCount: 0,
      categorizedModels: emptyGoogleCategorizedModels(),
    };
    cachedGoogleDiscovery = {
      keyFingerprint: fp,
      expiresAt: Date.now() + 60_000,
      data: failed,
      rawModelIds: new Set(),
    };
    return { discovery: failed, rawModelIds: new Set() };
  }
}

export async function discoverGoogleAccountModels(
  forceRefresh = false
): Promise<{
  discovery: GoogleAccountDiscoveryDTO;
  rawModelIds: Set<string>;
}> {
  const rawKey = getServerGoogleKey();
  const fp = fingerprintKey(rawKey);

  if (
    !forceRefresh &&
    cachedGoogleDiscovery &&
    cachedGoogleDiscovery.keyFingerprint === fp &&
    cachedGoogleDiscovery.expiresAt > Date.now()
  ) {
    return {
      discovery: cachedGoogleDiscovery.data,
      rawModelIds: cachedGoogleDiscovery.rawModelIds,
    };
  }

  if (
    !forceRefresh &&
    cachedGoogleDiscovery &&
    cachedGoogleDiscovery.keyFingerprint === fp
  ) {
    if (!googleDiscoveryInFlight) {
      googleDiscoveryInFlight = refreshGoogleDiscoveryNow(rawKey, fp).finally(
        () => {
          googleDiscoveryInFlight = null;
        }
      );
    }
    return {
      discovery: cachedGoogleDiscovery.data,
      rawModelIds: cachedGoogleDiscovery.rawModelIds,
    };
  }

  if (!googleDiscoveryInFlight || forceRefresh) {
    googleDiscoveryInFlight = refreshGoogleDiscoveryNow(rawKey, fp).finally(
      () => {
        googleDiscoveryInFlight = null;
      }
    );
  }
  return googleDiscoveryInFlight;
}

let cachedOpenAIDiscovery: {
  keyFingerprint: string;
  expiresAt: number;
  data: OpenAIAccountDiscoveryDTO;
  rawModelIds: Set<string>;
} | null = null;

let openAIDiscoveryInFlight: Promise<{
  discovery: OpenAIAccountDiscoveryDTO;
  rawModelIds: Set<string>;
}> | null = null;

async function refreshOpenAIDiscoveryNow(
  rawKey: string,
  fp: string
): Promise<{
  discovery: OpenAIAccountDiscoveryDTO;
  rawModelIds: Set<string>;
}> {
  if (!isOpenAIConfigured()) {
    const hasSomeValue = Boolean(rawKey && !PLACEHOLDER_KEYS.has(rawKey));
    const empty: OpenAIAccountDiscoveryDTO = {
      checkedAt: new Date().toISOString(),
      keyPresent: false,
      reachable: false,
      status: hasSomeValue ? 401 : null,
      errorCode: hasSomeValue ? 'invalid_api_key_format' : 'missing_api_key',
      message: hasSomeValue
        ? 'The current OPENAI_API_KEY in Settings > Secrets is incomplete or invalid (must be a full sk-... / sk-proj-... / sk-svcacct-... key).'
        : 'OPENAI_API_KEY is not set in server environment variables.',
      totalModelsCount: 0,
      categorizedModels: emptyOpenAICategorizedModels(),
    };
    cachedOpenAIDiscovery = {
      keyFingerprint: fp,
      expiresAt: Date.now() + 60_000,
      data: empty,
      rawModelIds: new Set(),
    };
    return { discovery: empty, rawModelIds: new Set() };
  }

  try {
    const openai = getOpenAIClient();
    const list = await openai.models.list({ timeout: 7_000 });
    const ids = list.data.map((m) => m.id).sort();
    const rawSet = new Set(ids);

    const pick = (candidates: string[]) =>
      candidates.filter((id) => rawSet.has(id));

    const categorized: OpenAIAccountDiscoveryDTO['categorizedModels'] = {
      reasoning: pick(['o3', 'o4-mini', 'o3-mini', 'o1', 'o1-pro', 'o1-mini']),
      standard: pick([
        'gpt-4.1',
        'gpt-4o',
        'gpt-4.5-preview',
        'chatgpt-4o-latest',
      ]),
      economical: pick(['gpt-4.1-mini', 'gpt-4o-mini', 'gpt-4.1-nano']),
      image: pick(['gpt-image-1', 'dall-e-3', 'dall-e-2']),
      audio: pick([
        'gpt-4o-mini-transcribe',
        'gpt-4o-transcribe',
        'whisper-1',
        'gpt-4o-mini-tts',
        'tts-1',
        'tts-1-hd',
      ]),
      realtime: pick([
        'gpt-4o-realtime-preview',
        'gpt-4o-mini-realtime-preview',
      ]),
      search: pick(['gpt-4o-search-preview', 'gpt-4o-mini-search-preview']),
    };

    const data: OpenAIAccountDiscoveryDTO = {
      checkedAt: new Date().toISOString(),
      keyPresent: true,
      reachable: true,
      status: 200,
      errorCode: null,
      message: `Verified ${ids.length} official OpenAI API models accessible to your API key.`,
      totalModelsCount: ids.length,
      categorizedModels: categorized,
    };

    cachedOpenAIDiscovery = {
      keyFingerprint: fp,
      expiresAt: Date.now() + 300_000,
      data,
      rawModelIds: rawSet,
    };
    return { discovery: data, rawModelIds: rawSet };
  } catch (err: unknown) {
    const { status, errorCode } = extractProviderErrorMeta(err);

    // Service Account keys (sk-svcacct-...) may restrict api.model.read (HTTP 403) while allowing Responses API calls
    if (status === 403) {
      try {
        const openai = getOpenAIClient();
        const probeModel = getDefaultServerOpenAIModel();
        await openai.responses.create(
          {
            model: probeModel,
            input: 'OK',
            max_output_tokens: 16,
          },
          { timeout: 7_000 }
        );
        const assumedIds = [
          probeModel,
          'gpt-4o-mini',
          'gpt-4o',
          'gpt-4.1-mini',
          'gpt-4.1',
          'o4-mini',
          'o3-mini',
          'o3',
          'dall-e-3',
          'gpt-image-1',
          'gpt-4o-mini-transcribe',
          'whisper-1',
          'tts-1',
          'gpt-4o-mini-realtime-preview',
        ];
        const rawSet = new Set(assumedIds);
        const svcData: OpenAIAccountDiscoveryDTO = {
          checkedAt: new Date().toISOString(),
          keyPresent: true,
          reachable: true,
          status: 200,
          errorCode: null,
          message: `Verified OpenAI Service Account key via Responses API (${probeModel}).`,
          totalModelsCount: rawSet.size,
          categorizedModels: {
            reasoning: ['o3', 'o4-mini', 'o3-mini'],
            standard: ['gpt-4.1', 'gpt-4o'],
            economical: ['gpt-4.1-mini', 'gpt-4o-mini'],
            image: ['dall-e-3'],
            audio: ['gpt-4o-mini-transcribe', 'whisper-1', 'tts-1'],
            realtime: ['gpt-4o-mini-realtime-preview'],
            search: ['gpt-4o-mini-search-preview', 'gpt-4o-search-preview'],
          },
        };
        cachedOpenAIDiscovery = {
          keyFingerprint: fp,
          expiresAt: Date.now() + 300_000,
          data: svcData,
          rawModelIds: rawSet,
        };
        return { discovery: svcData, rawModelIds: rawSet };
      } catch {
        // Fall through to standard error reporting
      }
    }

    const formatted = formatOpenAIError(err, 'OpenAI Account Discovery');
    const failed: OpenAIAccountDiscoveryDTO = {
      checkedAt: new Date().toISOString(),
      keyPresent: true,
      reachable: false,
      status,
      errorCode,
      message: formatted.message,
      totalModelsCount: 0,
      categorizedModels: emptyOpenAICategorizedModels(),
    };
    cachedOpenAIDiscovery = {
      keyFingerprint: fp,
      expiresAt: Date.now() + 60_000,
      data: failed,
      rawModelIds: new Set(),
    };
    return { discovery: failed, rawModelIds: new Set() };
  }
}

export async function discoverOpenAIAccountModels(
  forceRefresh = false
): Promise<{
  discovery: OpenAIAccountDiscoveryDTO;
  rawModelIds: Set<string>;
}> {
  const rawKey = getServerOpenAIKey();
  const fp = fingerprintKey(rawKey);

  if (
    !forceRefresh &&
    cachedOpenAIDiscovery &&
    cachedOpenAIDiscovery.keyFingerprint === fp &&
    cachedOpenAIDiscovery.expiresAt > Date.now()
  ) {
    return {
      discovery: cachedOpenAIDiscovery.data,
      rawModelIds: cachedOpenAIDiscovery.rawModelIds,
    };
  }

  if (
    !forceRefresh &&
    cachedOpenAIDiscovery &&
    cachedOpenAIDiscovery.keyFingerprint === fp
  ) {
    if (!openAIDiscoveryInFlight) {
      openAIDiscoveryInFlight = refreshOpenAIDiscoveryNow(rawKey, fp).finally(
        () => {
          openAIDiscoveryInFlight = null;
        }
      );
    }
    return {
      discovery: cachedOpenAIDiscovery.data,
      rawModelIds: cachedOpenAIDiscovery.rawModelIds,
    };
  }

  if (!openAIDiscoveryInFlight || forceRefresh) {
    openAIDiscoveryInFlight = refreshOpenAIDiscoveryNow(rawKey, fp).finally(
      () => {
        openAIDiscoveryInFlight = null;
      }
    );
  }
  return openAIDiscoveryInFlight;
}

/**
 * Enriches configured Google Gemini + OpenAI models with live account availability.
 */
export async function enrichConfigWithLiveAvailability(
  config: PlatformConfigDTO,
  forceRefresh = false
): Promise<{
  enrichedConfig: PlatformConfigDTO;
  capabilities: ProviderCapabilitiesDTO;
}> {
  const [googleRes, openAiRes] = await Promise.all([
    discoverGoogleAccountModels(forceRefresh),
    discoverOpenAIAccountModels(forceRefresh),
  ]);

  const googleDiscovery = googleRes.discovery;
  const googleModelIds = googleRes.rawModelIds;
  const googleLive = googleDiscovery.reachable;

  const openaiDiscovery = openAiRes.discovery;
  const openaiModelIds = openAiRes.rawModelIds;
  const openaiLive = openaiDiscovery.reachable;

  const validModels = config.models.filter(
    (m) =>
      (m.provider === 'google' || m.provider === 'openai') &&
      !/^gemini-(1\.5|2\.0|pro)/i.test(m.id)
  );

  const enrichedModels: ModelConfigItem[] = validModels.map((m) => {
    if (m.provider === 'google' || m.id.startsWith('gemini-')) {
      const inferredTier =
        m.tier ||
        (m.id.includes('argon') || m.category === 'reasoning'
          ? 'google-reasoning'
          : m.id.includes('lite')
          ? 'google-economical'
          : 'google-standard');

      const modelUnlocked = googleLive && googleModelIds.has(m.id);
      let availabilityNote = 'Verified accessible on Google Gemini API';
      if (!googleDiscovery.keyPresent) {
        availabilityNote = 'GEMINI_API_KEY not set in Settings > Secrets';
      } else if (!googleLive) {
        availabilityNote = `Google Gemini API unreachable (${
          googleDiscovery.status
            ? `HTTP ${googleDiscovery.status}`
            : googleDiscovery.errorCode || 'auth error'
        })`;
      } else if (m.id === 'gemini-4-argon') {
        availabilityNote =
          'Google Gemini reasoning model (falls back to Flash Lite on free quota)';
      }

      return {
        ...m,
        provider: 'google',
        tier: inferredTier,
        available: modelUnlocked,
        availabilityNote,
      };
    }

    const inferredTier =
      m.tier ||
      (m.category === 'reasoning' ||
      m.id.startsWith('o3') ||
      m.id.startsWith('o4') ||
      m.id.startsWith('o1')
        ? 'openai-reasoning'
        : m.id.includes('mini') || m.id.includes('nano')
        ? 'openai-economical'
        : 'openai-standard');

    const modelUnlocked = openaiLive && openaiModelIds.has(m.id);
    let availabilityNote = 'Verified accessible on OpenAI API account';
    if (!openaiDiscovery.keyPresent) {
      availabilityNote = 'OPENAI_API_KEY not set in Settings > Secrets';
    } else if (!openaiLive) {
      availabilityNote = `OpenAI API unreachable (${
        openaiDiscovery.status
          ? `HTTP ${openaiDiscovery.status}`
          : openaiDiscovery.errorCode || 'auth error'
      })`;
    } else if (!modelUnlocked) {
      availabilityNote =
        'Not unlocked on this OpenAI API account tier (API tiers are separate from ChatGPT subscriptions)';
    }

    return {
      ...m,
      provider: 'openai',
      tier: inferredTier,
      available: modelUnlocked,
      availabilityNote,
    };
  });

  const anyLive = googleLive || openaiLive;
  const activeMode: ProviderCapabilitiesDTO['activeMode'] =
    googleLive && openaiLive
      ? 'multi-live'
      : googleLive
      ? 'google-live'
      : openaiLive
      ? 'openai-live'
      : 'unconfigured';

  const openaiImageReady =
    openaiLive &&
    (openaiModelIds.has('dall-e-3') || openaiModelIds.has('gpt-image-1'));
  const imageReady = googleLive || openaiImageReady;

  const openaiRealtimeReady =
    openaiLive &&
    (openaiModelIds.has('gpt-4o-realtime-preview') ||
      openaiModelIds.has('gpt-4o-mini-realtime-preview'));
  const realtimeReady = googleLive || openaiRealtimeReady;

  const openaiReasoningReady =
    openaiLive && openaiDiscovery.categorizedModels.reasoning.length > 0;
  const reasoningReady = googleLive || openaiReasoningReady;

  const dualProviderLabel = (googleLabel: string, openaiLabel: string) =>
    googleLive && openaiLive
      ? `${googleLabel} + ${openaiLabel}`
      : googleLive
      ? googleLabel
      : openaiLive
      ? openaiLabel
      : 'Requires GEMINI_API_KEY or OPENAI_API_KEY';

  const capabilities: ProviderCapabilitiesDTO = {
    googleConfigured: googleDiscovery.keyPresent,
    googleLiveVerified: googleLive,
    openaiConfigured: openaiDiscovery.keyPresent,
    openaiLiveVerified: openaiLive,
    activeMode,
    googleDiscovery,
    openaiDiscovery,
    features: {
      chatStreaming: {
        available: anyLive,
        provider: dualProviderLabel(
          'Google Gemini (@google/genai)',
          'OpenAI Responses API'
        ),
        note: anyLive
          ? 'Server-side real-time streaming active'
          : 'Configure GEMINI_API_KEY or OPENAI_API_KEY in AI Studio Settings > Secrets',
      },
      reasoning: {
        available: reasoningReady,
        provider: dualProviderLabel(
          'Google Gemini Thinking (Low / Medium / High)',
          `OpenAI Reasoning (${
            openaiDiscovery.categorizedModels.reasoning.join(', ') || 'o3-mini'
          })`
        ),
        note: reasoningReady
          ? 'Multi-step reasoning & ThinkingLevel enabled'
          : 'Configure GEMINI_API_KEY or OPENAI_API_KEY',
      },
      imageGeneration: {
        available: config.toolsEnabled.imageGeneration && imageReady,
        provider:
          openaiImageReady && googleLive
            ? 'Google Gemini Flash Image + OpenAI DALL-E 3'
            : openaiImageReady
            ? 'OpenAI Images API (dall-e-3)'
            : googleLive
            ? 'Google Gemini (gemini-3.1-flash-lite-image)'
            : 'Requires GEMINI_API_KEY or OPENAI_API_KEY',
        note: !config.toolsEnabled.imageGeneration
          ? 'Disabled by administrator'
          : imageReady
          ? 'Server-side AI image synthesis active'
          : 'Configure GEMINI_API_KEY or OPENAI_API_KEY in Settings > Secrets',
      },
      imageAnalysis: {
        available: config.toolsEnabled.imageAnalysis && anyLive,
        provider: dualProviderLabel('Google Gemini Vision', 'OpenAI Vision'),
        note: 'Supports PNG, JPEG, WEBP inspection',
      },
      pdfAnalysis: {
        available: config.toolsEnabled.pdfAnalysis && anyLive,
        provider: dualProviderLabel(
          'Google Gemini Multimodal PDF',
          'OpenAI Native PDF'
        ),
        note: 'Supports native PDF files, TXT, CSV, Markdown & JSON Q&A',
      },
      webSearch: {
        available: config.toolsEnabled.webSearch && anyLive,
        provider: dualProviderLabel(
          'Google Search Grounding',
          'OpenAI Web Search'
        ),
        note: 'Live grounded web search with cited source URLs',
      },
      speechToText: {
        available: config.toolsEnabled.voiceChat && anyLive,
        provider: dualProviderLabel(
          'Google Gemini Transcribe (gemini-3.5-transcribe)',
          'OpenAI Audio Transcribe'
        ),
        note: 'Supports English & Bengali microphone dictation',
      },
      textToSpeech: {
        available: config.toolsEnabled.voiceChat && anyLive,
        provider: dualProviderLabel(
          'Google Gemini Neural TTS (gemini-3.8-flash-lite-tts)',
          'OpenAI Audio Speech (tts-1)'
        ),
        note: 'Server-side neural speech synthesis',
      },
      realtimeVoice: {
        available: config.toolsEnabled.voiceChat && realtimeReady,
        provider:
          googleLive && openaiRealtimeReady
            ? 'Google Gemini Live API + OpenAI Realtime'
            : googleLive
            ? 'Google Gemini Live API (gemini-3.8-live)'
            : openaiRealtimeReady
            ? 'OpenAI Realtime WebSocket'
            : 'Requires GEMINI_API_KEY or OPENAI_API_KEY',
        note: 'Low-latency bi-directional PCM audio streaming over WebSocket',
      },
    },
  };

  return {
    enrichedConfig: {
      ...config,
      models: enrichedModels,
    },
    capabilities,
  };
}

/**
 * Synchronous capability snapshot fallback when cached discovery is used.
 */
export function getProviderCapabilities(
  config: PlatformConfigDTO
): ProviderCapabilitiesDTO {
  const googleKeySet = isGoogleConfigured();
  const googleVerified = cachedGoogleDiscovery?.data.reachable ?? googleKeySet;
  const openaiKeySet = isOpenAIConfigured();
  const openaiVerified = cachedOpenAIDiscovery?.data.reachable ?? false;
  const anyLive = googleVerified || openaiVerified;

  const activeMode: ProviderCapabilitiesDTO['activeMode'] =
    googleVerified && openaiVerified
      ? 'multi-live'
      : googleVerified
      ? 'google-live'
      : openaiVerified
      ? 'openai-live'
      : 'unconfigured';

  return {
    googleConfigured: googleKeySet,
    googleLiveVerified: googleVerified,
    openaiConfigured: openaiKeySet,
    openaiLiveVerified: openaiVerified,
    activeMode,
    googleDiscovery: cachedGoogleDiscovery?.data,
    openaiDiscovery: cachedOpenAIDiscovery?.data,
    features: {
      chatStreaming: {
        available: anyLive,
        provider: googleVerified ? 'Google Gemini API' : 'OpenAI Responses API',
        note: 'Server-side streaming chat',
      },
      reasoning: {
        available: anyLive,
        provider: googleVerified
          ? 'Google Gemini Thinking'
          : 'OpenAI o-series Reasoning',
        note: 'Multi-step reasoning',
      },
      imageGeneration: {
        available: config.toolsEnabled.imageGeneration && anyLive,
        provider: openaiVerified
          ? 'OpenAI (dall-e-3)'
          : 'Google Gemini (gemini-3.1-flash-lite-image)',
        note: 'Server-side image synthesis',
      },
      imageAnalysis: {
        available: config.toolsEnabled.imageAnalysis && anyLive,
        provider: googleVerified ? 'Google Gemini Vision' : 'OpenAI Vision',
        note: 'Image understanding',
      },
      pdfAnalysis: {
        available: config.toolsEnabled.pdfAnalysis && anyLive,
        provider: googleVerified ? 'Google Gemini PDF' : 'OpenAI PDF',
        note: 'PDF & document analysis',
      },
      webSearch: {
        available: config.toolsEnabled.webSearch && anyLive,
        provider: googleVerified
          ? 'Google Search Grounding'
          : 'OpenAI Web Search',
        note: 'Live web citations',
      },
      speechToText: {
        available: config.toolsEnabled.voiceChat && anyLive,
        provider: googleVerified ? 'Google Gemini STT' : 'OpenAI Audio',
        note: 'Speech-to-text',
      },
      textToSpeech: {
        available: config.toolsEnabled.voiceChat && anyLive,
        provider: googleVerified ? 'Google Gemini TTS' : 'OpenAI TTS',
        note: 'Text-to-speech',
      },
      realtimeVoice: {
        available: config.toolsEnabled.voiceChat && anyLive,
        provider: googleVerified ? 'Google Gemini Live' : 'OpenAI Realtime',
        note: 'Realtime duplex voice',
      },
    },
  };
}

export function calculateProviderCostUsd(
  modelId: string,
  promptTokens: number,
  completionTokens: number,
  customRates?: { inputUsdPer1M?: number; outputUsdPer1M?: number }
): number {
  const fallback =
    GOOGLE_PRICING_USD_PER_1M[modelId] ||
    OPENAI_PRICING_USD_PER_1M[modelId] ||
    (modelId.startsWith('gemini-')
      ? GOOGLE_PRICING_USD_PER_1M['gemini-3.1-flash-lite']
      : OPENAI_PRICING_USD_PER_1M['gpt-4o-mini']);

  const inputRate =
    typeof customRates?.inputUsdPer1M === 'number' &&
    customRates.inputUsdPer1M > 0
      ? customRates.inputUsdPer1M
      : fallback.input;
  const outputRate =
    typeof customRates?.outputUsdPer1M === 'number' &&
    customRates.outputUsdPer1M > 0
      ? customRates.outputUsdPer1M
      : fallback.output;

  const inputCost = (promptTokens / 1_000_000) * inputRate;
  const outputCost = (completionTokens / 1_000_000) * outputRate;
  return Number((inputCost + outputCost).toFixed(6));
}

export function calculateInternalCreditCharge(
  baseCredits: number,
  per1kCredits: number,
  totalTokens: number
): number {
  const tokenComponent = Math.ceil((totalTokens / 1000) * per1kCredits);
  return Math.max(baseCredits, baseCredits + tokenComponent);
}

export interface StreamChatOptions {
  modelConfig: ModelConfigItem;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  prompt: string;
  webSearch: boolean;
  reasoningEffort?: 'low' | 'medium' | 'high';
  attachments?: Array<{
    name: string;
    mimeType: string;
    base64Data: string;
  }>;
  userFullName: string;
  onDelta: (delta: string) => void;
}

export interface StreamChatResult {
  fullText: string;
  citations: GroundingLink[];
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  providerUsed: AIProviderId;
  modelUsed: string;
  providerCostUsd: number;
}

function buildSystemInstruction(userFullName: string): string {
  return `You are QAAGA AGENT, an enterprise-grade AI assistant built with original QAAGA AGENT branding for ${userFullName}.
- Deliver accurate, structured Markdown answers with syntax-highlighted code blocks, tables, and clear reasoning.
- Fluently support English, Bengali (বাংলা), and Banglish.
- Maintain original QAAGA AGENT identity.`;
}

function resolveOfficialGoogleModel(requestedId: string): string {
  const clean = (requestedId || '').trim();
  if (ALLOWED_GOOGLE_TEXT_MODELS.has(clean)) {
    return clean;
  }
  if (
    clean.startsWith('gemini-') &&
    !/^gemini-(1\.5|2\.0|pro)/i.test(clean)
  ) {
    return clean;
  }
  return getDefaultServerGoogleModel();
}

function resolveOfficialOpenAIModel(requestedId: string): string {
  const clean = (requestedId || '').trim();
  if (clean === 'gpt-4o-mini-search-preview') return 'gpt-4o-mini';
  if (clean === 'gpt-4o-search-preview') return 'gpt-4o';

  const envModel = getValidatedModelEnv(process.env.OPENAI_MODEL);
  if (clean && envModel && clean === envModel) return clean;
  if (/^(gpt-|o1|o3|o4|chatgpt-)/i.test(clean)) {
    return clean;
  }
  return getDefaultServerOpenAIModel();
}

/**
 * Streams real assistant responses via Google Gemini (`@google/genai` SDK)
 * supporting multi-turn chat, multimodal Vision/PDF attachments, Google Search grounding,
 * and ThinkingLevel controls, with automatic Flash Lite resilience fallback.
 */
export async function streamGoogleGeminiChat(
  opts: StreamChatOptions
): Promise<StreamChatResult> {
  if (!isGoogleConfigured()) {
    throw createMissingProviderSecretError('google');
  }

  const ai = getGoogleGenAIClient();
  const systemInstruction = buildSystemInstruction(opts.userFullName);
  const targetModel = resolveOfficialGoogleModel(opts.modelConfig.id);

  const promptText =
    opts.prompt?.trim() ||
    'Analyze and summarize the attached document or image thoroughly.';

  const contents: Array<{
    role: 'user' | 'model';
    parts: Array<Record<string, unknown>>;
  }> = opts.history
    .slice(-16)
    .filter(
      (m) =>
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.trim().length > 0
    )
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const currentUserParts: Array<Record<string, unknown>> = [];
  if (opts.attachments && opts.attachments.length > 0) {
    for (const att of opts.attachments) {
      const mime = (att.mimeType || '').toLowerCase();
      if (mime.startsWith('image/')) {
        currentUserParts.push({
          inlineData: {
            mimeType: att.mimeType || 'image/png',
            data: att.base64Data,
          },
        });
      } else if (
        mime === 'application/pdf' ||
        att.name.toLowerCase().endsWith('.pdf')
      ) {
        currentUserParts.push({
          inlineData: {
            mimeType: 'application/pdf',
            data: att.base64Data,
          },
        });
      } else {
        const decodedText = Buffer.from(att.base64Data, 'base64')
          .toString('utf-8')
          .slice(0, 48_000);
        currentUserParts.push({
          text: `[Attached Document: ${att.name}]\n\`\`\`\n${decodedText}\n\`\`\``,
        });
      }
    }
  }
  currentUserParts.push({ text: promptText });
  contents.push({
    role: 'user',
    parts: currentUserParts,
  });

  let deltaEmitted = false;

  const executeSingleGoogleStream = async (modelToCall: string) => {
    const abortCtrl = new AbortController();
    const firstChunkTimeoutMs =
      modelToCall === 'gemini-3.1-flash-lite' ? 25_000 : 12_000;
    const firstChunkTimer = setTimeout(() => {
      abortCtrl.abort(new Error('first-token timeout'));
    }, firstChunkTimeoutMs);

    const thinkingLevel =
      opts.reasoningEffort === 'high'
        ? ThinkingLevel.HIGH
        : opts.reasoningEffort === 'medium'
        ? ThinkingLevel.MEDIUM
        : ThinkingLevel.LOW;

    const genConfig: Record<string, unknown> = {
      systemInstruction,
      thinkingConfig: { thinkingLevel },
      abortSignal: abortCtrl.signal,
    };

    if (opts.webSearch) {
      genConfig.tools = [{ googleSearch: {} }];
    }

    try {
      const responseStream = await ai.models.generateContentStream({
        model: modelToCall,
        contents,
        config: genConfig,
      });

      let fullText = '';
      let promptTokens = 0;
      let completionTokens = 0;
      const citationMap = new Map<string, GroundingLink>();

      for await (const chunk of responseStream) {
        clearTimeout(firstChunkTimer);
        const textDelta = chunk.text;
        if (typeof textDelta === 'string' && textDelta.length > 0) {
          deltaEmitted = true;
          fullText += textDelta;
          opts.onDelta(textDelta);
        }

        if (chunk.usageMetadata) {
          promptTokens =
            chunk.usageMetadata.promptTokenCount || promptTokens;
          completionTokens =
            chunk.usageMetadata.candidatesTokenCount || completionTokens;
        }

        const groundingChunks =
          chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (Array.isArray(groundingChunks)) {
          for (const gc of groundingChunks) {
            const uri = gc?.web?.uri;
            if (uri) {
              let fallbackTitle = uri;
              try {
                fallbackTitle = new URL(uri).hostname;
              } catch {
                // keep uri
              }
              citationMap.set(uri, {
                uri,
                title: gc?.web?.title || fallbackTitle,
              });
            }
          }
        }
      }

      clearTimeout(firstChunkTimer);
      return {
        fullText,
        citations: Array.from(citationMap.values()),
        promptTokens,
        completionTokens,
        modelUsed: modelToCall,
      };
    } finally {
      clearTimeout(firstChunkTimer);
    }
  };

  try {
    let outcome: {
      fullText: string;
      citations: GroundingLink[];
      promptTokens: number;
      completionTokens: number;
      modelUsed: string;
    };

    try {
      outcome = await executeSingleGoogleStream(targetModel);
    } catch (primaryErr: unknown) {
      const { status } = extractProviderErrorMeta(primaryErr);
      const canFallbackToLite =
        !deltaEmitted &&
        targetModel !== 'gemini-3.1-flash-lite' &&
        (status === 429 ||
          status === 403 ||
          status === 404 ||
          status === 502 ||
          status === 503 ||
          status === 504);

      if (canFallbackToLite) {
        outcome = await executeSingleGoogleStream('gemini-3.1-flash-lite');
      } else {
        throw primaryErr;
      }
    }

    const promptTokens =
      outcome.promptTokens > 0
        ? outcome.promptTokens
        : Math.ceil((promptText.length + 250) / 4);
    const completionTokens =
      outcome.completionTokens > 0
        ? outcome.completionTokens
        : Math.ceil(outcome.fullText.length / 4);
    const totalTokens = promptTokens + completionTokens;

    const providerCostUsd = calculateProviderCostUsd(
      outcome.modelUsed,
      promptTokens,
      completionTokens,
      outcome.modelUsed === opts.modelConfig.id
        ? {
            inputUsdPer1M: opts.modelConfig.inputUsdPer1M,
            outputUsdPer1M: opts.modelConfig.outputUsdPer1M,
          }
        : undefined
    );

    return {
      fullText: outcome.fullText,
      citations: outcome.citations,
      promptTokens,
      completionTokens,
      totalTokens,
      providerUsed: 'google',
      modelUsed: outcome.modelUsed,
      providerCostUsd,
    };
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === 'GOOGLE_SECRET_MISSING') {
      throw err;
    }
    throw formatGoogleError(err, 'Google Gemini Stream');
  }
}

/**
 * Multi-Provider Chat/Reasoning/Vision/PDF/Web-Search Router (Google Gemini + OpenAI).
 * Automatically routes to the selected provider and safely cross-falls back before first token
 * if one provider's key is missing or rate-limited while the other is configured.
 */
export async function streamChatCompletion(
  opts: StreamChatOptions
): Promise<StreamChatResult> {
  const wantsGoogle =
    opts.modelConfig.provider === 'google' ||
    opts.modelConfig.id.startsWith('gemini-') ||
    (!isOpenAIConfigured() && isGoogleConfigured());

  let anyDeltaEmitted = false;
  const wrappedOpts: StreamChatOptions = {
    ...opts,
    onDelta: (d) => {
      anyDeltaEmitted = true;
      opts.onDelta(d);
    },
  };

  if (wantsGoogle) {
    if (!isGoogleConfigured() && isOpenAIConfigured()) {
      return streamOpenAIResponsesChat({
        ...wrappedOpts,
        modelConfig: {
          ...opts.modelConfig,
          id: 'gpt-4o-mini',
          provider: 'openai',
        },
      });
    }
    try {
      return await streamGoogleGeminiChat(wrappedOpts);
    } catch (googleErr: unknown) {
      if (!anyDeltaEmitted && isOpenAIConfigured()) {
        try {
          return await streamOpenAIResponsesChat({
            ...wrappedOpts,
            modelConfig: {
              ...opts.modelConfig,
              id: 'gpt-4o-mini',
              provider: 'openai',
            },
          });
        } catch {
          // Throw original Google error if fallback also fails
        }
      }
      throw googleErr;
    }
  }

  if (!isOpenAIConfigured() && isGoogleConfigured()) {
    return streamGoogleGeminiChat({
      ...wrappedOpts,
      modelConfig: {
        ...opts.modelConfig,
        id: 'gemini-3.1-flash-lite',
        provider: 'google',
      },
    });
  }

  try {
    return await streamOpenAIResponsesChat(wrappedOpts);
  } catch (openAiErr: unknown) {
    if (!anyDeltaEmitted && isGoogleConfigured()) {
      try {
        return await streamGoogleGeminiChat({
          ...wrappedOpts,
          modelConfig: {
            ...opts.modelConfig,
            id: 'gemini-3.1-flash-lite',
            provider: 'google',
          },
        });
      } catch {
        // Throw original OpenAI error if fallback also fails
      }
    }
    throw openAiErr;
  }
}

/**
 * Streams real assistant responses via the official OpenAI Responses API (`openai.responses.create`)
 * with multi-turn conversation history, multimodal inputs, optional web_search_preview, and reasoning effort.
 */
export async function streamOpenAIResponsesChat(
  opts: StreamChatOptions
): Promise<StreamChatResult> {
  if (!isOpenAIConfigured()) {
    throw createMissingProviderSecretError('openai');
  }

  const openai = getOpenAIClient();
  const systemInstructions = buildSystemInstruction(opts.userFullName);

  const hasAttachments = Boolean(
    opts.attachments && opts.attachments.length > 0
  );
  const hasBinaryPdfOrImage = Boolean(
    opts.attachments?.some(
      (a) =>
        a.mimeType.startsWith('image/') || a.mimeType === 'application/pdf'
    )
  );

  let targetModel = resolveOfficialOpenAIModel(opts.modelConfig.id);
  if (hasBinaryPdfOrImage && targetModel === 'o3-mini') {
    targetModel = 'gpt-4o';
  }

  const isReasoningModel =
    targetModel === 'o3' ||
    targetModel.startsWith('o3-') ||
    targetModel.startsWith('o4-') ||
    targetModel === 'o1' ||
    targetModel.startsWith('gpt-5');

  const promptText =
    opts.prompt?.trim() ||
    'Analyze and summarize the attached document or image thoroughly.';

  const inputItems: Array<Record<string, unknown>> = opts.history
    .slice(-16)
    .filter(
      (m) =>
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.trim().length > 0
    )
    .map((m) => ({
      role: m.role,
      content: m.content,
    }));

  if (hasAttachments && opts.attachments) {
    const userContentParts: Array<Record<string, unknown>> = [];

    for (const att of opts.attachments) {
      const mime = (att.mimeType || '').toLowerCase();
      if (mime.startsWith('image/')) {
        userContentParts.push({
          type: 'input_image',
          image_url: `data:${att.mimeType};base64,${att.base64Data}`,
          detail: 'auto',
        });
      } else if (
        mime === 'application/pdf' ||
        att.name.toLowerCase().endsWith('.pdf')
      ) {
        userContentParts.push({
          type: 'input_file',
          filename: att.name || 'document.pdf',
          file_data: `data:application/pdf;base64,${att.base64Data}`,
        });
      } else {
        const decodedText = Buffer.from(att.base64Data, 'base64')
          .toString('utf-8')
          .slice(0, 48_000);
        userContentParts.push({
          type: 'input_text',
          text: `[Attached Document: ${att.name}]\n\`\`\`\n${decodedText}\n\`\`\``,
        });
      }
    }

    userContentParts.push({
      type: 'input_text',
      text: promptText,
    });

    inputItems.push({
      role: 'user',
      content: userContentParts,
    });
  } else {
    inputItems.push({
      role: 'user',
      content: promptText,
    });
  }

  const runResponsesStream = async (modelToCall: string) => {
    const requestPayload: Record<string, unknown> = {
      model: modelToCall,
      instructions: systemInstructions,
      input: inputItems,
      stream: true,
    };

    if (isReasoningModel) {
      requestPayload.reasoning = {
        effort: opts.reasoningEffort || 'low',
      };
    }

    if (opts.webSearch) {
      requestPayload.tools = [{ type: 'web_search_preview' }];
    }

    const stream = (await openai.responses.create(
      requestPayload as unknown as OpenAI.Responses.ResponseCreateParamsStreaming
    )) as AsyncIterable<OpenAI.Responses.ResponseStreamEvent>;

    let fullText = '';
    let promptTokens = 0;
    let completionTokens = 0;
    let resolvedModel = modelToCall;
    const citationMap = new Map<string, GroundingLink>();

    const recordCitation = (url?: string, title?: string) => {
      if (!url) return;
      let fallbackTitle = url;
      try {
        fallbackTitle = new URL(url).hostname;
      } catch {
        // keep raw URL
      }
      citationMap.set(url, {
        uri: url,
        title: title || fallbackTitle,
      });
    };

    for await (const event of stream) {
      if (
        event.type === 'response.output_text.delta' &&
        typeof event.delta === 'string' &&
        event.delta.length > 0
      ) {
        fullText += event.delta;
        opts.onDelta(event.delta);
      } else if (event.type === 'response.output_text.annotation.added') {
        const ann = (
          event as unknown as {
            annotation?: { type?: string; url?: string; title?: string };
          }
        ).annotation;
        if (ann?.url) {
          recordCitation(ann.url, ann.title);
        }
      } else if (event.type === 'response.completed') {
        const resp = event.response;
        if (resp?.model) {
          resolvedModel = resp.model;
        }
        if (resp?.usage) {
          promptTokens = resp.usage.input_tokens || 0;
          completionTokens = resp.usage.output_tokens || 0;
        }
        if (Array.isArray(resp?.output)) {
          for (const outItem of resp.output) {
            if (outItem.type === 'message' && Array.isArray(outItem.content)) {
              for (const part of outItem.content) {
                if (part.type === 'output_text') {
                  if (!fullText && part.text) {
                    fullText += part.text;
                    opts.onDelta(part.text);
                  }
                  if (Array.isArray(part.annotations)) {
                    for (const a of part.annotations) {
                      const cite = a as unknown as {
                        url?: string;
                        title?: string;
                      };
                      if (cite.url) {
                        recordCitation(cite.url, cite.title);
                      }
                    }
                  }
                }
              }
            }
          }
        }
      } else if (event.type === 'response.failed') {
        const failMsg =
          event.response?.error?.message ||
          'OpenAI Responses API reported a failed generation.';
        throw new Error(redactSecrets(failMsg));
      } else if (event.type === 'error') {
        const errEvt = event as unknown as { message?: string };
        throw new Error(
          redactSecrets(errEvt.message || 'OpenAI stream error event.')
        );
      }
    }

    return {
      fullText,
      citations: Array.from(citationMap.values()),
      promptTokens,
      completionTokens,
      modelUsed: resolvedModel,
    };
  };

  try {
    const outcome = await withOverloadRetry(
      () => runResponsesStream(targetModel),
      (e) => formatOpenAIError(e, 'OpenAI Responses Stream')
    );

    const promptTokens =
      outcome.promptTokens > 0
        ? outcome.promptTokens
        : Math.ceil((promptText.length + 250) / 4);
    const completionTokens =
      outcome.completionTokens > 0
        ? outcome.completionTokens
        : Math.ceil(outcome.fullText.length / 4);
    const totalTokens = promptTokens + completionTokens;

    const providerCostUsd = calculateProviderCostUsd(
      outcome.modelUsed,
      promptTokens,
      completionTokens,
      outcome.modelUsed === opts.modelConfig.id
        ? {
            inputUsdPer1M: opts.modelConfig.inputUsdPer1M,
            outputUsdPer1M: opts.modelConfig.outputUsdPer1M,
          }
        : undefined
    );

    return {
      fullText: outcome.fullText,
      citations: outcome.citations,
      promptTokens,
      completionTokens,
      totalTokens,
      providerUsed: 'openai',
      modelUsed: outcome.modelUsed,
      providerCostUsd,
    };
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === 'OPENAI_SECRET_MISSING') {
      throw err;
    }
    if (err instanceof Error && err.message.startsWith('OpenAI ')) {
      throw new Error(redactSecrets(err.message));
    }
    throw formatOpenAIError(err, 'OpenAI Responses API');
  }
}

async function generateGoogleImage(
  prompt: string,
  aspectRatio: '1:1' | '16:9' | '3:4'
): Promise<{
  imageDataUrl: string;
  revisedPrompt: string;
  providerUsed: AIProviderId;
  modelUsed: string;
  providerCostUsd: number;
}> {
  const ai = getGoogleGenAIClient();
  const response = await withOverloadRetry(
    () =>
      ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-image',
        contents: prompt,
        config: {
          imageConfig: { aspectRatio },
        },
      }),
    (e) => formatGoogleError(e, 'Google Gemini Image Generation')
  );

  let imageDataUrl = '';
  let revisedText = prompt;
  const parts = response.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      const mime = part.inlineData.mimeType || 'image/png';
      imageDataUrl = `data:${mime};base64,${part.inlineData.data}`;
    } else if (part.text && part.text.trim()) {
      revisedText = part.text.trim();
    }
  }

  if (!imageDataUrl) {
    throw new Error('Google Gemini Image API did not return image data.');
  }

  return {
    imageDataUrl,
    revisedPrompt: revisedText,
    providerUsed: 'google',
    modelUsed: 'gemini-3.1-flash-lite-image',
    providerCostUsd: 0.03,
  };
}

async function generateOpenAIImage(
  prompt: string,
  aspectRatio: '1:1' | '16:9' | '3:4'
): Promise<{
  imageDataUrl: string;
  revisedPrompt: string;
  providerUsed: AIProviderId;
  modelUsed: string;
  providerCostUsd: number;
}> {
  const openai = getOpenAIClient();
  const size =
    aspectRatio === '16:9'
      ? '1792x1024'
      : aspectRatio === '3:4'
      ? '1024x1792'
      : '1024x1024';

  const response = await withOverloadRetry(
    () =>
      openai.images.generate({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size,
        response_format: 'b64_json',
      }),
    (e) => formatOpenAIError(e, 'OpenAI Image Generation')
  );

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error('OpenAI Images API did not return image data.');
  }

  return {
    imageDataUrl: `data:image/png;base64,${b64}`,
    revisedPrompt: response.data?.[0]?.revised_prompt || prompt,
    providerUsed: 'openai',
    modelUsed: 'dall-e-3',
    providerCostUsd: size === '1024x1024' ? 0.04 : 0.08,
  };
}

/**
 * Multi-Provider Image Generation (`gemini-3.1-flash-lite-image` & `dall-e-3`)
 * with automatic cross-provider fallback on quota/tier restrictions.
 */
export async function generateImageAsset(
  prompt: string,
  aspectRatio: '1:1' | '16:9' | '3:4',
  preferredProvider?: AIProviderId
): Promise<{
  imageDataUrl: string;
  revisedPrompt: string;
  providerUsed: AIProviderId;
  modelUsed: string;
  providerCostUsd: number;
}> {
  const tryOpenAIFirst =
    preferredProvider === 'openai' ||
    (preferredProvider !== 'google' && isOpenAIConfigured());

  if (tryOpenAIFirst && isOpenAIConfigured()) {
    try {
      return await generateOpenAIImage(prompt, aspectRatio);
    } catch (openAiErr: unknown) {
      if (isGoogleConfigured()) {
        try {
          return await generateGoogleImage(prompt, aspectRatio);
        } catch {
          // Keep primary error if fallback also fails
        }
      }
      throw openAiErr;
    }
  }

  if (isGoogleConfigured()) {
    try {
      return await generateGoogleImage(prompt, aspectRatio);
    } catch (googleErr: unknown) {
      if (isOpenAIConfigured()) {
        try {
          return await generateOpenAIImage(prompt, aspectRatio);
        } catch {
          // Keep Google error if OpenAI also fails
        }
      }
      throw googleErr;
    }
  }

  throw createMissingProviderSecretError('google');
}

async function transcribeWithGoogle(
  base64Audio: string,
  mimeType: string
): Promise<{
  transcript: string;
  providerUsed: AIProviderId;
  modelUsed: string;
  providerCostUsd: number;
}> {
  const ai = getGoogleGenAIClient();
  const response = await withOverloadRetry(
    () =>
      ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: [
          {
            inlineData: {
              mimeType: mimeType || 'audio/webm',
              data: base64Audio,
            },
          },
          'Transcribe this audio accurately in its original spoken language (such as English or Bengali). Return only the spoken transcript text with no extra commentary.',
        ],
      }),
    (e) => formatGoogleError(e, 'Google Gemini Speech-to-Text')
  );

  const transcript = (response.text || '').trim();
  const promptTok = response.usageMetadata?.promptTokenCount || 300;
  const outTok = response.usageMetadata?.candidatesTokenCount || 60;
  const costUsd = Number(
    ((promptTok / 1_000_000) * 0.15 + (outTok / 1_000_000) * 0.6).toFixed(6)
  );

  return {
    transcript,
    providerUsed: 'google',
    modelUsed: 'gemini-3.5-transcribe',
    providerCostUsd: costUsd,
  };
}

async function transcribeWithOpenAI(
  base64Audio: string,
  mimeType: string
): Promise<{
  transcript: string;
  providerUsed: AIProviderId;
  modelUsed: string;
  providerCostUsd: number;
}> {
  const openai = getOpenAIClient();
  const buffer = Buffer.from(base64Audio, 'base64');
  const lowerMime = (mimeType || 'audio/webm').toLowerCase();
  const ext = lowerMime.includes('wav')
    ? 'wav'
    : lowerMime.includes('mp3') || lowerMime.includes('mpeg')
    ? 'mp3'
    : lowerMime.includes('mp4') || lowerMime.includes('m4a')
    ? 'm4a'
    : lowerMime.includes('ogg')
    ? 'ogg'
    : 'webm';

  const runOpenAIStt = async (
    sttModel: 'gpt-4o-mini-transcribe' | 'whisper-1'
  ) => {
    const file = await OpenAI.toFile(buffer, `speech.${ext}`, {
      type: mimeType || `audio/${ext}`,
    });
    const result = await openai.audio.transcriptions.create({
      model: sttModel,
      file,
    });
    return { text: result.text.trim(), modelUsed: sttModel };
  };

  let out: { text: string; modelUsed: string };
  try {
    out = await withOverloadRetry(
      () => runOpenAIStt('gpt-4o-mini-transcribe'),
      (e) => formatOpenAIError(e, 'OpenAI Speech-to-Text')
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (/404|model_not_found|not unlocked/i.test(msg)) {
      out = await withOverloadRetry(
        () => runOpenAIStt('whisper-1'),
        (e) => formatOpenAIError(e, 'OpenAI Whisper STT')
      );
    } else {
      throw err;
    }
  }

  const estimatedMinutes = Math.max(0.1, buffer.byteLength / (960 * 1024));
  const ratePerMin =
    out.modelUsed === 'gpt-4o-mini-transcribe' ? 0.003 : 0.006;

  return {
    transcript: out.text,
    providerUsed: 'openai',
    modelUsed: out.modelUsed,
    providerCostUsd: Number((estimatedMinutes * ratePerMin).toFixed(6)),
  };
}

/**
 * Multi-Provider Speech-to-Text (`gemini-3.5-transcribe` & `gpt-4o-mini-transcribe` / `whisper-1`).
 */
export async function transcribeAudioBuffer(
  base64Audio: string,
  mimeType: string,
  preferredProvider?: AIProviderId
): Promise<{
  transcript: string;
  providerUsed: AIProviderId;
  modelUsed: string;
  providerCostUsd: number;
}> {
  const preferGoogle =
    preferredProvider === 'google' ||
    (preferredProvider !== 'openai' && isGoogleConfigured());

  if (preferGoogle && isGoogleConfigured()) {
    try {
      return await transcribeWithGoogle(base64Audio, mimeType);
    } catch (googleErr: unknown) {
      if (isOpenAIConfigured()) {
        return transcribeWithOpenAI(base64Audio, mimeType);
      }
      throw googleErr;
    }
  }

  if (isOpenAIConfigured()) {
    try {
      return await transcribeWithOpenAI(base64Audio, mimeType);
    } catch (openAiErr: unknown) {
      if (isGoogleConfigured()) {
        return transcribeWithGoogle(base64Audio, mimeType);
      }
      throw openAiErr;
    }
  }

  throw createMissingProviderSecretError('google');
}

function wrapRawPcm24kAsWav(pcmBuffer: Buffer, sampleRate = 24000): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

async function synthesizeWithGoogle(
  cleanText: string,
  voice: string
): Promise<{
  audioDataUrl: string;
  providerUsed: AIProviderId;
  modelUsed: string;
  providerCostUsd: number;
}> {
  const ai = getGoogleGenAIClient();
  const voiceMap: Record<string, string> = {
    alloy: 'Kore',
    nova: 'Zephyr',
    echo: 'Puck',
    onyx: 'Charon',
    shimmer: 'Fenrir',
    fable: 'Aoede',
  };
  const googleVoice =
    voiceMap[voice.toLowerCase()] ||
    (['Kore', 'Zephyr', 'Puck', 'Charon', 'Fenrir', 'Aoede'].includes(voice)
      ? voice
      : 'Kore');

  const response = await withOverloadRetry(
    () =>
      ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [{ parts: [{ text: cleanText || 'Hello from QAAGA AGENT.' }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: googleVoice },
            },
          },
        },
      }),
    (e) => formatGoogleError(e, 'Google Gemini Text-to-Speech')
  );

  const inline = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!inline?.data) {
    throw new Error('Google Gemini TTS did not return audio data.');
  }

  const rawMime = (inline.mimeType || 'audio/wav').toLowerCase();
  let audioDataUrl: string;
  if (rawMime.includes('pcm') || rawMime.includes('l16')) {
    const wavBuf = wrapRawPcm24kAsWav(Buffer.from(inline.data, 'base64'), 24000);
    audioDataUrl = `data:audio/wav;base64,${wavBuf.toString('base64')}`;
  } else {
    audioDataUrl = `data:${inline.mimeType || 'audio/wav'};base64,${inline.data}`;
  }

  const providerCostUsd = Number(((cleanText.length / 1000) * 0.008).toFixed(6));
  return {
    audioDataUrl,
    providerUsed: 'google',
    modelUsed: 'gemini-3.8-flash-lite-tts',
    providerCostUsd,
  };
}

async function synthesizeWithOpenAI(
  cleanText: string,
  voice: string
): Promise<{
  audioDataUrl: string;
  providerUsed: AIProviderId;
  modelUsed: string;
  providerCostUsd: number;
}> {
  const openai = getOpenAIClient();
  const validVoice = (
    [
      'alloy',
      'echo',
      'fable',
      'onyx',
      'nova',
      'shimmer',
      'ash',
      'coral',
      'sage',
    ].includes(voice)
      ? voice
      : 'alloy'
  ) as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

  const mp3Response = await withOverloadRetry(
    () =>
      openai.audio.speech.create({
        model: 'tts-1',
        voice: validVoice,
        input: cleanText || 'Hello from QAAGA AGENT.',
      }),
    (e) => formatOpenAIError(e, 'OpenAI Text-to-Speech')
  );

  const buffer = Buffer.from(await mp3Response.arrayBuffer());
  const providerCostUsd = Number(((cleanText.length / 1000) * 0.015).toFixed(6));

  return {
    audioDataUrl: `data:audio/mpeg;base64,${buffer.toString('base64')}`,
    providerUsed: 'openai',
    modelUsed: 'tts-1',
    providerCostUsd,
  };
}

/**
 * Multi-Provider Text-to-Speech (`gemini-3.8-flash-lite-tts` & `tts-1`).
 */
export async function synthesizeSpeechAudio(
  text: string,
  voice: string,
  preferredProvider?: AIProviderId
): Promise<{
  audioDataUrl: string;
  providerUsed: AIProviderId;
  modelUsed: string;
  providerCostUsd: number;
}> {
  const cleanText = text
    .replace(/```[\s\S]*?```/g, 'Code block omitted.')
    .replace(/[#*_`>|]/g, '')
    .trim()
    .slice(0, 1800);

  const preferGoogle =
    preferredProvider === 'google' ||
    (preferredProvider !== 'openai' && isGoogleConfigured());

  if (preferGoogle && isGoogleConfigured()) {
    try {
      return await synthesizeWithGoogle(cleanText, voice);
    } catch (googleErr: unknown) {
      if (isOpenAIConfigured()) {
        return synthesizeWithOpenAI(cleanText, voice);
      }
      throw googleErr;
    }
  }

  if (isOpenAIConfigured()) {
    try {
      return await synthesizeWithOpenAI(cleanText, voice);
    } catch (openAiErr: unknown) {
      if (isGoogleConfigured()) {
        return synthesizeWithGoogle(cleanText, voice);
      }
      throw openAiErr;
    }
  }

  throw createMissingProviderSecretError('google');
}

/**
 * Live Server-Side Google Gemini Connection Diagnostic.
 */
export async function testGoogleConnection(): Promise<{
  ok: boolean;
  keyPresent: boolean;
  keyLength: number;
  status: number | null;
  errorCode: string | null;
  message: string;
  latencyMs: number;
  availableTargetModels: string[];
  categorizedModels: GoogleAccountDiscoveryDTO['categorizedModels'];
}> {
  const startedAt = Date.now();
  const rawKey = getServerGoogleKey();
  const keyPresent = isGoogleConfigured();

  const { discovery } = await discoverGoogleAccountModels(true);
  if (!discovery.reachable) {
    return {
      ok: false,
      keyPresent,
      keyLength: rawKey ? rawKey.length : 0,
      status: discovery.status,
      errorCode: discovery.errorCode,
      message: discovery.message,
      latencyMs: Date.now() - startedAt,
      availableTargetModels: [],
      categorizedModels: discovery.categorizedModels,
    };
  }

  const allTarget = [
    ...discovery.categorizedModels.economical,
    ...discovery.categorizedModels.standard,
    ...discovery.categorizedModels.reasoning,
    ...discovery.categorizedModels.image,
    ...discovery.categorizedModels.audio,
    ...discovery.categorizedModels.realtime,
  ];

  return {
    ok: true,
    keyPresent: true,
    keyLength: rawKey.length,
    status: 200,
    errorCode: null,
    message: discovery.message,
    latencyMs: Date.now() - startedAt,
    availableTargetModels: allTarget,
    categorizedModels: discovery.categorizedModels,
  };
}

/**
 * Live Server-Side OpenAI Connection & Account Model Discovery Diagnostic.
 */
export async function testOpenAIConnection(): Promise<{
  ok: boolean;
  keyPresent: boolean;
  keyLength: number;
  status: number | null;
  errorCode: string | null;
  message: string;
  latencyMs: number;
  availableTargetModels: string[];
  categorizedModels: OpenAIAccountDiscoveryDTO['categorizedModels'];
  apiNote: string;
}> {
  const startedAt = Date.now();
  const rawKey = getServerOpenAIKey();
  const keyPresent = isOpenAIConfigured();
  const apiNote =
    'OpenAI API models are unlocked based on your platform.openai.com API billing tier (independent of ChatGPT Plus/Pro web subscriptions).';

  const { discovery } = await discoverOpenAIAccountModels(true);

  if (!discovery.reachable) {
    return {
      ok: false,
      keyPresent,
      keyLength: rawKey ? rawKey.length : 0,
      status: discovery.status,
      errorCode: discovery.errorCode,
      message: discovery.message,
      latencyMs: Date.now() - startedAt,
      availableTargetModels: [],
      categorizedModels: discovery.categorizedModels,
      apiNote,
    };
  }

  try {
    const openai = getOpenAIClient();
    const envModel = getValidatedModelEnv(process.env.OPENAI_MODEL);
    const pingModel =
      (envModel && /^(gpt-|o1|o3|o4|chatgpt-)/i.test(envModel)
        ? envModel
        : '') ||
      discovery.categorizedModels.economical[0] ||
      discovery.categorizedModels.standard[0] ||
      'gpt-4o-mini';

    const ping = await openai.responses.create(
      {
        model: pingModel,
        input: 'Reply with OK',
        max_output_tokens: 16,
      },
      { timeout: 8_000 }
    );
    const reply = (ping.output_text || 'OK').trim();

    const allTarget = [
      ...discovery.categorizedModels.reasoning,
      ...discovery.categorizedModels.standard,
      ...discovery.categorizedModels.economical,
      ...discovery.categorizedModels.image,
      ...discovery.categorizedModels.audio,
      ...discovery.categorizedModels.realtime,
      ...discovery.categorizedModels.search,
    ];

    return {
      ok: true,
      keyPresent: true,
      keyLength: rawKey.length,
      status: 200,
      errorCode: null,
      message: `Connected to official OpenAI Responses API (${discovery.totalModelsCount} total models accessible; ping "${reply}" via ${pingModel}).`,
      latencyMs: Date.now() - startedAt,
      availableTargetModels: allTarget,
      categorizedModels: discovery.categorizedModels,
      apiNote,
    };
  } catch (err: unknown) {
    const { status, errorCode } = extractProviderErrorMeta(err);
    const formatted = formatOpenAIError(err, 'OpenAI Live Completion Ping');
    return {
      ok: false,
      keyPresent: true,
      keyLength: rawKey.length,
      status,
      errorCode,
      message: formatted.message,
      latencyMs: Date.now() - startedAt,
      availableTargetModels: [],
      categorizedModels: discovery.categorizedModels,
      apiNote,
    };
  }
}

export async function testAllProvidersConnection(): Promise<ProviderDiagnosticsDTO> {
  const [googleDiag, openaiDiag] = await Promise.all([
    testGoogleConnection(),
    testOpenAIConnection(),
  ]);

  return {
    google: {
      ok: googleDiag.ok,
      keyPresent: googleDiag.keyPresent,
      status: googleDiag.status,
      errorCode: googleDiag.errorCode,
      message: googleDiag.message,
      latencyMs: googleDiag.latencyMs,
      availableTargetModels: googleDiag.availableTargetModels,
      categorizedModels: googleDiag.categorizedModels,
      apiNote:
        'Google Gemini models run strictly server-side via @google/genai SDK.',
    },
    openai: {
      ok: openaiDiag.ok,
      keyPresent: openaiDiag.keyPresent,
      status: openaiDiag.status,
      errorCode: openaiDiag.errorCode,
      message: openaiDiag.message,
      latencyMs: openaiDiag.latencyMs,
      availableTargetModels: openaiDiag.availableTargetModels,
      categorizedModels: openaiDiag.categorizedModels,
      apiNote: openaiDiag.apiNote,
    },
  };
}
