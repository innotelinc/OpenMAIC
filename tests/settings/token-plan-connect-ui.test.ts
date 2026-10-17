// @vitest-environment jsdom

/**
 * Connecting a token plan from the Token Plan panel, against the real settings
 * service: the plan's recommended configuration is applied, and when it would
 * replace models the workspace picked the panel asks first.
 *
 * The deployment ships exactly one plan (OmniRoute); these tests exercise that
 * plan, which is the only one the panel can offer.
 *
 * The i18n hook returns keys (with interpolated values appended).
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? [key, ...Object.values(options)].join('|') : key,
    locale: 'en-US',
    setLocale: () => {},
  }),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: vi.fn() }),
}));

import { TokenPlanSettings } from '@/components/settings/token-plan-settings';
import type { ApplyResult, ModelSettingsChange } from '@/lib/model-settings/client';
import type { ModelConfigFile } from '@/lib/server/model-config/openmaic-yml';
import type { ModelConfigLayer } from '@/lib/server/model-config/resolve-slot';
import { setDeploymentConfigForTests } from '@/lib/server/model-config/runtime';
import { applyModelSettingsChange, modelSettingsView } from '@/lib/server/model-config/settings';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const deployment = (config: ModelConfigLayer['config'] | null) =>
  setDeploymentConfigForTests({
    layer: config ? { source: 'deployment', config } : null,
    legacy: false,
    notices: [],
  });

const roots: Root[] = [];
beforeEach(() => {
  // The shipped plan is the estate's gateway on the server's own network: the
  // operator's opt-in is what lets the panel offer it.
  vi.stubEnv('ALLOW_LOCAL_NETWORKS', 'true');
  deployment(null);
});
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
  setDeploymentConfigForTests();
  vi.unstubAllEnvs();
});

let revision = 0;
const viewOf = (config: ModelConfigFile | null) =>
  modelSettingsView(config ? { config, revision: ++revision, unreadableSecrets: [] } : null);

/** A workspace that picked DeepSeek for the default model and the slides. */
async function workspaceWithOwnPicks(): Promise<ModelConfigFile> {
  let config = await applyModelSettingsChange(null, {
    kind: 'provider',
    id: 'ds',
    preset: 'deepseek',
    apiKey: 'sk-ds-key-0001',
  });
  config = await applyModelSettingsChange(config, {
    kind: 'slots',
    set: { llm: 'ds:deepseek-v4-pro', 'course.content.slide': 'ds:deepseek-v4-flash' },
  });
  return config;
}

/** The panel on a workspace, with an apply backed by the real settings service. */
function mountPanel(initial: ModelConfigFile | null) {
  let config = initial;
  const changes: ModelSettingsChange[] = [];
  const apply = vi.fn(async (change: ModelSettingsChange): Promise<ApplyResult> => {
    changes.push(change);
    config = await applyModelSettingsChange(config, change);
    return { ok: true, view: viewOf(config) };
  });
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(createElement(TokenPlanSettings, { view: viewOf(initial), apply })));
  return { changes, config: () => config };
}

async function flush() {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await new Promise((settle) => setTimeout(settle, 0));
    });
  }
}

function byText(text: string, selector = 'button'): HTMLElement {
  const found = [...document.body.querySelectorAll<HTMLElement>(selector)].find((element) =>
    element.textContent?.includes(text),
  );
  if (!found) throw new Error(`No ${selector} with ${text}`);
  return found;
}

async function connectPlan(name: string, key = 'omni-key-123456') {
  act(() => byText(name).click());
  const input = document.body.querySelector<HTMLInputElement>(
    '[aria-label="settings.tokenPlan.apiKey"]',
  )!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, key);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => {
    (document.body.querySelector('form') as HTMLFormElement).requestSubmit();
  });
  await flush();
}

const dialog = () => document.body.querySelector('[role="alertdialog"]');

describe('Token Plan → connecting applies the plan’s recommended configuration', () => {
  it('on a fresh workspace, assigns llm and the course stages without asking', async () => {
    const panel = mountPanel(null);
    await connectPlan('OmniRoute');
    expect(dialog()).toBeNull();
    expect(panel.changes).toEqual([
      { kind: 'provider', id: 'omniroute', preset: 'omniroute', apiKey: 'omni-key-123456' },
      {
        kind: 'slots',
        set: {
          llm: 'omniroute:auto/best-chat',
          'course.content.slide': 'omniroute:auto/best-coding',
          'course.content.interactive': 'omniroute:auto/best-coding',
          agent: 'omniroute:auto/best-chat',
          image: 'omniroute:codex/gpt-5.6-luna-image',
          video: 'omniroute:veoaifree-web/seedance',
        },
      },
    ]);
  });

  it('asks before replacing the models the workspace picked, and lists them', async () => {
    const panel = mountPanel(await workspaceWithOwnPicks());
    await connectPlan('OmniRoute');
    // Nothing is written until the user chooses.
    expect(panel.changes).toEqual([]);
    const shown = dialog();
    expect(shown?.textContent).toContain('settings.tokenPlan.applyTitle');
    const rows = [...shown!.querySelectorAll('li')].map((row) => row.textContent);
    expect(rows).toHaveLength(2);
    // Slot names as the course model map shows them (the id here: the test's
    // translations return keys), then current → recommended.
    expect(rows[0]).toMatch(/^llmDeepSeek V4 Pro · ds → auto\/best-chat · OmniRoute$/);
    expect(rows[1]).toMatch(
      /^course\.content\.slide.* → auto\/best-coding · OmniRoute$/,
    );
  });

  it("“Use plan's recommended setup” overwrites the workspace's picks in one change", async () => {
    const panel = mountPanel(await workspaceWithOwnPicks());
    await connectPlan('OmniRoute');
    act(() => byText('settings.tokenPlan.applyRecommended', '[role="alertdialog"] button').click());
    await flush();
    expect(panel.changes).toHaveLength(2);
    expect(panel.changes[1]).toMatchObject({
      kind: 'slots',
      set: {
        llm: 'omniroute:auto/best-chat',
        'course.content.slide': 'omniroute:auto/best-coding',
        'course.content.interactive': 'omniroute:auto/best-coding',
      },
    });
    expect(panel.config()?.slots).toMatchObject({
      llm: 'omniroute:auto/best-chat',
      'course.content.slide': 'omniroute:auto/best-coding',
    });
  });

  it('“Keep my current setup” connects and fills only the empty slots', async () => {
    const panel = mountPanel(await workspaceWithOwnPicks());
    await connectPlan('OmniRoute');
    act(() => byText('settings.tokenPlan.applyKeep', '[role="alertdialog"] button').click());
    await flush();
    expect(panel.changes[0]).toMatchObject({ kind: 'provider', id: 'omniroute' });
    const set = (panel.changes[1] as Extract<ModelSettingsChange, { kind: 'slots' }>).set!;
    expect(set).not.toHaveProperty('llm');
    expect(set).not.toHaveProperty('course.content.slide');
    expect(set).toMatchObject({
      'course.content.interactive': 'omniroute:auto/best-coding',
      image: 'omniroute:codex/gpt-5.6-luna-image',
    });
    expect(panel.config()?.slots).toMatchObject({
      llm: 'ds:deepseek-v4-pro',
      'course.content.slide': 'ds:deepseek-v4-flash',
    });
  });

  it('leaves the slots the deployment locks out of the question and the change', async () => {
    const picks = await workspaceWithOwnPicks();
    // The deployment locks the slide model the workspace had picked.
    deployment({
      providers: { operator: { preset: 'deepseek', apiKey: 'sk-operator-secret-0001' } },
      slots: { 'course.content.slide': 'operator:deepseek-v4-pro' },
      lock: ['course.content.slide'],
    });
    const panel = mountPanel(picks);
    await connectPlan('OmniRoute');
    const rows = [...dialog()!.querySelectorAll('li')].map((row) => row.textContent);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatch(/^llm/);
    act(() => byText('settings.tokenPlan.applyRecommended', '[role="alertdialog"] button').click());
    await flush();
    const set = (panel.changes[1] as Extract<ModelSettingsChange, { kind: 'slots' }>).set!;
    expect(set).not.toHaveProperty('course.content.slide');
    expect(set.llm).toMatch(/^omniroute:/);
  });
});
