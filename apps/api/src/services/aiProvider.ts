// Multi-provider AI service supporting Gemini and OpenAI-compatible endpoints.

import { GoogleGenAI } from '@google/genai';

export interface AiConfig {
  configured: boolean;
  provider: 'gemini' | 'freellmapi' | 'openai-compatible' | 'none';
  model: string;
  baseUrl: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Returns current AI configuration without exposing secrets.
export function getAiConfig(): AiConfig {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const freeLlmKey = process.env.FREELLMAPI_API_KEY?.trim();
  const genericApiKey = process.env.AI_API_KEY?.trim();
  const requestedProvider = process.env.AI_PROVIDER?.toLowerCase().trim();

  // Gemini provider configuration.
  if (requestedProvider === 'gemini' || (!requestedProvider && geminiKey)) {
    const rawModel = process.env.GEMINI_MODEL?.trim();
    const model = !rawModel || rawModel === 'auto' ? 'gemini-3.8-flash' : rawModel;
    return {
      configured: Boolean(geminiKey),
      provider: 'gemini',
      model,
      baseUrl: 'https://generativelanguage.googleapis.com',
    };
  }

  // FreeLLMAPI secondary provider.
  if (requestedProvider === 'freellmapi') {
    const apiKey = freeLlmKey || genericApiKey;
    const baseUrl = (process.env.AI_BASE_URL?.trim() || 'https://api.freellmapi.com/v1').replace(/\/+$/, '');
    const model = process.env.AI_MODEL?.trim() || 'gpt-4o-mini';
    return {
      configured: Boolean(apiKey),
      provider: 'freellmapi',
      model,
      baseUrl,
    };
  }

  // Generic OpenAI-compatible provider.
  if (genericApiKey) {
    const baseUrl = (process.env.AI_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const model = process.env.AI_MODEL?.trim() || 'gpt-4o-mini';
    return {
      configured: true,
      provider: 'openai-compatible',
      model,
      baseUrl,
    };
  }

  // Fallback to offline heuristic mode.
  return {
    configured: false,
    provider: 'none',
    model: 'gemini-2.5-flash',
    baseUrl: '',
  };
}

export function isAiConfigured(): boolean {
  return getAiConfig().configured;
}

// Returns an authenticated GoogleGenAI client.
export function getGeminiClient(): GoogleGenAI {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (!geminiKey) {
    throw new Error(
      'Gemini API is not configured. Set GEMINI_API_KEY in your environment to enable native Gemini agent features.'
    );
  }
  return new GoogleGenAI({ apiKey: geminiKey });
}

// Normalizes error messages from provider APIs and network failures.
export function normalizeAiError(err: any, provider: string): string {
  const msg = err?.message || String(err);
  if (/API_KEY_INVALID|invalid api key|401/i.test(msg)) {
    return `${provider.toUpperCase()} Authentication Failed: Invalid API key. Please check your credentials.`;
  }
  if (/RESOURCE_EXHAUSTED|quota exceeded|rate limit|429/i.test(msg)) {
    return `${provider.toUpperCase()} Quota Exceeded / Rate Limited: Your API quota or rate limit has been reached.`;
  }
  if (/not found|model.*not found|unsupported model|404/i.test(msg)) {
    return `${provider.toUpperCase()} Model Unavailable: The requested model could not be loaded or does not support tools.`;
  }
  if (/timeout|abort/i.test(msg)) {
    return `${provider.toUpperCase()} Request Timed Out: The AI provider took too long to respond.`;
  }
  if (/fetch failed|econnrefused|enotfound/i.test(msg)) {
    return `${provider.toUpperCase()} Network Error: Unable to reach provider endpoint. Check internet connection.`;
  }
  return `${provider.toUpperCase()} Error: ${msg}`;
}

// Fallback chat completion for OpenAI-compatible endpoints.
export async function callAiChatCompletion(
  messages: ChatMessage[],
  options: { maxTokens?: number; temperature?: number; timeoutMs?: number } = {}
): Promise<{ content: string; model: string }> {
  const config = getAiConfig();
  const apiKey = (process.env.GEMINI_API_KEY || process.env.FREELLMAPI_API_KEY || process.env.AI_API_KEY)?.trim();

  if (!config.configured || !apiKey) {
    throw new Error(
      'AI Provider is not configured. Set GEMINI_API_KEY (or AI_API_KEY) in your environment to enable AI features.'
    );
  }

  // If Gemini provider, use GoogleGenAI client
  if (config.provider === 'gemini') {
    try {
      const client = getGeminiClient();
      const userText = messages
        .filter((m) => m.role === 'user' || m.role === 'system')
        .map((m) => m.content)
        .join('\n\n');

      const response = await client.models.generateContent({
        model: config.model,
        contents: userText,
        config: {
          maxOutputTokens: options.maxTokens ?? 1500,
          temperature: options.temperature ?? 0.3,
        },
      });

      const text = response.text || '';
      return { content: text.trim(), model: config.model };
    } catch (err: any) {
      throw new Error(normalizeAiError(err, 'gemini'));
    }
  }

  // OpenAI-compatible endpoint call
  const endpoint = `${config.baseUrl}/chat/completions`;
  const timeoutMs = options.timeoutMs ?? 25000;
  const controller = new AbortController();
  const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        max_tokens: options.maxTokens ?? 1500,
        temperature: options.temperature ?? 0.3,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutTimer);

    if (!response.ok) {
      let errorDetail = `HTTP ${response.status} ${response.statusText}`;
      try {
        const errorJson = (await response.json()) as any;
        if (errorJson.error?.message) {
          errorDetail = errorJson.error.message;
        }
      } catch {
        // Fall back to status text
      }
      throw new Error(normalizeAiError(new Error(errorDetail), config.provider));
    }

    const data = (await response.json()) as any;
    const content = data.choices?.[0]?.message?.content;

    if (typeof content !== 'string') {
      throw new Error('AI Provider returned an unexpected response format.');
    }

    return {
      content: content.trim(),
      model: data.model || config.model,
    };
  } catch (err: any) {
    clearTimeout(timeoutTimer);
    if (err.name === 'AbortError') {
      throw new Error(`AI request timed out after ${timeoutMs / 1000} seconds.`);
    }
    throw err;
  }
}
