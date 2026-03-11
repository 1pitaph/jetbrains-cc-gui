import { STORAGE_KEYS } from '../types/provider';

/**
 * Claude 模型映射配置。
 */
export interface ClaudeModelMapping {
  main?: string;
  haiku?: string;
  sonnet?: string;
  opus?: string;
  [key: string]: string | undefined;
}

/**
 * 读取 Claude 模型映射。
 */
export function readClaudeModelMapping(): ClaudeModelMapping {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.CLAUDE_MODEL_MAPPING);
    if (!stored) {
      return {};
    }
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === 'object' ? parsed as ClaudeModelMapping : {};
  } catch {
    return {};
  }
}

/**
 * 判断映射里是否至少包含一个有效模型值。
 */
function hasMappingValue(mapping: ClaudeModelMapping): boolean {
  return Object.values(mapping).some(value => value && value.trim().length > 0);
}

/**
 * 写入 Claude 模型映射，并主动通知同 tab 监听器刷新。
 */
export function writeClaudeModelMapping(mapping: ClaudeModelMapping): void {
  try {
    if (hasMappingValue(mapping)) {
      localStorage.setItem(STORAGE_KEYS.CLAUDE_MODEL_MAPPING, JSON.stringify(mapping));
    } else {
      localStorage.removeItem(STORAGE_KEYS.CLAUDE_MODEL_MAPPING);
    }

    // 同 tab 的 localStorage 写入不会触发原生 storage 事件，这里手动补发一次。
    window.dispatchEvent(new CustomEvent('localStorageChange', {
      detail: { key: STORAGE_KEYS.CLAUDE_MODEL_MAPPING },
    }));
  } catch {
    // localStorage 不可用或写入失败时静默降级
  }
}
