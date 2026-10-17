/**
 * Token Plan presets — multi-modal.
 *
 * A token plan is often a single key that spans LLM + image + video + TTS +
 * web search + web fetch. A preset declares, per modality, the
 * target provider id + base URL in that modality's registry. "One-click apply" fills the key into
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
export type TokenPlanModality = 'llm' | 'image' | 'video' | 'tts' | 'webSearch' | 'webFetch';

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
  /**
   * LLM/TTS: the plan's recommended default model — for LLM the mainline model
   * (defaults to `defaultModels[0]`), for TTS the model the plan enables.
   */
  defaultModelId?: string;
  /**
   * LLM only: per-stage recommended models, applied as user-level stage routes
   * (e.g. 'scene-content:slide' → the plan's courseware model). Stage keys live
   * in the LLM_STAGES whitelist; ids must also appear in `defaultModels` so the
   * route's model is selectable.
   */
  stageRoutes?: Record<string, string>;
}

export interface TokenPlanPreset {
  /** Stable id (React key, derives custom LLM provider id). */
  id: string;
  /** Display name. */
  name: string;
  /** Optional vendor/docs link. */
  websiteUrl?: string;
  /**
   * Optional plan subscription links (domestic / international). Rendered as a
   * links row in the plan panel; `websiteUrl` stays the generic manage-account
   * link.
   */
  subscribeUrls?: { domestic: string; international: string };
  /** Example key prefix shown in the settings input placeholder. */
  apiKeyPlaceholder?: string;
  /** Icon path under /public (optional). */
  icon?: string;
  category: PresetCategory;
  /** Per-modality apply targets. Only declared modalities get lit up. */
  modalities: Partial<Record<TokenPlanModality, TokenPlanModalityTarget>>;
}

/** Human-facing order of modalities in the apply result. */
export const MODALITY_ORDER: TokenPlanModality[] = [
  'llm',
  'image',
  'video',
  'tts',
  'webSearch',
  'webFetch',
];

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
        // Speech goes through the gateway's own keyless gTTS route, which is
        // the one speech backend a gateway with no vendor speech credentials
        // still serves (`openai/tts-1` answers 400 "No credentials for
        // provider: openai"). Naming it keeps narration on the gateway instead
        // of leaving the slot unset, and the same route serves the vendor
        // speech models once an operator adds speech credentials there.
        providerId: 'openai-tts',
        baseUrl: 'http://192.168.1.71:20128/v1',
        defaultModelId: 'gtts/default',
        defaultModels: ['gtts/default'],
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

/**
 * Fingerprint of everything a preset seeds (model catalogues, default model,
 * stage routes). Recorded on apply; when the shipped preset data changes, the
 * fingerprint changes and the app re-seeds enabled plans on next load — so
 * users who enabled a plan before a preset update still get the new defaults
 * without re-applying. Credentials are deliberately excluded: only the user's
 * key ever writes those.
 */
export function tokenPlanSeedFingerprint(preset: TokenPlanPreset): string {
  const m = preset.modalities;
  return JSON.stringify({
    llm: [m.llm?.defaultModelId, m.llm?.defaultModels, m.llm?.stageRoutes],
    image: m.image?.defaultModels,
    video: m.video?.defaultModels,
    tts: [m.tts?.defaultModelId, m.tts?.defaultModels],
  });
}
