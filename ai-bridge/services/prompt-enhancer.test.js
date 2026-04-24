import test from 'node:test';
import assert from 'node:assert/strict';

import { resolvePromptEnhancerRuntimeConfig } from './prompt-enhancer.js';

test('resolvePromptEnhancerRuntimeConfig prefers Codex when auto mode has both providers available', () => {
  const resolved = resolvePromptEnhancerRuntimeConfig({
    promptEnhancerConfig: {
      provider: null,
      effectiveProvider: 'codex',
      resolutionSource: 'auto',
      models: {
        claude: 'claude-sonnet-4-6',
        codex: 'gpt-5.5',
      },
      availability: {
        claude: true,
        codex: true,
      },
    },
  });

  assert.equal(resolved.provider, 'codex');
  assert.equal(resolved.model, 'gpt-5.5');
});

test('resolvePromptEnhancerRuntimeConfig throws a strict error when manual provider is unavailable', () => {
  assert.throws(
    () => resolvePromptEnhancerRuntimeConfig({
      promptEnhancerConfig: {
        provider: 'claude',
        effectiveProvider: null,
        resolutionSource: 'unavailable',
        models: {
          claude: 'claude-opus-4-7',
          codex: 'gpt-5.4',
        },
        availability: {
          claude: false,
          codex: true,
        },
      },
    }),
    /Claude Code.*unavailable/i
  );
});
