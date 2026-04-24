import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { CLAUDE_MODELS, CODEX_MODELS } from '../../ChatInputBox/types';
import { ProviderModelIcon } from '../../shared/ProviderModelIcon';
import type { PromptEnhancerConfig, PromptEnhancerProvider } from '../../../types/promptEnhancer';
import { DEFAULT_PROMPT_ENHANCER_CONFIG } from '../../../types/promptEnhancer';
import styles from './style.module.less';

interface PromptEnhancerSectionProps {
  promptEnhancerConfig?: PromptEnhancerConfig;
  onPromptEnhancerProviderChange?: (provider: PromptEnhancerProvider) => void;
  onPromptEnhancerModelChange?: (model: string) => void;
  onPromptEnhancerResetToDefault?: () => void;
}

const PromptEnhancerSection = ({
  promptEnhancerConfig = DEFAULT_PROMPT_ENHANCER_CONFIG,
  onPromptEnhancerProviderChange = () => {},
  onPromptEnhancerModelChange = () => {},
  onPromptEnhancerResetToDefault = () => {},
}: PromptEnhancerSectionProps) => {
  const { t } = useTranslation();

  const selectedProvider = promptEnhancerConfig.provider
    ?? promptEnhancerConfig.effectiveProvider
    ?? 'claude';
  const modelOptions = selectedProvider === 'codex' ? CODEX_MODELS : CLAUDE_MODELS;
  const statusProvider = promptEnhancerConfig.effectiveProvider ?? promptEnhancerConfig.provider ?? 'claude';
  const isAutoMode = promptEnhancerConfig.provider == null;
  const statusText = promptEnhancerConfig.resolutionSource === 'auto'
    ? t('settings.basic.promptEnhancer.currentProviderAuto', {
      provider: t(`settings.basic.promptEnhancer.provider.${statusProvider}`),
    })
    : promptEnhancerConfig.resolutionSource === 'manual'
      ? t('settings.basic.promptEnhancer.currentProviderManual', {
        provider: t(`settings.basic.promptEnhancer.provider.${statusProvider}`),
      })
      : t('settings.basic.promptEnhancer.currentProviderUnavailable', {
        provider: t(`settings.basic.promptEnhancer.provider.${statusProvider}`),
      });

  const getModelLabel = useCallback((provider: PromptEnhancerProvider) => {
    const modelId = promptEnhancerConfig.models[provider];
    const catalog = provider === 'codex' ? CODEX_MODELS : CLAUDE_MODELS;
    return catalog.find((model) => model.id === modelId)?.label ?? modelId;
  }, [promptEnhancerConfig.models]);

  return (
    <div className={styles.configSection}>
      <h3 className={styles.sectionTitle}>{t('settings.promptEnhancer.title')}</h3>
      <p className={styles.sectionDesc}>{t('settings.promptEnhancer.description')}</p>

      <div className={styles.promptEnhancerPanel}>
        <div className={styles.panelHeader}>
          <div className={styles.fieldHeader}>
            <span className="codicon codicon-sparkle" />
            <span className={styles.fieldLabel}>{t('settings.basic.promptEnhancer.label')}</span>
          </div>
          <button
            type="button"
            className={styles.resetBtn}
            onClick={onPromptEnhancerResetToDefault}
            disabled={isAutoMode}
          >
            {t('settings.basic.promptEnhancer.resetToDefault')}
          </button>
        </div>

        <div className={styles.statusBar}>
          <span className="codicon codicon-info" />
          <span>{statusText}</span>
        </div>

        <div className={styles.providerGrid}>
          {(['claude', 'codex'] as PromptEnhancerProvider[]).map((provider) => (
            <button
              key={provider}
              type="button"
              className={`${styles.providerCard} ${selectedProvider === provider ? styles.active : ''} ${!promptEnhancerConfig.availability[provider] ? styles.unavailable : ''}`}
              onClick={() => onPromptEnhancerProviderChange(provider)}
              aria-pressed={selectedProvider === provider}
              aria-label={t(`settings.basic.promptEnhancer.provider.${provider}`)}
            >
              <div className={styles.providerCardTop}>
                <div className={styles.providerTitle}>
                  <ProviderModelIcon providerId={provider} size={18} colored />
                  <span>{t(`settings.basic.promptEnhancer.provider.${provider}`)}</span>
                </div>
                <span className={`${styles.badge} ${promptEnhancerConfig.availability[provider] ? styles.available : styles.unavailableBadge}`}>
                  {promptEnhancerConfig.availability[provider]
                    ? t('settings.basic.promptEnhancer.providerAvailable')
                    : t('settings.basic.promptEnhancer.providerUnavailable')}
                </span>
              </div>
              <div className={styles.providerModel}>{getModelLabel(provider)}</div>
            </button>
          ))}
        </div>

        <div className={styles.modelBlock}>
          <label className={styles.fieldLabel} htmlFor="prompt-enhancer-settings-model">
            {t('settings.basic.promptEnhancer.modelLabel')}
          </label>
          <div className={styles.selectWrap}>
            <select
              id="prompt-enhancer-settings-model"
              className={styles.modelSelect}
              value={promptEnhancerConfig.models[selectedProvider]}
              onChange={(e) => onPromptEnhancerModelChange(e.target.value)}
            >
              {modelOptions.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
            <span className={`codicon codicon-chevron-down ${styles.selectArrow}`} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PromptEnhancerSection;
