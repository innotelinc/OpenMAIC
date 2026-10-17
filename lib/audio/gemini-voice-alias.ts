/**
 * A Gemini TTS voice for a request that was configured elsewhere.
 *
 * A gateway that serves Gemini speech behind the OpenAI-compatible
 * `/audio/speech` endpoint still speaks only Gemini's own prebuilt voice names,
 * while the `openai-tts` preset offers OpenAI's (`alloy`, `nova`, …). Sending
 * the OpenAI name straight through is answered with
 * `Voice name alloy is not supported`, and the lesson gets no narration at all.
 * When the resolved model is a Gemini TTS model, the requested voice is
 * translated to the Gemini voice that carries the same character; a voice that
 * is already one of Gemini's passes through untouched.
 */

/** Gemini's prebuilt voices (https://ai.google.dev/gemini-api/docs/speech-generation). */
export const GEMINI_TTS_VOICES = [
  'Achernar',
  'Achird',
  'Algenib',
  'Algieba',
  'Alnilam',
  'Aoede',
  'Autonoe',
  'Callirrhoe',
  'Charon',
  'Despina',
  'Enceladus',
  'Erinome',
  'Fenrir',
  'Gacrux',
  'Iapetus',
  'Kore',
  'Laomedeia',
  'Leda',
  'Orus',
  'Puck',
  'Pulcherrima',
  'Rasalgethi',
  'Sadachbia',
  'Sadaltager',
  'Schedar',
  'Sulafat',
  'Umbriel',
  'Vindemiatrix',
  'Zephyr',
  'Zubenelgenubi',
] as const;

/** The Gemini voice that carries the character of the OpenAI voice of the same id. */
const OPENAI_TO_GEMINI_VOICE: Record<string, string> = {
  marin: 'Kore',
  cedar: 'Charon',
  alloy: 'Kore',
  ash: 'Alnilam',
  ballad: 'Achernar',
  coral: 'Despina',
  echo: 'Puck',
  fable: 'Charon',
  nova: 'Aoede',
  onyx: 'Orus',
  sage: 'Rasalgethi',
  shimmer: 'Leda',
  verse: 'Zubenelgenubi',
  default: 'Kore',
};

/** The voice a Gemini TTS model speaks when nothing usable was named. */
export const DEFAULT_GEMINI_VOICE = 'Kore';

/** True for the model ids a Gemini TTS deployment serves (`google/gemini-2.5-flash-preview-tts`). */
export function isGeminiTtsModel(modelId: string | undefined): boolean {
  return !!modelId && /gemini[^/]*tts/i.test(modelId);
}

const geminiVoiceById = new Map(GEMINI_TTS_VOICES.map((voice) => [voice.toLowerCase(), voice]));

/**
 * The voice to send for this model: Gemini's own name when the model is a
 * Gemini TTS model, else the configured voice unchanged.
 */
export function voiceForModel(
  modelId: string | undefined,
  voice: string | undefined,
): string | undefined {
  if (!isGeminiTtsModel(modelId)) return voice;
  if (!voice) return DEFAULT_GEMINI_VOICE;
  const geminiVoice = geminiVoiceById.get(voice.toLowerCase());
  if (geminiVoice) return geminiVoice;
  return OPENAI_TO_GEMINI_VOICE[voice.toLowerCase()] ?? DEFAULT_GEMINI_VOICE;
}
