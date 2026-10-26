import OpenAI from 'openai';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { GenerateContentResponse } from '@google/genai';
import type {
  GroundingLink,
  ModelConfigItem,
  PlatformConfigDTO,
  ProviderCapabilitiesDTO,
} from '../types/qaaga.ts';

// Official OpenAI Standard API Pricing (USD per 1M tokens) — never fabricated
export const OPENAI_PRICING_USD_PER_1M: Record<
  string,
  { input: number; output: number }
> = {
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'o3-mini': { input: 1.1, output: 4.4 },
  'gpt-4o-search-preview': { input: 2.5, output: 10.0 },
};

export function isOpenAIConfigured(): boolean {
  const key = process.env.OPENAI_API_KEY?.trim();
  return Boolean(key && key !== 'MY_OPENAI_API_KEY' && key.length > 12);
}

export function isGeminiBridgeConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY?.trim();
  return Boolean(key && key !== 'MY_GEMINI_API_KEY' && key.length > 10);
}

export function getProviderCapabilities(
  config: PlatformConfigDTO
): ProviderCapabilitiesDTO {
  const openaiReady = isOpenAIConfigured();
  const geminiReady = isGeminiBridgeConfigured();
  const activeMode = openaiReady
    ? 'openai-live'
    : geminiReady
    ? 'sandbox-bridge'
    : 'demo-simulation';

  return {
    openaiConfigured: openaiReady,
    geminiBridgeConfigured: geminiReady,
    activeMode,
    features: {
      chatStreaming: {
        available: true,
        provider: openaiReady
          ? 'OpenAI API (Live)'
          : geminiReady
          ? 'Server Bridge (OPENAI_API_KEY unconfigured)'
          : 'Labeled Demo Mode',
        note: openaiReady
          ? 'Direct OpenAI Responses/Chat streaming active'
          : 'Set OPENAI_API_KEY in Secrets to switch from Sandbox Bridge to direct OpenAI billing',
      },
      imageGeneration: {
        available: config.toolsEnabled.imageGeneration,
        provider: openaiReady
          ? 'OpenAI gpt-image-1 / dall-e-3'
          : geminiReady
          ? 'Vector Synthesis Bridge (OpenAI unconfigured)'
          : 'Demo Vector Mode',
        note: config.toolsEnabled.imageGeneration
          ? 'Enabled by administrator'
          : 'Disabled by administrator',
      },
      imageAnalysis: {
        available: config.toolsEnabled.imageAnalysis && (openaiReady || geminiReady),
        provider: openaiReady ? 'OpenAI Vision' : 'Multimodal Vision Bridge',
        note: 'Supports PNG, JPEG, WEBP inline visual inspection',
      },
      pdfAnalysis: {
        available: config.toolsEnabled.pdfAnalysis && (openaiReady || geminiReady),
        provider: openaiReady ? 'OpenAI Document Extraction' : 'Multimodal PDF Bridge',
        note: 'Supports PDF, TXT, CSV, Markdown summarization & Q&A',
      },
      webSearch: {
        available: config.toolsEnabled.webSearch && (openaiReady || geminiReady),
        provider: openaiReady
          ? 'OpenAI Search Preview'
          : geminiReady
          ? 'Google Search Grounding Bridge'
          : 'Unconfigured',
        note:
          openaiReady || geminiReady
            ? 'Live web citations enabled'
            : 'Configure API credentials to enable live web search',
      },
      speechToText: {
        available: config.toolsEnabled.voiceChat && (openaiReady || geminiReady),
        provider: openaiReady ? 'OpenAI Whisper-1' : 'Gemini 3.5 Transcribe Bridge',
        note: 'Supports English & Bengali microphone dictation',
      },
      textToSpeech: {
        available: config.toolsEnabled.voiceChat && (openaiReady || geminiReady),
        provider: openaiReady ? 'OpenAI TTS-1' : 'Neural 24kHz WAV TTS Bridge',
        note: 'Spoken audio synthesis for assistant responses',
      },
    },
  };
}

function getOpenAIClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

function getGeminiClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function calculateOpenAICostUsd(
  modelId: string,
  promptTokens: number,
  completionTokens: number,
  providerUsed: 'openai' | 'gemini' | 'demo'
): number {
  if (providerUsed !== 'openai') {
    // Only record real OpenAI USD spend when OpenAI API was genuinely called!
    return 0;
  }
  const pricing =
    OPENAI_PRICING_USD_PER_1M[modelId] || OPENAI_PRICING_USD_PER_1M['gpt-4o-mini'];
  const inputCost = (promptTokens / 1_000_000) * pricing.input;
  const outputCost = (completionTokens / 1_000_000) * pricing.output;
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
  providerUsed: 'openai' | 'gemini' | 'demo';
  providerCostUsd: number;
}

export async function streamChatCompletion(
  opts: StreamChatOptions
): Promise<StreamChatResult> {
  const systemPrompt = `You are QAAGA AGENT, an enterprise-grade AI assistant built with original QAAGA AGENT branding for ${opts.userFullName}.
- Deliver accurate, structured Markdown answers with syntax-highlighted code blocks, tables, and clear reasoning.
- Fluently support English, Bengali (বাংলা), and Banglish.
- Never claim official OpenAI affiliation or ChatGPT branding; you are QAAGA AGENT.`;

  // 1. Primary Path: Official Server-Side OpenAI SDK when OPENAI_API_KEY is configured
  if (isOpenAIConfigured()) {
    const openai = getOpenAIClient();
    const targetModel = opts.webSearch
      ? 'gpt-4o-search-preview'
      : opts.modelConfig.id;

    const userContentParts: Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    > = [];

    if (opts.attachments && opts.attachments.length > 0) {
      for (const att of opts.attachments) {
        if (att.mimeType.startsWith('image/')) {
          userContentParts.push({
            type: 'image_url',
            image_url: {
              url: `data:${att.mimeType};base64,${att.base64Data}`,
            },
          });
        } else {
          // Decode text/PDF readable content snippet for OpenAI chat message context
          const decoded = Buffer.from(att.base64Data, 'base64')
            .toString('utf-8')
            .replace(/[^\x09\x0A\x0D\x20-\x7E\u0980-\u09FF]/g, ' ')
            .slice(0, 18000);
          userContentParts.push({
            type: 'text',
            text: `[Attached Document: ${att.name}]\n${decoded}`,
          });
        }
      }
    }

    userContentParts.push({
      type: 'text',
      text: opts.prompt || 'Analyze the attached content thoroughly.',
    });

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...opts.history.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      })),
      { role: 'user', content: userContentParts },
    ];

    const stream = await openai.chat.completions.create({
      model: targetModel,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    });

    let fullText = '';
    let promptTokens = 0;
    let completionTokens = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        fullText += delta;
        opts.onDelta(delta);
      }
      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens || 0;
        completionTokens = chunk.usage.completion_tokens || 0;
      }
    }

    if (promptTokens === 0) {
      promptTokens = Math.ceil((opts.prompt.length + 250) / 4);
      completionTokens = Math.ceil(fullText.length / 4);
    }
    const totalTokens = promptTokens + completionTokens;
    const providerCostUsd = calculateOpenAICostUsd(
      targetModel,
      promptTokens,
      completionTokens,
      'openai'
    );

    return {
      fullText,
      citations: [],
      promptTokens,
      completionTokens,
      totalTokens,
      providerUsed: 'openai',
      providerCostUsd,
    };
  }

  // 2. Secondary Path: Server-Side Multimodal Bridge when OPENAI_API_KEY is not configured
  if (isGeminiBridgeConfigured()) {
    const ai = getGeminiClient();
    const priorContents = opts.history.slice(-10).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const parts: Array<
      { text: string } | { inlineData: { mimeType: string; data: string } }
    > = [];

    if (opts.attachments && opts.attachments.length > 0) {
      for (const att of opts.attachments) {
        parts.push({
          inlineData: {
            mimeType: att.mimeType || 'application/pdf',
            data: att.base64Data,
          },
        });
      }
    }
    parts.push({
      text: opts.prompt || 'Summarize and analyze the uploaded file.',
    });

    const isReasoning = opts.modelConfig.category === 'reasoning';
    const responseStream = await ai.models.generateContentStream({
      model: 'gemini-3.8-flash',
      contents: [...priorContents, { role: 'user', parts }],
      config: {
        systemInstruction: systemPrompt,
        thinkingConfig: {
          thinkingLevel: isReasoning ? ThinkingLevel.HIGH : ThinkingLevel.LOW,
        },
        ...(opts.webSearch
          ? { tools: [{ googleSearch: {} }, { urlContext: {} }] }
          : {}),
      },
    });

    let fullText = '';
    const citationMap = new Map<string, GroundingLink>();

    for await (const chunk of responseStream) {
      const c = chunk as GenerateContentResponse;
      if (c.text) {
        fullText += c.text;
        opts.onDelta(c.text);
      }
      const gChunks = c.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (Array.isArray(gChunks)) {
        for (const gc of gChunks) {
          const web = (gc as { web?: { uri?: string; title?: string } }).web;
          if (web?.uri) {
            citationMap.set(web.uri, {
              uri: web.uri,
              title: web.title || new URL(web.uri).hostname,
            });
          }
        }
      }
    }

    const promptTokens = Math.ceil((opts.prompt.length + 280) / 4);
    const completionTokens = Math.ceil(fullText.length / 4);

    return {
      fullText,
      citations: Array.from(citationMap.values()),
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      providerUsed: 'gemini',
      providerCostUsd: 0,
    };
  }

  // 3. Explicit Labeled Demo Mode if neither API key is configured
  const demoReply = `**[QAAGA AGENT — Labeled Demo Mode]**\n\nNo \`OPENAI_API_KEY\` is currently configured on the server. Once your administrator sets \`OPENAI_API_KEY\` in environment variables, requests for **${opts.modelConfig.label}** will stream live from OpenAI.\n\n**Echoed Request:** ${opts.prompt}`;
  opts.onDelta(demoReply);
  return {
    fullText: demoReply,
    citations: [],
    promptTokens: 40,
    completionTokens: 60,
    totalTokens: 100,
    providerUsed: 'demo',
    providerCostUsd: 0,
  };
}

export async function generateImageAsset(
  prompt: string,
  aspectRatio: '1:1' | '16:9' | '3:4'
): Promise<{
  imageDataUrl: string;
  revisedPrompt: string;
  providerUsed: 'openai' | 'gemini' | 'demo';
  providerCostUsd: number;
}> {
  if (isOpenAIConfigured()) {
    const openai = getOpenAIClient();
    const size =
      aspectRatio === '16:9'
        ? '1792x1024'
        : aspectRatio === '3:4'
        ? '1024x1792'
        : '1024x1024';
    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size,
      response_format: 'b64_json',
    });
    const b64 = response.data?.[0]?.b64_json;
    if (!b64) throw new Error('OpenAI image response did not contain image bytes.');
    return {
      imageDataUrl: `data:image/png;base64,${b64}`,
      revisedPrompt: response.data?.[0]?.revised_prompt || prompt,
      providerUsed: 'openai',
      providerCostUsd: size === '1024x1024' ? 0.04 : 0.08,
    };
  }

  if (isGeminiBridgeConfigured()) {
    const ai = getGeminiClient();
    const dims =
      aspectRatio === '16:9'
        ? { w: 1280, h: 720 }
        : aspectRatio === '3:4'
        ? { w: 768, h: 1024 }
        : { w: 1024, h: 1024 };

    const res = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `Generate a rich, multi-layered, high-detail SVG illustration for: "${prompt}".
Root element MUST be <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dims.w} ${dims.h}" width="${dims.w}" height="${dims.h}"> with gradients, lighting, atmospheric depth, and at least 25 vector shapes. No external URLs or scripts.`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            revisedPrompt: { type: Type.STRING },
            svgMarkup: { type: Type.STRING },
          },
          required: ['revisedPrompt', 'svgMarkup'],
        },
      },
    });

    const parsed = JSON.parse((res.text || '{}').trim()) as {
      revisedPrompt?: string;
      svgMarkup?: string;
    };
    const svg =
      parsed.svgMarkup && parsed.svgMarkup.includes('<svg')
        ? parsed.svgMarkup
        : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><rect width="800" height="800" fill="#064E3B"/><circle cx="400" cy="400" r="220" fill="#10B981"/></svg>`;
    const b64Svg = Buffer.from(svg, 'utf-8').toString('base64');
    return {
      imageDataUrl: `data:image/svg+xml;base64,${b64Svg}`,
      revisedPrompt: parsed.revisedPrompt || prompt,
      providerUsed: 'gemini',
      providerCostUsd: 0,
    };
  }

  const demoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#0F172A"/><circle cx="512" cy="460" r="210" fill="#059669" opacity="0.85"/><text x="512" y="820" fill="#F8FAFC" font-family="sans-serif" font-size="32" text-anchor="middle">QAAGA Demo Canvas (Configure OPENAI_API_KEY)</text></svg>`;
  return {
    imageDataUrl: `data:image/svg+xml;base64,${Buffer.from(demoSvg).toString('base64')}`,
    revisedPrompt: `[Demo Mode] ${prompt}`,
    providerUsed: 'demo',
    providerCostUsd: 0,
  };
}

export async function transcribeAudioBuffer(
  base64Audio: string,
  mimeType: string
): Promise<{
  transcript: string;
  providerUsed: 'openai' | 'gemini' | 'demo';
  providerCostUsd: number;
}> {
  if (isOpenAIConfigured()) {
    const openai = getOpenAIClient();
    const buffer = Buffer.from(base64Audio, 'base64');
    const ext = mimeType.includes('wav') ? 'wav' : 'webm';
    const file = await OpenAI.toFile(buffer, `speech.${ext}`, { type: mimeType });
    const result = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file,
    });
    return {
      transcript: result.text.trim(),
      providerUsed: 'openai',
      providerCostUsd: 0.006,
    };
  }

  if (isGeminiBridgeConfigured()) {
    const ai = getGeminiClient();
    const res = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          { inlineData: { mimeType: mimeType || 'audio/webm', data: base64Audio } },
          { text: 'Transcribe this spoken audio accurately in English or Bengali.' },
        ],
      },
    });
    return {
      transcript: (res.text || '').trim(),
      providerUsed: 'gemini',
      providerCostUsd: 0,
    };
  }

  return {
    transcript: 'Demo voice transcript (configure OPENAI_API_KEY for Whisper STT).',
    providerUsed: 'demo',
    providerCostUsd: 0,
  };
}

export async function synthesizeSpeechAudio(
  text: string,
  voice: string
): Promise<{
  audioDataUrl: string;
  providerUsed: 'openai' | 'gemini' | 'demo';
  providerCostUsd: number;
}> {
  const cleanText = text
    .replace(/```[\s\S]*?```/g, 'Code block omitted.')
    .replace(/[#*_`>|]/g, '')
    .slice(0, 1200);

  if (isOpenAIConfigured()) {
    const openai = getOpenAIClient();
    const validVoice = (
      ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'].includes(voice)
        ? voice
        : 'alloy'
    ) as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

    const mp3 = await openai.audio.speech.create({
      model: 'tts-1',
      voice: validVoice,
      input: cleanText,
    });
    const buffer = Buffer.from(await mp3.arrayBuffer());
    const cost = Number(((cleanText.length / 1000) * 0.015).toFixed(6));
    return {
      audioDataUrl: `data:audio/mpeg;base64,${buffer.toString('base64')}`,
      providerUsed: 'openai',
      providerCostUsd: cost,
    };
  }

  if (isGeminiBridgeConfigured()) {
    const ai = getGeminiClient();
    const voiceMap: Record<string, string> = {
      alloy: 'Kore',
      nova: 'Zephyr',
      echo: 'Puck',
      onyx: 'Fenrir',
      shimmer: 'Charon',
    };
    const geminiVoice = voiceMap[voice] || 'Kore';
    const res = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [{ role: 'user', parts: [{ text: cleanText }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: geminiVoice } },
        },
      },
    });
    const b64 = res.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!b64) throw new Error('Speech synthesis returned empty audio.');
    return {
      audioDataUrl: `data:audio/wav;base64,${b64}`,
      providerUsed: 'gemini',
      providerCostUsd: 0,
    };
  }

  throw new Error(
    'Text-to-speech is unconfigured. Add OPENAI_API_KEY in environment settings.'
  );
}
