export type PromptEnhancerProvider = 'claude' | 'codex';
export type PromptEnhancerResolutionSource = 'manual' | 'auto' | 'unavailable';

export interface PromptEnhancerConfig {
  provider: PromptEnhancerProvider | null;
  effectiveProvider: PromptEnhancerProvider | null;
  resolutionSource: PromptEnhancerResolutionSource;
  models: {
    claude: string;
    codex: string;
  };
  availability: {
    claude: boolean;
    codex: boolean;
  };
}

export const DEFAULT_PROMPT_ENHANCER_CONFIG: PromptEnhancerConfig = {
  provider: null,
  effectiveProvider: 'claude',
  resolutionSource: 'auto',
  models: {
    claude: 'claude-sonnet-4-6',
    codex: 'gpt-5.5',
  },
  availability: {
    claude: false,
    codex: false,
  },
};
