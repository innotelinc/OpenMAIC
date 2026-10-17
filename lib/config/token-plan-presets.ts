/**
 * Token Plan presets — multi-modal.
 *
 * A token plan (e.g. MiniMax) is often a single key that spans LLM + image +
 * video + TTS + web-search. A preset declares, per modality, the target provider
 * id + base URL in that modality's registry. "One-click apply" fills the key into
 * every declared modality and lights it up; modalities not declared here are
 * simply "not adapted yet" (at our best — add an entry later to extend).
 *
 * Data-driven by design: adding a vendor/token-plan, or extending one to a new
 * modality, is one entry here — no code changes (plan's extensibility principle).
 */

import type { ProviderType } from '@/lib/types/provider';

/** Loose grouping for the preset list UI. */
export type PresetCategory = 'official' | 'aggregator' | 'token_plan' | 'third_party';

/** The modalities a token plan can be applied to. ASR is omitted = not adapted. */
export type TokenPlanModality = 'llm' | 'image' | 'video' | 'tts' | 'webSearch';

/** Where a token plan maps in one modality's provider registry. */
export interface TokenPlanModalityTarget {
  /** Provider id in that modality's registry (e.g. 'minimax-image'). */
  providerId: string;
  /** Base URL to fill for this modality. */
  baseUrl: string;
  /** LLM only: API protocol → app providerType. */
  apiFormat?: ProviderType;
  /**
   * LLM only: explicit /models URL override (optional). */
  modelsUrl?: string;
  /**
   * Model ids the plan offers in this modality, listed best-first. These are
   * seeded directly into the provider config as the plan's curated catalogue —
   * NOT probed. Tier-gated ids (a lower plan tier may not include the top model)
   * stay in the list and simply error at generation time if the tier excludes
   * them; we never silently drop a model the user paid for.
   */
  defaultModels?: string[];
  /** TTS only: default model id to enable. */
  defaultModelId?: string;
}

export interface TokenPlanPreset {
  /** Stable id (React key, derives custom LLM provider id). */
  id: string;
  /** Display name. */
  name: string;
  /** Optional vendor/docs link. */
  websiteUrl?: string;
  /** Example key prefix shown in the settings input placeholder. */
  apiKeyPlaceholder?: string;
  /** Icon path under /public (optional). */
  icon?: string;
  category: PresetCategory;
  /** Per-modality apply targets. Only declared modalities get lit up. */
  modalities: Partial<Record<TokenPlanModality, TokenPlanModalityTarget>>;
}

/** Human-facing order of modalities in the apply result. */
export const MODALITY_ORDER: TokenPlanModality[] = ['llm', 'image', 'video', 'tts', 'webSearch'];

/**
 * Built-in token plans.
 *
 * Scoped to TRUE token plans — a single key that spans multiple modalities.
 * Single-modality LLM providers (aggregators like OpenRouter, vendor-direct like
 * DeepSeek/GLM/Qwen) are deliberately NOT here: they're ordinary API providers
 * already covered by the add-provider flow, and listing them under "Token Plan"
 * muddied the "one key, every modality" promise.
 *
 * This deployment ships exactly one: OmniRoute, the estate's own gateway. The
 * vendor plans this list used to carry (TokenDance, MiniMax, Volcengine Ark,
 * Kimi) are gone — every model we run comes through the gateway, and a second
 * key for a vendor is a key nobody should paste.
 */
export const TOKEN_PLAN_PRESETS: TokenPlanPreset[] = [
  // ── Our gateway (one key, every modality it adapts) ──────────────────────
  {
    // OmniRoute is the estate's single model gateway. One key spans chat,
    // image generation, video generation and speech on OpenAI-compatible
    // paths under /v1, so this plan reuses the adapters that already speak
    // that wire format and only points them at the gateway. Web search and web
    // fetch are deliberately not listed: OmniRoute serves them on its own
    // shapes (/v1/search, /v1/web/fetch) and this app has no adapter for
    // either yet — declaring them here would light up a slot that cannot work.
    id: 'omniroute',
    name: 'OmniRoute',
    websiteUrl: 'https://omniroute.innotel.us',
    apiKeyPlaceholder: 'sk-...',
    category: 'token_plan',
    modalities: {
      llm: {
        // The gateway's chat face is the OpenAI wire format, so this is the
        // built-in openai provider pointed at the gateway instead of OpenAI.
        providerId: 'openai',
        baseUrl: 'http://192.168.1.71:20128/v1',
        apiFormat: 'openai',
        defaultModels: [
          'auto/best-chat',
          'auto/best-coding',
          'auto/best-reasoning',
          'auto/best-fast',
          'auto/best-free',
          'gemini/gemini-2.5-flash',
        ],
        defaultModelId: 'auto/best-chat',
        stageRoutes: {
          'scene-content:slide': 'auto/best-coding',
          'scene-content:interactive': 'auto/best-coding',
          // The Pro agent needs dependable tool calling.
          'maic-agent-driver': 'auto/best-chat',
        },
      },
      image: {
        providerId: 'openai-image',
        baseUrl: 'http://192.168.1.71:20128/v1',
        defaultModels: ['codex/gpt-5.6-luna-image', 'codex/gpt-5.6-terra-image'],
      },
      video: {
        // OpenAI-style video: POST /videos/generations, which is exactly what
        // the gateway documents for video.
        providerId: 'grok-video',
        baseUrl: 'http://192.168.1.71:20128/v1',
        defaultModels: ['veoaifree-web/seedance', 'veoaifree-web/veo'],
      },
      tts: {
        providerId: 'openai-tts',
        baseUrl: 'http://192.168.1.71:20128/v1',
        defaultModelId: 'openai/tts-1',
        defaultModels: ['openai/tts-1'],
      },
    },
  },
];

/** Preset category display order. */
export const PRESET_CATEGORY_ORDER: PresetCategory[] = [
  'token_plan',
  'aggregator',
  'third_party',
  'official',
];
