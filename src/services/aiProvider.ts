import OpenAI from 'openai';
import {
  GoogleGenAI,
  GenerateContentResponse,
  LiveServerMessage,
  Modality,
  ThinkingLevel,
} from '@google/genai';
import type {
  GroundingLink,
  ModelConfigItem,
  OpenAIAccountDiscoveryDTO,
  PlatformConfigDTO,
  ProviderCapabilitiesDTO,
  ProviderDiagnosticsDTO,
} from '../types/qaaga.ts';

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

// Google Gemini Standard API Pricing Estimate (USD per 1M tokens) — tracked separately from OpenAI USD
export const GEMINI_PRICING_USD_PER_1M: Record<
  string,
  { input: number; output: number }
> = {
  'gemini-3.8-flash': { input: 0.15, output: 0.6 },
  'gemini-flash-latest': { input: 0.15, output: 0.6 },
  'gemini-3.1-flash-lite': { input: 0.075, output: 0.3 },
  'gemini-3.5-transcribe': { input: 0.1, output: 0.4 },
  'gemini-3.8-flash-lite-tts': { input: 0.1, output: 0.4 },
  'gemini-3.8-live': { input: 0.35, output: 1.5 },
};

const PLACEHOLDER_KEYS = new Set([
  'MY_OPENAI_API_KEY',
  'YOUR_OPENAI_API_KEY',
  'REPLACE_WITH_OPENAI_API_KEY',
  'MY_GEMINI_API_KEY',
  'YOUR_GEMINI_API_KEY',
]);

function getServerOpenAIKey(): string {
  return (process.env.OPENAI_API_KEY || '').trim();
}

function getServerGeminiKey(): string {
  return (process.env.GEMINI_API_KEY || '').trim();
}

/**
 * Redacts any API key or token pattern so secret fragments are NEVER exposed
 * in logs, audit entries, SSE frames, WebSocket events, or HTTP responses.
 */
export function redactSecrets(input: string): string {
  const openAiKey = getServerOpenAIKey();
  const geminiKey = getServerGeminiKey();
  let sanitized = input || '';
  if (openAiKey && openAiKey.length >= 4) {
    sanitized = sanitized.split(openAiKey).join('[REDACTED]');
  }
  if (geminiKey && geminiKey.length >= 4) {
    sanitized = sanitized.split(geminiKey).join('[REDACTED]');
  }
  return sanitized
    .replace(/sk-[A-Za-z0-9._*-]{2,}/g, '[REDACTED_OPENAI_KEY]')
    .replace(/AIza[A-Za-z0-9_-]{8,}/g, '[REDACTED_GEMINI_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]');
}

export function isOpenAIConfigured(): boolean {
  const key = getServerOpenAIKey();
  return Boolean(key && !PLACEHOLDER_KEYS.has(key));
}

export function isGeminiConfigured(): boolean {
  const key = getServerGeminiKey();
  return Boolean(key && !PLACEHOLDER_KEYS.has(key));
}

export function getOpenAIRealtimeAuthHeaders(): Record<string, string> {
  const apiKey = getServerOpenAIKey();
  if (!apiKey || PLACEHOLDER_KEYS.has(apiKey)) {
    throw new Error(
      'OPENAI_API_KEY is not configured on the server. Add it in Settings > Secrets.'
    );
  }
  return {
    Authorization: `Bearer ${apiKey}`,
    'OpenAI-Beta': 'realtime=v1',
  };
}

let cachedOpenAIClient: { key: string; client: OpenAI } | null = null;
let cachedGeminiClient: { key: string; client: GoogleGenAI } | null = null;

function getOpenAIClient(): OpenAI {
  const apiKey = getServerOpenAIKey();
  if (!apiKey || PLACEHOLDER_KEYS.has(apiKey)) {
    throw new Error(
      'OpenAI API key is not configured on the server. Add a valid OPENAI_API_KEY in Settings > Secrets.'
    );
  }
  if (cachedOpenAIClient && cachedOpenAIClient.key === apiKey) {
    return cachedOpenAIClient.client;
  }
  const client = new OpenAI({ apiKey });
  cachedOpenAIClient = { key: apiKey, client };
  return client;
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = getServerGeminiKey();
  if (!apiKey || PLACEHOLDER_KEYS.has(apiKey)) {
    throw new Error(
      'Google Gemini API key is not configured on the server. Check GEMINI_API_KEY in Settings > Secrets.'
    );
  }
  if (cachedGeminiClient && cachedGeminiClient.key === apiKey) {
    return cachedGeminiClient.client;
  }
  const client = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
  cachedGeminiClient = { key: apiKey, client };
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
      : String(err || 'Unknown provider error'));

  // Unwrap JSON-formatted SDK error payloads such as {"error":{"code":503,"message":"...","status":"UNAVAILABLE"}}
  const trimmed = rawMsg.trim();
  if (trimmed.startsWith('{') || trimmed.includes('"error":{')) {
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

  if (
    !status &&
    ((err as { name?: string })?.name === 'AbortError' ||
      /aborted|first-token timeout/i.test(rawMsg))
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

function formatOpenAIError(err: unknown, contextLabel: string): Error {
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

function formatGeminiError(err: unknown, contextLabel: string): Error {
  const { status, safeMessage } = extractProviderErrorMeta(err);
  if (status === 401 || status === 403) {
    return new Error(
      `${contextLabel} failed (Gemini HTTP ${status}): Check GEMINI_API_KEY permissions in Settings > Secrets. Any reserved credits were refunded.`
    );
  }
  if (status === 429) {
    return new Error(
      `${contextLabel} rate-limited by Google Gemini (HTTP 429): Please retry shortly. Any reserved credits were refunded.`
    );
  }
  if (status === 503 || status === 502 || status === 504) {
    return new Error(
      `${contextLabel} temporarily overloaded (HTTP ${status}): ${safeMessage}`
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
// DYNAMIC OPENAI ACCOUNT MODEL DISCOVERY (Cached 60s to avoid per-request latency)
// ============================================================================
let cachedDiscovery: {
  keyFingerprint: string;
  expiresAt: number;
  data: OpenAIAccountDiscoveryDTO;
  rawModelIds: Set<string>;
} | null = null;

let discoveryInFlight: Promise<{
  discovery: OpenAIAccountDiscoveryDTO;
  rawModelIds: Set<string>;
}> | null = null;

function fingerprintKey(k: string): string {
  if (!k) return 'none';
  return `${k.length}:${k.charCodeAt(0)}:${k.charCodeAt(k.length - 1)}`;
}

function emptyCategorizedModels(): OpenAIAccountDiscoveryDTO['categorizedModels'] {
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

async function refreshOpenAIDiscoveryNow(
  rawKey: string,
  fp: string
): Promise<{
  discovery: OpenAIAccountDiscoveryDTO;
  rawModelIds: Set<string>;
}> {
  if (!rawKey || PLACEHOLDER_KEYS.has(rawKey)) {
    const empty: OpenAIAccountDiscoveryDTO = {
      checkedAt: new Date().toISOString(),
      keyPresent: false,
      reachable: false,
      status: null,
      errorCode: 'missing_api_key',
      message:
        'OPENAI_API_KEY is not set in server environment variables. Configure it in Settings > Secrets to unlock OpenAI models.',
      totalModelsCount: 0,
      categorizedModels: emptyCategorizedModels(),
    };
    cachedDiscovery = {
      keyFingerprint: fp,
      expiresAt: Date.now() + 300_000,
      data: empty,
      rawModelIds: new Set(),
    };
    return { discovery: empty, rawModelIds: new Set() };
  }

  try {
    const openai = getOpenAIClient();
    const list = await openai.models.list();
    const ids = list.data.map((m) => m.id).sort();
    const rawSet = new Set(ids);

    const pick = (candidates: string[]) =>
      candidates.filter((id) => rawSet.has(id));

    const categorized: OpenAIAccountDiscoveryDTO['categorizedModels'] = {
      reasoning: pick(['o3', 'o4-mini', 'o3-mini', 'o1', 'o1-pro', 'o1-mini']),
      standard: pick(['gpt-4.1', 'gpt-4o', 'gpt-4.5-preview', 'chatgpt-4o-latest']),
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

    cachedDiscovery = {
      keyFingerprint: fp,
      expiresAt: Date.now() + 300_000,
      data,
      rawModelIds: rawSet,
    };
    return { discovery: data, rawModelIds: rawSet };
  } catch (err: unknown) {
    const { status, errorCode } = extractProviderErrorMeta(err);
    const formatted = formatOpenAIError(err, 'OpenAI Account Discovery');
    const failed: OpenAIAccountDiscoveryDTO = {
      checkedAt: new Date().toISOString(),
      keyPresent: true,
      reachable: false,
      status,
      errorCode,
      message: formatted.message,
      totalModelsCount: 0,
      categorizedModels: emptyCategorizedModels(),
    };
    cachedDiscovery = {
      keyFingerprint: fp,
      expiresAt: Date.now() + 180_000,
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
    cachedDiscovery &&
    cachedDiscovery.keyFingerprint === fp &&
    cachedDiscovery.expiresAt > Date.now()
  ) {
    return {
      discovery: cachedDiscovery.data,
      rawModelIds: cachedDiscovery.rawModelIds,
    };
  }

  // Stale-while-revalidate: never block user chat/commands when key hasn't changed
  if (
    !forceRefresh &&
    cachedDiscovery &&
    cachedDiscovery.keyFingerprint === fp
  ) {
    if (!discoveryInFlight) {
      discoveryInFlight = refreshOpenAIDiscoveryNow(rawKey, fp).finally(() => {
        discoveryInFlight = null;
      });
    }
    return {
      discovery: cachedDiscovery.data,
      rawModelIds: cachedDiscovery.rawModelIds,
    };
  }

  if (!discoveryInFlight || forceRefresh) {
    discoveryInFlight = refreshOpenAIDiscoveryNow(rawKey, fp).finally(() => {
      discoveryInFlight = null;
    });
  }
  return discoveryInFlight;
}

/**
 * Enriches configured models with live provider availability so the Model Selector
 * shows ONLY supported and currently accessible models to end users, while allowing
 * Administrators to inspect and configure all OpenAI & Gemini models.
 */
export async function enrichConfigWithLiveAvailability(
  config: PlatformConfigDTO,
  forceRefresh = false
): Promise<{
  enrichedConfig: PlatformConfigDTO;
  capabilities: ProviderCapabilitiesDTO;
}> {
  const { discovery, rawModelIds } = await discoverOpenAIAccountModels(
    forceRefresh
  );
  const geminiReady = isGeminiConfigured();
  const openaiLive = discovery.reachable;

  const enrichedModels: ModelConfigItem[] = config.models.map((m) => {
    const normalizedProvider: 'openai' | 'gemini' =
      m.provider === 'gemini' || m.provider === 'bridge' ? 'gemini' : 'openai';

    const inferredTier =
      m.tier ||
      (normalizedProvider === 'gemini'
        ? 'gemini'
        : m.category === 'reasoning' ||
          m.id.startsWith('o3') ||
          m.id.startsWith('o4') ||
          m.id.startsWith('o1')
        ? 'openai-reasoning'
        : m.id.includes('mini') || m.id.includes('nano')
        ? 'openai-economical'
        : 'openai-standard');

    if (normalizedProvider === 'gemini') {
      return {
        ...m,
        provider: 'gemini',
        tier: 'gemini',
        available: geminiReady,
        availabilityNote: geminiReady
          ? 'Live via Google Gemini API (Server-Side)'
          : 'GEMINI_API_KEY not configured in Settings > Secrets',
      };
    }

    // OpenAI model: check live account access
    const modelUnlocked = openaiLive && rawModelIds.has(m.id);
    let availabilityNote = 'Verified accessible on OpenAI API account';
    if (!discovery.keyPresent) {
      availabilityNote = 'OPENAI_API_KEY not set in Settings > Secrets';
    } else if (!openaiLive) {
      availabilityNote = `OpenAI API unreachable (${
        discovery.status ? `HTTP ${discovery.status}` : discovery.errorCode || 'auth error'
      })`;
    } else if (!modelUnlocked) {
      availabilityNote =
        'Not unlocked on this OpenAI API account tier (API tiers are separate from ChatGPT Pro subscriptions)';
    }

    return {
      ...m,
      provider: 'openai',
      tier: inferredTier,
      available: modelUnlocked,
      availabilityNote,
    };
  });

  const anyChatReady = openaiLive || geminiReady;
  const openaiImageReady =
    openaiLive &&
    (rawModelIds.has('dall-e-3') || rawModelIds.has('gpt-image-1'));
  const openaiRealtimeReady =
    openaiLive &&
    (rawModelIds.has('gpt-4o-realtime-preview') ||
      rawModelIds.has('gpt-4o-mini-realtime-preview'));
  const openaiReasoningReady =
    openaiLive && discovery.categorizedModels.reasoning.length > 0;

  const activeMode: ProviderCapabilitiesDTO['activeMode'] =
    openaiLive && geminiReady
      ? 'multi-provider-live'
      : openaiLive
      ? 'openai-live'
      : geminiReady
      ? 'gemini-live'
      : 'demo-simulation';

  const capabilities: ProviderCapabilitiesDTO = {
    openaiConfigured: discovery.keyPresent,
    openaiLiveVerified: openaiLive,
    geminiConfigured: geminiReady,
    geminiBridgeConfigured: geminiReady,
    activeMode,
    openaiDiscovery: discovery,
    features: {
      chatStreaming: {
        available: anyChatReady,
        provider:
          openaiLive && geminiReady
            ? 'OpenAI Official API + Google Gemini API'
            : openaiLive
            ? 'OpenAI Official API (Streaming)'
            : geminiReady
            ? 'Google Gemini API (gemini-3.8-flash / gemini-3.1-flash-lite)'
            : 'Unconfigured',
        note:
          openaiLive && geminiReady
            ? 'Multi-provider streaming active with strict provider isolation'
            : geminiReady && !openaiLive
            ? `Google Gemini live; OpenAI requires valid OPENAI_API_KEY (${
                discovery.status ? `HTTP ${discovery.status}` : 'not verified'
              })`
            : 'Server-side AI streaming',
      },
      reasoning: {
        available: openaiReasoningReady || geminiReady,
        provider: openaiReasoningReady
          ? `OpenAI Reasoning (${discovery.categorizedModels.reasoning.join(', ')}) + Gemini Thinking`
          : geminiReady
          ? 'Google Gemini Thinking (gemini-3.8-flash)'
          : 'Unconfigured',
        note: openaiReasoningReady
          ? 'OpenAI o-series reasoning models verified on API account'
          : 'OpenAI o-series unlocks when a valid OPENAI_API_KEY with tier access is configured; Gemini Thinking is active',
      },
      imageGeneration: {
        available: config.toolsEnabled.imageGeneration && openaiImageReady,
        provider: openaiImageReady
          ? 'OpenAI Official Images API (dall-e-3 / gpt-image-1)'
          : 'Requires Valid OpenAI API Key (dall-e-3)',
        note: !config.toolsEnabled.imageGeneration
          ? 'Disabled by administrator'
          : openaiImageReady
          ? 'Official OpenAI image synthesis active'
          : 'Configure a valid OPENAI_API_KEY in Settings > Secrets to enable DALL-E 3 image generation',
      },
      imageAnalysis: {
        available: config.toolsEnabled.imageAnalysis && anyChatReady,
        provider:
          openaiLive && geminiReady
            ? 'OpenAI Vision + Gemini Multimodal'
            : openaiLive
            ? 'OpenAI Vision (gpt-4o / gpt-4.1)'
            : geminiReady
            ? 'Google Gemini Multimodal Vision (gemini-3.8-flash)'
            : 'Unconfigured',
        note: 'Supports PNG, JPEG, WEBP inspection on selected provider',
      },
      pdfAnalysis: {
        available: config.toolsEnabled.pdfAnalysis && anyChatReady,
        provider:
          openaiLive && geminiReady
            ? 'OpenAI Native PDF + Gemini Document Intelligence'
            : openaiLive
            ? 'OpenAI Native PDF Input'
            : geminiReady
            ? 'Google Gemini Native PDF & Document Analysis'
            : 'Unconfigured',
        note: 'Supports native PDF files, TXT, CSV, Markdown & JSON Q&A',
      },
      webSearch: {
        available: config.toolsEnabled.webSearch && anyChatReady,
        provider:
          openaiLive && geminiReady
            ? 'OpenAI Web Search + Google Search Grounding'
            : openaiLive
            ? 'OpenAI Search (gpt-4o-search-preview)'
            : geminiReady
            ? 'Google Search Grounding (gemini-3.8-flash)'
            : 'Unconfigured',
        note: 'Live grounded web search with cited source URLs',
      },
      speechToText: {
        available: config.toolsEnabled.voiceChat && anyChatReady,
        provider:
          openaiLive && geminiReady
            ? 'OpenAI Audio Transcribe + Gemini 3.5 Transcribe'
            : openaiLive
            ? 'OpenAI Audio (gpt-4o-mini-transcribe / whisper-1)'
            : geminiReady
            ? 'Google Gemini Audio (gemini-3.5-transcribe)'
            : 'Unconfigured',
        note: 'Supports English & Bengali microphone dictation',
      },
      textToSpeech: {
        available: config.toolsEnabled.voiceChat && anyChatReady,
        provider:
          openaiLive && geminiReady
            ? 'OpenAI Neural TTS + Gemini 3.8 Flash Lite TTS'
            : openaiLive
            ? 'OpenAI Audio Speech (tts-1)'
            : geminiReady
            ? 'Google Gemini Neural TTS (gemini-3.8-flash-lite-tts)'
            : 'Unconfigured',
        note: 'Server-side neural speech synthesis',
      },
      realtimeVoice: {
        available:
          config.toolsEnabled.voiceChat && (openaiRealtimeReady || geminiReady),
        provider:
          openaiRealtimeReady && geminiReady
            ? 'OpenAI Realtime API + Gemini 3.8 Live API'
            : openaiRealtimeReady
            ? 'OpenAI Realtime WebSocket'
            : geminiReady
            ? 'Google Gemini Live API (gemini-3.8-live)'
            : 'Unconfigured',
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
  const openaiKeySet = isOpenAIConfigured();
  const openaiVerified = cachedDiscovery?.data.reachable ?? false;
  const geminiReady = isGeminiConfigured();
  const anyReady = openaiVerified || geminiReady;

  return {
    openaiConfigured: openaiKeySet,
    openaiLiveVerified: openaiVerified,
    geminiConfigured: geminiReady,
    geminiBridgeConfigured: geminiReady,
    activeMode:
      openaiVerified && geminiReady
        ? 'multi-provider-live'
        : openaiVerified
        ? 'openai-live'
        : geminiReady
        ? 'gemini-live'
        : 'demo-simulation',
    openaiDiscovery: cachedDiscovery?.data,
    features: {
      chatStreaming: {
        available: anyReady,
        provider:
          openaiVerified && geminiReady
            ? 'OpenAI + Google Gemini'
            : openaiVerified
            ? 'OpenAI Official API'
            : geminiReady
            ? 'Google Gemini API'
            : 'Unconfigured',
        note: 'Server-side streaming AI chat',
      },
      reasoning: {
        available: anyReady,
        provider: openaiVerified ? 'OpenAI o-series + Gemini' : 'Gemini Thinking',
        note: 'Multi-step reasoning',
      },
      imageGeneration: {
        available: config.toolsEnabled.imageGeneration && openaiVerified,
        provider: openaiVerified
          ? 'OpenAI (dall-e-3)'
          : 'Requires Valid OPENAI_API_KEY',
        note: openaiVerified
          ? 'Official OpenAI DALL-E 3 enabled'
          : 'Requires valid OPENAI_API_KEY in Settings > Secrets',
      },
      imageAnalysis: {
        available: config.toolsEnabled.imageAnalysis && anyReady,
        provider: openaiVerified ? 'OpenAI Vision' : 'Gemini Multimodal',
        note: 'Image understanding',
      },
      pdfAnalysis: {
        available: config.toolsEnabled.pdfAnalysis && anyReady,
        provider: openaiVerified ? 'OpenAI PDF' : 'Gemini PDF Intelligence',
        note: 'PDF & document analysis',
      },
      webSearch: {
        available: config.toolsEnabled.webSearch && anyReady,
        provider: openaiVerified ? 'OpenAI Search' : 'Google Search Grounding',
        note: 'Live web citations',
      },
      speechToText: {
        available: config.toolsEnabled.voiceChat && anyReady,
        provider: openaiVerified ? 'OpenAI Audio' : 'Gemini 3.5 Transcribe',
        note: 'Speech-to-text',
      },
      textToSpeech: {
        available: config.toolsEnabled.voiceChat && anyReady,
        provider: openaiVerified ? 'OpenAI TTS' : 'Gemini 3.8 TTS',
        note: 'Text-to-speech',
      },
      realtimeVoice: {
        available: config.toolsEnabled.voiceChat && anyReady,
        provider: geminiReady ? 'Gemini 3.8 Live' : 'OpenAI Realtime',
        note: 'Realtime duplex voice',
      },
    },
  };
}

export function calculateProviderCostUsd(
  modelId: string,
  promptTokens: number,
  completionTokens: number,
  providerUsed: 'openai' | 'gemini',
  customRates?: { inputUsdPer1M?: number; outputUsdPer1M?: number }
): number {
  const table =
    providerUsed === 'gemini'
      ? GEMINI_PRICING_USD_PER_1M
      : OPENAI_PRICING_USD_PER_1M;
  const fallback =
    table[modelId] ||
    (providerUsed === 'gemini'
      ? GEMINI_PRICING_USD_PER_1M['gemini-3.8-flash']
      : OPENAI_PRICING_USD_PER_1M['gpt-4o']);

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
  providerUsed: 'openai' | 'gemini';
  modelUsed: string;
  providerCostUsd: number;
}

function buildSystemInstruction(userFullName: string): string {
  return `You are QAAGA AGENT, an enterprise-grade AI assistant built with original QAAGA AGENT branding for ${userFullName}.
- Deliver accurate, structured Markdown answers with syntax-highlighted code blocks, tables, and clear reasoning.
- Fluently support English, Bengali (বাংলা), and Banglish.
- Maintain original QAAGA AGENT identity.`;
}

export function getDefaultServerOpenAIModel(
  config?: PlatformConfigDTO
): string {
  const envModel = (process.env.OPENAI_MODEL || '').trim();
  if (envModel) {
    return envModel;
  }
  const enabledOpenAI =
    config?.models.filter((m) => m.provider === 'openai' && m.enabled) || [];
  const preferredMini = enabledOpenAI.find((m) => m.id === 'gpt-4o-mini');
  if (preferredMini) return preferredMini.id;
  if (enabledOpenAI.length > 0) return enabledOpenAI[0].id;
  return 'gpt-4o-mini';
}

function resolveOfficialOpenAIModel(requestedId: string): string {
  const clean = (requestedId || '').trim();
  // Map legacy Chat Completions search-preview aliases to Responses API base models (web_search_preview tool handles search)
  if (clean === 'gpt-4o-mini-search-preview') return 'gpt-4o-mini';
  if (clean === 'gpt-4o-search-preview') return 'gpt-4o';

  // Honor explicit official OpenAI model IDs (gpt-*, o1*, o3*, o4*, chatgpt-*) or server env OPENAI_MODEL
  const envModel = (process.env.OPENAI_MODEL || '').trim();
  if (clean && clean === envModel) return clean;
  if (/^(gpt-|o1|o3|o4|chatgpt-)/i.test(clean)) {
    return clean;
  }
  return getDefaultServerOpenAIModel();
}

function resolveAllowedGeminiModel(requestedId: string): string {
  const clean = (requestedId || '').trim();
  const allowed = new Set([
    'gemini-3.8-flash',
    'gemini-flash-latest',
    'gemini-3.1-flash-lite',
  ]);
  if (allowed.has(clean)) return clean;
  if (clean.includes('lite')) return 'gemini-3.1-flash-lite';
  return 'gemini-3.8-flash';
}

/**
 * Streams chat/reasoning/vision/PDF/web-search strictly via the selected model's provider
 * (`openai` or `gemini`). NEVER silently switches providers on failure!
 */
export async function streamChatCompletion(
  opts: StreamChatOptions
): Promise<StreamChatResult> {
  const selectedProvider =
    opts.modelConfig.provider === 'gemini' ||
    opts.modelConfig.provider === 'bridge'
      ? 'gemini'
      : 'openai';

  if (selectedProvider === 'gemini') {
    return streamGeminiChatCompletion(opts);
  }
  return streamOpenAIResponsesChat(opts);
}

/**
 * Streams real assistant responses via the official OpenAI Responses API (`openai.responses.create`)
 * with multi-turn conversation history, multimodal inputs, optional web_search_preview, and reasoning effort.
 * Never exposes OPENAI_API_KEY and never falls back to Gemini or mock data.
 */
export async function streamOpenAIResponsesChat(
  opts: StreamChatOptions
): Promise<StreamChatResult> {
  if (!isOpenAIConfigured()) {
    const missingErr = new Error(
      'OPENAI_API_KEY is not configured on the server. Add OPENAI_API_KEY in AI Studio Settings > Secrets.'
    ) as Error & { code?: string; status?: number };
    missingErr.code = 'OPENAI_SECRET_MISSING';
    missingErr.status = 503;
    throw missingErr;
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
    // o3-mini is text-only; use gpt-4o within OpenAI for image/PDF inspection
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

  // Build Responses API multi-turn input array preserving conversation history
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
        // Fallback text & citation extraction if a completed item contained non-delta output
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
      'openai',
      {
        inputUsdPer1M: opts.modelConfig.inputUsdPer1M,
        outputUsdPer1M: opts.modelConfig.outputUsdPer1M,
      }
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

// Smart Circuit Breaker for gemini-3.8-flash upstream stalls/503s:
// If gemini-3.8-flash stalls (>3.5s) or returns 503/429, bypass directly to gemini-3.1-flash-lite for 3 minutes (0ms wasted wait).
let gemini38CooldownUntil = 0;

async function streamGeminiChatCompletion(
  opts: StreamChatOptions
): Promise<StreamChatResult> {
  const ai = getGeminiClient();
  const requestedGeminiModel = resolveAllowedGeminiModel(opts.modelConfig.id);
  const targetModel =
    requestedGeminiModel === 'gemini-3.8-flash' &&
    Date.now() < gemini38CooldownUntil
      ? 'gemini-3.1-flash-lite'
      : requestedGeminiModel;
  const systemInstruction = buildSystemInstruction(opts.userFullName);

  const contents: Array<{
    role: 'user' | 'model';
    parts: Array<Record<string, unknown>>;
  }> = opts.history.slice(-10).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const currentParts: Array<Record<string, unknown>> = [];
  if (opts.attachments && opts.attachments.length > 0) {
    for (const att of opts.attachments) {
      const mime = (att.mimeType || '').toLowerCase();
      if (
        mime.startsWith('image/') ||
        mime === 'application/pdf' ||
        att.name.toLowerCase().endsWith('.pdf')
      ) {
        currentParts.push({
          inlineData: {
            mimeType: mime || 'application/pdf',
            data: att.base64Data,
          },
        });
      } else {
        const decodedText = Buffer.from(att.base64Data, 'base64')
          .toString('utf-8')
          .slice(0, 48_000);
        currentParts.push({
          text: `[Attached Document: ${att.name}]\n\`\`\`\n${decodedText}\n\`\`\``,
        });
      }
    }
  }

  currentParts.push({
    text:
      opts.prompt?.trim() ||
      'Analyze and summarize the attached document or image thoroughly.',
  });

  contents.push({
    role: 'user',
    parts: currentParts,
  });

  let emittedAnyDelta = false;

  const runGeminiStream = async (
    modelToCall: string,
    firstTokenTimeoutMs: number
  ) => {
    const controller = new AbortController();
    let watchdogTimer: ReturnType<typeof setTimeout> | null = null;

    const firstTokenAbortPromise = new Promise<never>((_, reject) => {
      watchdogTimer = setTimeout(() => {
        if (!emittedAnyDelta) {
          const timeoutErr = new Error(
            `Gemini ${modelToCall} first-token timeout after ${firstTokenTimeoutMs}ms`
          );
          controller.abort(timeoutErr);
          reject(timeoutErr);
        }
      }, firstTokenTimeoutMs);
    });
    // Prevent unhandled rejection if stream finishes cleanly before timeout
    firstTokenAbortPromise.catch(() => {});

    const executeStream = async () => {
      const configObj: Record<string, unknown> = {
        systemInstruction,
        abortSignal: controller.signal,
      };

      if (opts.webSearch) {
        configObj.tools = [{ googleSearch: {} }];
      }

      if (modelToCall === 'gemini-3.1-flash-lite') {
        configObj.thinkingConfig = {
          thinkingLevel:
            opts.reasoningEffort === 'high'
              ? ThinkingLevel.MEDIUM
              : opts.reasoningEffort === 'medium'
              ? ThinkingLevel.LOW
              : ThinkingLevel.MINIMAL,
        };
      } else if (modelToCall === 'gemini-3.8-flash') {
        configObj.thinkingConfig = {
          thinkingLevel:
            opts.reasoningEffort === 'high'
              ? ThinkingLevel.HIGH
              : opts.reasoningEffort === 'medium'
              ? ThinkingLevel.MEDIUM
              : ThinkingLevel.LOW,
        };
      } else if (
        modelToCall === 'gemini-flash-latest' &&
        (!opts.reasoningEffort || opts.reasoningEffort === 'low')
      ) {
        configObj.thinkingConfig = { thinkingBudget: 0 };
      }

      const responseStream = await Promise.race([
        ai.models.generateContentStream({
          model: modelToCall,
          contents,
          config: configObj,
        }),
        firstTokenAbortPromise,
      ]);

      let fullText = '';
      let promptTokens = 0;
      let completionTokens = 0;
      const citationMap = new Map<string, GroundingLink>();

      const iterator = responseStream[Symbol.asyncIterator]();
      while (true) {
        const nextStep = emittedAnyDelta
          ? await iterator.next()
          : await Promise.race([iterator.next(), firstTokenAbortPromise]);

        if (nextStep.done) break;

        const chunk = nextStep.value as GenerateContentResponse;
        const deltaText = chunk.text;
        if (deltaText) {
          if (!emittedAnyDelta && watchdogTimer) {
            clearTimeout(watchdogTimer);
            watchdogTimer = null;
          }
          emittedAnyDelta = true;
          fullText += deltaText;
          opts.onDelta(deltaText);
        }

        const groundingChunks =
          chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (Array.isArray(groundingChunks)) {
          for (const g of groundingChunks) {
            const web = (g as { web?: { uri?: string; title?: string } })?.web;
            if (web?.uri) {
              citationMap.set(web.uri, {
                uri: web.uri,
                title: web.title || web.uri,
              });
            }
          }
        }

        if (chunk.usageMetadata) {
          promptTokens = chunk.usageMetadata.promptTokenCount || promptTokens;
          completionTokens =
            chunk.usageMetadata.candidatesTokenCount || completionTokens;
        }
      }

      return {
        fullText,
        citations: Array.from(citationMap.values()),
        promptTokens,
        completionTokens,
        modelUsed: modelToCall,
      };
    };

    try {
      return await executeStream();
    } finally {
      if (watchdogTimer) {
        clearTimeout(watchdogTimer);
      }
    }
  };

  try {
    const candidateChain = Array.from(
      new Set([
        targetModel,
        'gemini-3.1-flash-lite',
        'gemini-flash-latest',
      ])
    );

    let outcome: Awaited<ReturnType<typeof runGeminiStream>> | null = null;
    let lastGeminiErr: unknown = null;

    for (let i = 0; i < candidateChain.length; i++) {
      const candidate = candidateChain[i];
      const timeoutMs =
        candidate === 'gemini-3.8-flash'
          ? 3_500
          : candidate === 'gemini-3.1-flash-lite'
          ? 5_500
          : 15_000;

      try {
        outcome = await runGeminiStream(candidate, timeoutMs);
        break;
      } catch (err: unknown) {
        lastGeminiErr = err;
        if (candidate === 'gemini-3.8-flash' && isTransientOverload(err)) {
          gemini38CooldownUntil = Date.now() + 3 * 60_000;
        }
        const { status } = extractProviderErrorMeta(err);
        const retryable =
          !emittedAnyDelta &&
          i < candidateChain.length - 1 &&
          (isTransientOverload(err) || status === 429 || status === 400);
        if (!retryable) {
          throw formatGeminiError(err, 'Google Gemini Chat Stream');
        }
      }
    }

    if (!outcome) {
      throw formatGeminiError(lastGeminiErr, 'Google Gemini Chat Stream');
    }

    const promptTokens =
      outcome.promptTokens > 0
        ? outcome.promptTokens
        : Math.ceil((opts.prompt.length + 200) / 4);
    const completionTokens =
      outcome.completionTokens > 0
        ? outcome.completionTokens
        : Math.ceil(outcome.fullText.length / 4);
    const totalTokens = promptTokens + completionTokens;

    const providerCostUsd = calculateProviderCostUsd(
      outcome.modelUsed,
      promptTokens,
      completionTokens,
      'gemini',
      {
        inputUsdPer1M: opts.modelConfig.inputUsdPer1M,
        outputUsdPer1M: opts.modelConfig.outputUsdPer1M,
      }
    );

    return {
      fullText: outcome.fullText,
      citations: outcome.citations,
      promptTokens,
      completionTokens,
      totalTokens,
      providerUsed: 'gemini',
      modelUsed: outcome.modelUsed,
      providerCostUsd,
    };
  } catch (err: unknown) {
    throw err instanceof Error
      ? new Error(redactSecrets(err.message))
      : formatGeminiError(err, 'Google Gemini Chat Stream');
  }
}

/**
 * Official OpenAI Image Generation (`dall-e-3` / `gpt-image-1`).
 * Never silently switches providers on failure.
 */
export async function generateImageAsset(
  prompt: string,
  aspectRatio: '1:1' | '16:9' | '3:4'
): Promise<{
  imageDataUrl: string;
  revisedPrompt: string;
  providerUsed: 'openai';
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
 * Speech-to-Text supporting Official OpenAI (`gpt-4o-mini-transcribe` / `whisper-1`)
 * and Google Gemini (`gemini-3.5-transcribe`), routing strictly by chosen provider.
 */
export async function transcribeAudioBuffer(
  base64Audio: string,
  mimeType: string,
  preferredProvider?: 'openai' | 'gemini'
): Promise<{
  transcript: string;
  providerUsed: 'openai' | 'gemini';
  modelUsed: string;
  providerCostUsd: number;
}> {
  const targetProvider: 'openai' | 'gemini' =
    preferredProvider ||
    (cachedDiscovery?.data.reachable
      ? 'openai'
      : isGeminiConfigured()
      ? 'gemini'
      : 'openai');

  if (targetProvider === 'gemini') {
    const ai = getGeminiClient();
    const response = await withOverloadRetry(
      () =>
        ai.models.generateContent({
          model: 'gemini-3.5-transcribe',
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: mimeType || 'audio/webm',
                  data: base64Audio,
                },
              },
              {
                text: 'Transcribe this spoken audio accurately. Output only the spoken transcript.',
              },
            ],
          },
        }),
      (e) => formatGeminiError(e, 'Gemini Speech-to-Text')
    );

    const promptTokens = response.usageMetadata?.promptTokenCount || 120;
    const completionTokens = response.usageMetadata?.candidatesTokenCount || 40;
    const providerCostUsd = calculateProviderCostUsd(
      'gemini-3.5-transcribe',
      promptTokens,
      completionTokens,
      'gemini'
    );

    return {
      transcript: (response.text || '').trim(),
      providerUsed: 'gemini',
      modelUsed: 'gemini-3.5-transcribe',
      providerCostUsd,
    };
  }

  // OpenAI Audio Transcriptions
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
 * Text-to-Speech supporting Official OpenAI (`tts-1`) and Google Gemini (`gemini-3.8-flash-lite-tts`),
 * routing strictly by chosen provider without silent cross-provider fallback.
 */
export async function synthesizeSpeechAudio(
  text: string,
  voice: string,
  preferredProvider?: 'openai' | 'gemini'
): Promise<{
  audioDataUrl: string;
  providerUsed: 'openai' | 'gemini';
  modelUsed: string;
  providerCostUsd: number;
}> {
  const cleanText = text
    .replace(/```[\s\S]*?```/g, 'Code block omitted.')
    .replace(/[#*_`>|]/g, '')
    .trim()
    .slice(0, 1800);

  const targetProvider: 'openai' | 'gemini' =
    preferredProvider ||
    (cachedDiscovery?.data.reachable
      ? 'openai'
      : isGeminiConfigured()
      ? 'gemini'
      : 'openai');

  if (targetProvider === 'gemini') {
    const ai = getGeminiClient();
    const geminiVoiceMap: Record<string, string> = {
      alloy: 'Zephyr',
      nova: 'Kore',
      echo: 'Puck',
      onyx: 'Fenrir',
      shimmer: 'Charon',
      Zephyr: 'Zephyr',
      Kore: 'Kore',
      Puck: 'Puck',
      Fenrir: 'Fenrir',
      Charon: 'Charon',
    };
    const chosenVoice = geminiVoiceMap[voice] || 'Kore';

    const response = await withOverloadRetry(
      () =>
        ai.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: [
            {
              role: 'user',
              parts: [{ text: cleanText || 'Hello from QAAGA AGENT.' }],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: chosenVoice },
              },
            },
          },
        }),
      (e) => formatGeminiError(e, 'Gemini Text-to-Speech')
    );

    const base64Audio =
      response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)
        ?.inlineData?.data;

    if (!base64Audio) {
      throw new Error('Gemini TTS did not return audio data.');
    }

    const promptTokens = response.usageMetadata?.promptTokenCount || 80;
    const completionTokens =
      response.usageMetadata?.candidatesTokenCount || 240;

    return {
      // Unary Gemini 3.8 TTS returns a complete RIFF WAV file (24kHz mono 16-bit)
      audioDataUrl: `data:audio/wav;base64,${base64Audio}`,
      providerUsed: 'gemini',
      modelUsed: 'gemini-3.8-flash-lite-tts',
      providerCostUsd: calculateProviderCostUsd(
        'gemini-3.8-flash-lite-tts',
        promptTokens,
        completionTokens,
        'gemini'
      ),
    };
  }

  // OpenAI TTS
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
 * Server-side Google Gemini Live API session connector for WebSocket Realtime Voice (`/api/realtime/voice`).
 */
export async function connectGeminiLiveVoiceSession(params: {
  userFullName: string;
  voiceName?: string;
  onAudioBase64: (pcm24kBase64: string) => void;
  onTranscript: (role: 'user' | 'assistant', text: string) => void;
  onInterrupted: () => void;
  onError: (safeError: string) => void;
}) {
  const ai = getGeminiClient();
  const voiceMap: Record<string, string> = {
    alloy: 'Zephyr',
    nova: 'Kore',
    echo: 'Puck',
    onyx: 'Fenrir',
    shimmer: 'Charon',
  };
  const resolvedVoice =
    voiceMap[params.voiceName || ''] || params.voiceName || 'Zephyr';

  const session = await ai.live.connect({
    model: 'gemini-3.8-live',
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: resolvedVoice },
        },
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      systemInstruction: `You are QAAGA AGENT Realtime Voice Assistant speaking with ${params.userFullName}. Keep spoken answers natural, helpful, and concise. Support English and Bengali.`,
    },
    callbacks: {
      onmessage: (message: LiveServerMessage) => {
        const parts = message.serverContent?.modelTurn?.parts;
        if (Array.isArray(parts)) {
          for (const part of parts) {
            if (part.inlineData?.data) {
              params.onAudioBase64(part.inlineData.data);
            }
          }
        }
        const inTr = (
          message.serverContent as unknown as {
            inputTranscription?: { text?: string };
          }
        )?.inputTranscription?.text;
        if (inTr) {
          params.onTranscript('user', inTr);
        }
        const outTr = (
          message.serverContent as unknown as {
            outputTranscription?: { text?: string };
          }
        )?.outputTranscription?.text;
        if (outTr) {
          params.onTranscript('assistant', outTr);
        }
        if (message.serverContent?.interrupted) {
          params.onInterrupted();
        }
      },
      onerror: (err: unknown) => {
        const { safeMessage } = extractProviderErrorMeta(err);
        params.onError(safeMessage);
      },
    },
  });

  return session;
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
  const keyPresent = Boolean(rawKey && !PLACEHOLDER_KEYS.has(rawKey));
  const apiNote =
    'OpenAI API models are unlocked based on your platform.openai.com API billing tier (independent of ChatGPT Plus/Pro web subscriptions).';

  const { discovery } = await discoverOpenAIAccountModels(true);

  if (!discovery.reachable) {
    return {
      ok: false,
      keyPresent,
      keyLength: keyPresent ? rawKey.length : 0,
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
    const envModel = (process.env.OPENAI_MODEL || '').trim();
    const pingModel =
      envModel ||
      discovery.categorizedModels.economical[0] ||
      discovery.categorizedModels.standard[0] ||
      'gpt-4o-mini';

    const ping = await openai.responses.create({
      model: pingModel,
      input: 'Reply with OK',
      max_output_tokens: 16,
    });
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

/**
 * Live Server-Side Google Gemini Connection Diagnostic.
 */
export async function testGeminiConnection(): Promise<
  ProviderDiagnosticsDTO['gemini']
> {
  const startedAt = Date.now();
  const ready = isGeminiConfigured();
  if (!ready) {
    return {
      ok: false,
      keyPresent: false,
      status: null,
      errorCode: 'missing_gemini_key',
      message:
        'GEMINI_API_KEY is not configured in server environment variables.',
      latencyMs: Date.now() - startedAt,
      availableModels: [],
    };
  }

  try {
    const ai = getGeminiClient();
    let usedPingModel = 'gemini-3.1-flash-lite';
    let res;
    try {
      res = await ai.models.generateContent({
        model: usedPingModel,
        contents: 'Reply with the single word OK.',
      });
    } catch (firstErr: unknown) {
      const meta = extractProviderErrorMeta(firstErr);
      if (meta.status === 503 || meta.status === 429) {
        usedPingModel = 'gemini-3.8-flash';
        res = await ai.models.generateContent({
          model: usedPingModel,
          contents: 'Reply with the single word OK.',
        });
      } else {
        throw firstErr;
      }
    }
    const reply = (res.text || 'OK').trim().slice(0, 24);
    return {
      ok: true,
      keyPresent: true,
      status: 200,
      errorCode: null,
      message: `Connected to Google Gemini API (ping "${reply}" via ${usedPingModel}).`,
      latencyMs: Date.now() - startedAt,
      availableModels: [
        'gemini-3.8-flash',
        'gemini-3.1-flash-lite',
        'gemini-3.5-transcribe',
        'gemini-3.8-flash-lite-tts',
        'gemini-3.8-live',
      ],
    };
  } catch (err: unknown) {
    const { status, errorCode } = extractProviderErrorMeta(err);
    const formatted = formatGeminiError(err, 'Gemini Connection Test');
    return {
      ok: false,
      keyPresent: true,
      status,
      errorCode,
      message: formatted.message,
      latencyMs: Date.now() - startedAt,
      availableModels: [],
    };
  }
}

export async function testAllProvidersConnection(): Promise<ProviderDiagnosticsDTO> {
  const [openaiDiag, geminiDiag] = await Promise.all([
    testOpenAIConnection(),
    testGeminiConnection(),
  ]);
  return {
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
    gemini: geminiDiag,
  };
}
