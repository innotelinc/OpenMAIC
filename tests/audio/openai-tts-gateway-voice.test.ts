import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { generateTTS } from '@/lib/audio/tts-providers';
import {
  DEFAULT_GEMINI_VOICE,
  isGeminiTtsModel,
  voiceForModel,
} from '@/lib/audio/gemini-voice-alias';

const mockFetch = vi.hoisted(() => vi.fn() as Mock);
vi.mock('undici', async (importOriginal) => {
  const actual = await importOriginal<typeof import('undici')>();
  return { ...actual, fetch: mockFetch };
});

const GEMINI_MODEL = 'google/gemini-2.5-flash-preview-tts';

function wavResponse(): unknown {
  const bytes = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]);
  return {
    ok: true,
    status: 200,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'content-type' ? 'audio/wav' : null),
    },
    arrayBuffer: async () => bytes.buffer.slice(0),
  };
}

/** The body the OpenAI-compatible provider sent to the endpoint. */
function sentBody(): Record<string, unknown> {
  const init = mockFetch.mock.calls[0][1] as { body: string };
  return JSON.parse(init.body) as Record<string, unknown>;
}

describe('voiceForModel', () => {
  it('recognises a Gemini TTS model id, including a gateway-prefixed one', () => {
    expect(isGeminiTtsModel(GEMINI_MODEL)).toBe(true);
    expect(isGeminiTtsModel('gemini-3.1-flash-tts-preview')).toBe(true);
    expect(isGeminiTtsModel('gpt-4o-mini-tts')).toBe(false);
    expect(isGeminiTtsModel(undefined)).toBe(false);
  });

  it('keeps the configured voice for a non-Gemini model', () => {
    expect(voiceForModel('gpt-4o-mini-tts', 'alloy')).toBe('alloy');
    expect(voiceForModel(undefined, 'nova')).toBe('nova');
  });

  it('maps an OpenAI voice, passes a Gemini voice, and defaults the rest', () => {
    expect(voiceForModel(GEMINI_MODEL, 'alloy')).toBe('Kore');
    expect(voiceForModel(GEMINI_MODEL, 'Puck')).toBe('Puck');
    expect(voiceForModel(GEMINI_MODEL, 'kore')).toBe('Kore');
    expect(voiceForModel(GEMINI_MODEL, 'some-other-provider-voice')).toBe(DEFAULT_GEMINI_VOICE);
    expect(voiceForModel(GEMINI_MODEL, undefined)).toBe(DEFAULT_GEMINI_VOICE);
  });
});

describe('OpenAI-compatible TTS against a Gemini gateway', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(wavResponse());
  });

  it('translates the workspace voice so the gateway accepts the request', async () => {
    await generateTTS(
      {
        providerId: 'openai-tts',
        apiKey: 'gateway-key',
        baseUrl: 'http://gateway.test/v1',
        modelId: GEMINI_MODEL,
        voice: 'alloy',
      },
      'hello classroom',
    );

    expect(mockFetch).toHaveBeenCalledWith(
      'http://gateway.test/v1/audio/speech',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(sentBody()).toMatchObject({
      model: GEMINI_MODEL,
      input: 'hello classroom',
      voice: 'Kore',
    });
  });

  it('leaves an OpenAI voice untouched when the model is OpenAI’s own', async () => {
    await generateTTS(
      {
        providerId: 'openai-tts',
        apiKey: 'openai-key',
        modelId: 'gpt-4o-mini-tts',
        voice: 'alloy',
      },
      'hello classroom',
    );

    expect(sentBody()).toMatchObject({ model: 'gpt-4o-mini-tts', voice: 'alloy' });
  });
});
