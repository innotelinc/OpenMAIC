import { WEB_FETCH_PROVIDERS } from '@/lib/web-fetch/registry';
import { describe, expect, it } from 'vitest';
import { PROVIDERS } from '@/lib/ai/providers';
import { ASR_PROVIDERS, TTS_PROVIDERS } from '@/lib/audio/constants';
import { IMAGE_PROVIDERS } from '@/lib/media/image-providers';
import { VIDEO_PROVIDERS } from '@/lib/media/video-providers';
import { PDF_PROVIDERS } from '@/lib/pdf/constants';
import { WEB_SEARCH_PROVIDERS } from '@/lib/web-search/constants';
import { MODALITY_ORDER, TOKEN_PLAN_PRESETS } from '@/lib/config/token-plan-presets';
import { getSlot, isSlotId, type SlotCapability, type SlotId } from '@/lib/config/model-slots';
import {
  PROVIDER_PRESETS,
  getProviderPreset,
  tokenPlanToPreset,
} from '@/lib/config/provider-presets';

const REGISTRIES: Record<SlotCapability, Record<string, unknown>> = {
  chat: PROVIDERS,
  tts: TTS_PROVIDERS,
  asr: ASR_PROVIDERS,
  image: IMAGE_PROVIDERS,
  video: VIDEO_PROVIDERS,
  webSearch: WEB_SEARCH_PROVIDERS,
  webFetch: WEB_FETCH_PROVIDERS,
  document: PDF_PROVIDERS,
};

describe('provider presets', () => {
  it('has unique ids', () => {
    const ids = PROVIDER_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('serves every registry entry through at least one preset', () => {
    for (const [capability, registry] of Object.entries(REGISTRIES) as [SlotCapability, object][]) {
      for (const registryId of Object.keys(registry)) {
        const served = PROVIDER_PRESETS.some(
          (preset) => preset.capabilities[capability]?.registryId === registryId,
        );
        expect(served, `${capability}/${registryId}`).toBe(true);
      }
    }
  });

  it('only points at registry entries that exist', () => {
    for (const preset of PROVIDER_PRESETS) {
      for (const [capability, target] of Object.entries(preset.capabilities)) {
        const registry = REGISTRIES[capability as SlotCapability];
        expect(
          target!.registryId in registry,
          `${preset.id} → ${capability}/${target!.registryId}`,
        ).toBe(true);
      }
    }
  });

  it('renames registry ids that collide across capabilities', () => {
    expect(getProviderPreset('minimax-search')?.capabilities.webSearch?.registryId).toBe('minimax');
    expect(getProviderPreset('doubao-search')?.capabilities.webSearch?.registryId).toBe('doubao');
    expect(getProviderPreset('lemonade-image')?.capabilities.image?.registryId).toBe('lemonade');
    expect(getProviderPreset('lemonade')?.capabilities.chat?.registryId).toBe('lemonade');
    expect(getProviderPreset('doubao')?.capabilities).toEqual({ chat: { registryId: 'doubao' } });
  });

  it('turns every token plan into a multi-capability preset', () => {
    expect(PROVIDER_PRESETS.filter((preset) => preset.kind === 'token-plan')).toHaveLength(
      TOKEN_PLAN_PRESETS.length,
    );
    // The deployment ships one plan: OmniRoute, the estate's gateway.
    const omniroute = getProviderPreset('omniroute')!;
    expect(omniroute.kind).toBe('token-plan');
    expect(Object.keys(omniroute.capabilities).sort()).toEqual(
      ['chat', 'image', 'video'].sort(),
    );
    // The retired vendor plans leave their chat registries as ordinary
    // single-capability presets, not token plans.
    expect(getProviderPreset('minimax')?.kind).toBe('single');
    expect(getProviderPreset('minimax')?.capabilities).toEqual({
      chat: { registryId: 'minimax' },
    });
    expect(getProviderPreset('tokendance')?.kind).toBe('single');
    expect(getProviderPreset('kimi-coding-plan')).toBeUndefined();
    // The shared Kimi account still spans chat, search and fetch.
    expect(Object.keys(getProviderPreset('kimi')!.capabilities).sort()).toEqual(
      ['chat', 'webSearch', 'webFetch'].sort(),
    );
    expect(getProviderPreset('kimi')?.capabilities).toEqual({
      chat: { registryId: 'kimi' },
      webSearch: { registryId: 'kimi' },
      webFetch: { registryId: 'kimi', baseUrl: undefined },
    });
  });

  it('carries plan recommendations onto slots', () => {
    const omniroute = getProviderPreset('omniroute')!;
    expect(omniroute.recommended).toMatchObject({
      llm: 'auto/best-chat',
      'course.content.slide': 'auto/best-coding',
      'course.content.interactive': 'auto/best-coding',
      agent: 'auto/best-chat',
      image: 'codex/gpt-5.6-luna-image',
      video: 'veoaifree-web/seedance',
    });
    // Speech is not recommended: the gateway holds no speech credentials, so a
    // tts assignment here would be a slot that errors on every call.
    expect(omniroute.recommended).not.toHaveProperty('tts');
    for (const preset of PROVIDER_PRESETS) {
      for (const [slot, model] of Object.entries(preset.recommended ?? {})) {
        expect(isSlotId(slot), `${preset.id} → ${slot}`).toBe(true);
        const capability = getSlot(slot as SlotId).capability;
        const models = preset.capabilities[capability]?.models;
        if (models) expect(models, `${preset.id} → ${slot}`).toContain(model);
      }
    }
  });
});

it('lets any token plan declare a fetch provider and endpoint', () => {
  expect(MODALITY_ORDER).toContain('webFetch');
  const preset = tokenPlanToPreset({
    id: 'fetch-plan',
    name: 'Fetch Plan',
    category: 'token_plan',
    modalities: { webFetch: { providerId: 'kimi', baseUrl: 'https://api.kimi.ai/coding/v1' } },
  });
  expect(preset.capabilities).toEqual({
    webFetch: { registryId: 'kimi', baseUrl: 'https://api.kimi.ai/coding/v1' },
  });
  expect(preset.recommended).toEqual({ webFetch: 'kimi' });
  expect(getProviderPreset('kimi')?.recommended).toEqual({ webSearch: 'kimi' });
});
