import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ModelConfigFile } from '@/lib/server/model-config/openmaic-yml';
import type { ModelConfigLayer } from '@/lib/server/model-config/resolve-slot';
import { setDeploymentConfigForTests } from '@/lib/server/model-config/runtime';
import { applyModelSettingsChange, modelSettingsView } from '@/lib/server/model-config/settings';
import type {
  ApplyResult,
  ModelSettingsChange,
  ModelSettingsView,
} from '@/lib/model-settings/client';
import {
  connectConflicts,
  connectTokenPlan,
  slotsHeldByHigherPlans,
  tokenPlanAssignments,
  tokenPlanConflicts,
  tokenPlanRecommendation,
} from '@/lib/model-settings/token-plan';

const deployment = (config: ModelConfigLayer['config'] | null) =>
  setDeploymentConfigForTests({
    layer: config ? { source: 'deployment', config } : null,
    legacy: false,
    notices: [],
  });

beforeEach(() => {
  // The shipped plan is the estate's gateway on the server's own network: the
  // operator's opt-in is what lets a workspace connect it (openmaic.yml).
  vi.stubEnv('ALLOW_LOCAL_NETWORKS', 'true');
  deployment(null);
});

afterEach(() => {
  setDeploymentConfigForTests();
  vi.unstubAllEnvs();
});

let revision = 0;
const viewOf = (config: ModelConfigFile | null) =>
  modelSettingsView(config ? { config, revision: ++revision, unreadableSecrets: [] } : null);

/** Apply changes in turn, as the server would store them. */
async function configure(...changes: ModelSettingsChange[]): Promise<ModelConfigFile> {
  let config: ModelConfigFile | null = null;
  for (const change of changes) config = await applyModelSettingsChange(config, change);
  return config ?? {};
}

const addPlan = (id: string, preset = id): ModelSettingsChange => ({
  kind: 'provider',
  id,
  preset,
  apiKey: `sk-${id}-key-0001`,
});

/** The plan's recommendation against a view, for the plan's provider in it. */
function recommendationIn(view: ModelSettingsView, presetId: string) {
  const preset = view.presets.find((entry) => entry.id === presetId)!;
  const provider = view.providers.find((entry) => entry.preset === presetId)!;
  return tokenPlanRecommendation(view, preset, provider);
}

/** A client apply backed by the real settings service, recording each change. */
function serverApply(initial: ModelConfigFile | null) {
  let config = initial;
  const changes: ModelSettingsChange[] = [];
  const apply = async (change: ModelSettingsChange): Promise<ApplyResult> => {
    changes.push(change);
    config = await applyModelSettingsChange(config, change);
    return { ok: true, view: viewOf(config) };
  };
  return { apply, changes, config: () => config };
}

describe('token plan recommendation', () => {
  it('covers the default model, the course stages it names and every media service', async () => {
    const view = viewOf(await configure(addPlan('omniroute')));
    expect(recommendationIn(view, 'omniroute')).toEqual({
      llm: 'omniroute:auto/best-chat',
      'course.content.slide': 'omniroute:auto/best-coding',
      'course.content.interactive': 'omniroute:auto/best-coding',
      agent: 'omniroute:auto/best-chat',
      image: 'omniroute:codex/gpt-5.6-luna-image',
      video: 'omniroute:veoaifree-web/seedance',
    });
  });

  it('leaves out speech: the gateway has no credentials for it', async () => {
    // Declaring tts would light up a slot whose every call answers 400, and a
    // broken speech slot is what made classrooms silent. The recommendation is
    // the honest set of modalities the plan can actually serve.
    const view = viewOf(await configure(addPlan('omniroute')));
    expect(recommendationIn(view, 'omniroute')).not.toHaveProperty('tts');
    expect(recommendationIn(view, 'omniroute')).not.toHaveProperty('webSearch');
    expect(recommendationIn(view, 'omniroute')).not.toHaveProperty('webFetch');
  });

  it('leaves out the slots the deployment locks, and only those', async () => {
    deployment({
      providers: { operator: { preset: 'deepseek', apiKey: 'sk-operator-secret-0001' } },
      slots: {
        llm: 'operator:deepseek-v4-pro',
        'course.content.slide': 'operator:deepseek-v4-pro',
      },
      lock: ['course.content.slide'],
    });
    const view = viewOf(await configure(addPlan('omniroute')));
    const recommendation = recommendationIn(view, 'omniroute');
    expect(recommendation).not.toHaveProperty('course.content.slide');
    // A server default that is not locked is the plan's to fill.
    expect(recommendation).toHaveProperty('llm');
    expect(recommendation).toHaveProperty(
      'course.content.interactive',
      'omniroute:auto/best-coding',
    );
  });

  it('never fills a slot inside a locked subtree', async () => {
    deployment({
      providers: { operator: { preset: 'deepseek', apiKey: 'sk-operator-secret-0001' } },
      slots: { llm: 'operator:deepseek-v4-pro' },
      lock: ['llm'],
    });
    const view = viewOf(await configure(addPlan('omniroute')));
    const recommendation = recommendationIn(view, 'omniroute');
    const chat = Object.keys(recommendation).filter(
      (slot) => view.slots.find((entry) => entry.slot === slot)?.capability === 'chat',
    );
    expect(chat).toEqual([]);
    expect(Object.keys(recommendation).length).toBeGreaterThan(0);
  });

  it('is the only plan, so nothing holds a slot above it', async () => {
    const view = viewOf(await configure(addPlan('omniroute')));
    expect(slotsHeldByHigherPlans(view, 'omniroute')).toEqual(new Set());
    expect(Object.keys(recommendationIn(view, 'omniroute')).length).toBeGreaterThan(0);
  });
});

describe('token plan assignments', () => {
  it('overwrites the slots the workspace set, or keeps them and fills the empty ones', async () => {
    const config = await configure(
      { kind: 'provider', id: 'ds', preset: 'deepseek', apiKey: 'sk-ds-key-0001' },
      {
        kind: 'slots',
        set: {
          llm: {
            model: 'ds:deepseek-v4-pro',
            thinking: { enabled: true },
          },
          'course.content.slide': 'ds:deepseek-v4-pro',
          image: null,
        },
      },
      addPlan('omniroute'),
    );
    const view = viewOf(config);
    const recommendation = recommendationIn(view, 'omniroute');
    expect(
      tokenPlanConflicts(view, recommendation).map(({ slot, current, recommended }) => [
        slot.slot,
        current,
        recommended,
      ]),
    ).toEqual([
      [
        'llm',
        { model: 'ds:deepseek-v4-pro', thinking: { enabled: true } },
        'omniroute:auto/best-chat',
      ],
      ['course.content.slide', 'ds:deepseek-v4-pro', 'omniroute:auto/best-coding'],
      ['image', null, 'omniroute:codex/gpt-5.6-luna-image'],
    ]);

    const overwrite = tokenPlanAssignments(view, recommendation, 'overwrite');
    // Thinking settings belong to the model they were set for: they go with it.
    expect(overwrite).toEqual(recommendation);
    const keep = tokenPlanAssignments(view, recommendation, 'keep');
    expect(keep).toEqual({
      'course.content.interactive': 'omniroute:auto/best-coding',
      agent: 'omniroute:auto/best-chat',
      video: 'omniroute:veoaifree-web/seedance',
    });
    // Both resolve on the server.
    await applyModelSettingsChange(config, { kind: 'slots', set: overwrite });
    await applyModelSettingsChange(config, { kind: 'slots', set: keep });
  });

  it('leaves out the slots that already hold the recommended model', async () => {
    const config = await configure(addPlan('omniroute'), {
      kind: 'slots',
      set: { llm: 'omniroute:auto/best-chat' },
    });
    const view = viewOf(config);
    const recommendation = recommendationIn(view, 'omniroute');
    expect(tokenPlanConflicts(view, recommendation)).toEqual([]);
    expect(tokenPlanAssignments(view, recommendation, 'overwrite')).not.toHaveProperty('llm');
  });
});

describe('connecting a token plan', () => {
  it('adds the provider, then assigns the recommendation in one slots change', async () => {
    const initial = await configure(
      { kind: 'provider', id: 'ds', preset: 'deepseek', apiKey: 'sk-ds-key-0001' },
      { kind: 'slots', set: { llm: 'ds:deepseek-v4-pro' } },
    );
    const view = viewOf(initial);
    const preset = view.presets.find((entry) => entry.id === 'omniroute')!;
    // Before anything is written, the conflict is known.
    expect(connectConflicts(view, preset).map((conflict) => conflict.slot.slot)).toEqual(['llm']);

    const server = serverApply(initial);
    const result = await connectTokenPlan(server.apply, view, preset, 'sk-omni-0001', 'overwrite');
    expect(result).toMatchObject({ status: 'done', providerId: 'omniroute' });
    expect(server.changes).toHaveLength(2);
    expect(server.changes[0]).toEqual({
      kind: 'provider',
      id: 'omniroute',
      preset: 'omniroute',
      apiKey: 'sk-omni-0001',
    });
    expect(server.changes[1]).toMatchObject({
      kind: 'slots',
      set: {
        llm: 'omniroute:auto/best-chat',
        'course.content.slide': 'omniroute:auto/best-coding',
        'course.content.interactive': 'omniroute:auto/best-coding',
      },
    });
  });

  it('keeping the current setup connects and fills only the empty slots', async () => {
    const initial = await configure(
      { kind: 'provider', id: 'ds', preset: 'deepseek', apiKey: 'sk-ds-key-0001' },
      { kind: 'slots', set: { llm: 'ds:deepseek-v4-pro' } },
    );
    const view = viewOf(initial);
    const preset = view.presets.find((entry) => entry.id === 'omniroute')!;
    const server = serverApply(initial);
    await connectTokenPlan(server.apply, view, preset, 'sk-omni-0001', 'keep');
    expect(server.config()?.slots).toMatchObject({
      llm: 'ds:deepseek-v4-pro',
      'course.content.slide': 'omniroute:auto/best-coding',
    });
  });

  it('saving a new key for a connected plan re-applies its recommendation', async () => {
    const initial = await configure(
      addPlan('omniroute'),
      { kind: 'provider', id: 'ds', preset: 'deepseek', apiKey: 'sk-ds-key-0001' },
      { kind: 'slots', set: { llm: 'ds:deepseek-v4-pro' } },
    );
    const view = viewOf(initial);
    const preset = view.presets.find((entry) => entry.id === 'omniroute')!;
    const server = serverApply(initial);
    await connectTokenPlan(server.apply, view, preset, 'sk-omni-0002', 'overwrite');
    expect(server.changes[0]).toEqual({
      kind: 'provider',
      id: 'omniroute',
      preset: 'omniroute',
      apiKey: 'sk-omni-0002',
    });
    expect(server.config()?.providers).not.toHaveProperty('omniroute-2');
    expect(server.config()?.slots).toMatchObject({ llm: 'omniroute:auto/best-chat' });
  });
});
