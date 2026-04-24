import { useMemo } from 'react';
import type { ClaudeMessage, ClaudeContentBlock, ToolResultBlock, SubagentInfo, SubagentStatus } from '../types';
import { normalizeToolInput } from '../utils/toolInputNormalization';
import { normalizeToolName } from '../utils/toolConstants';

interface UseSubagentsParams {
  messages: ClaudeMessage[];
  getContentBlocks: (message: ClaudeMessage) => ClaudeContentBlock[];
  findToolResult: (toolUseId?: string, messageIndex?: number) => ToolResultBlock | null;
}

/**
 * Determine subagent status based on tool result
 */
function determineStatus(result: ToolResultBlock | null): SubagentStatus {
  if (!result) {
    return 'running';
  }
  if (result.is_error) {
    return 'error';
  }
  return 'completed';
}

function extractResultText(result: ToolResultBlock | null): string | undefined {
  if (!result) return undefined;
  if (typeof result.content === 'string') return result.content;
  if (!Array.isArray(result.content)) return undefined;
  const text = result.content
    .map((item) => (item && typeof item.text === 'string' ? item.text : ''))
    .filter(Boolean)
    .join('\n');
  return text || undefined;
}

function extractResultMetadata(result: ToolResultBlock | null): Partial<SubagentInfo> {
  const rawMessage = (result as unknown as { __rawMessage?: { toolUseResult?: unknown } } | null)?.__rawMessage;
  const metadata = rawMessage?.toolUseResult;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return { resultText: extractResultText(result) };
  }

  const record = metadata as Record<string, unknown>;
  const getString = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
  const getNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
  const toolStats = record.toolStats && typeof record.toolStats === 'object' && !Array.isArray(record.toolStats)
    ? Object.fromEntries(
      Object.entries(record.toolStats as Record<string, unknown>)
        .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1])),
    )
    : undefined;

  return {
    agentId: getString(record.agentId),
    totalDurationMs: getNumber(record.totalDurationMs),
    totalTokens: getNumber(record.totalTokens),
    totalToolUseCount: getNumber(record.totalToolUseCount),
    toolStats,
    resultText: extractResultText(result),
  };
}

export function extractSubagentsFromMessages(
  messages: ClaudeMessage[],
  getContentBlocks: (message: ClaudeMessage) => ClaudeContentBlock[],
  findToolResult: (toolUseId?: string, messageIndex?: number) => ToolResultBlock | null,
): SubagentInfo[] {
  const subagents: SubagentInfo[] = [];

  messages.forEach((message, messageIndex) => {
    if (message.type !== 'assistant') return;

    const blocks = getContentBlocks(message);

    blocks.forEach((block) => {
      if (block.type !== 'tool_use') return;

      const toolName = normalizeToolName(block.name ?? '');

      // Only process task/agent-style subagent tool calls.
      if (toolName !== 'task' && toolName !== 'agent' && toolName !== 'spawn_agent') return;

      const rawInput = block.input as Record<string, unknown> | undefined;
      const input = rawInput ? normalizeToolInput(block.name, rawInput) as Record<string, unknown> : undefined;
      if (!input) return;

      // Defensive: ensure all string values are actually strings
      const id = String(block.id ?? `task-${messageIndex}-${subagents.length}`);
      const subagentType = String((input.subagent_type as string) ?? (input.subagentType as string) ?? 'Unknown');
      const description = String((input.description as string) ?? '');
      const prompt = String((input.prompt as string) ?? '');

      // Check tool result to determine status
      const result = findToolResult(block.id, messageIndex);
      const status = determineStatus(result);
      const resultMetadata = extractResultMetadata(result);

      subagents.push({
        id,
        type: subagentType,
        description,
        prompt,
        status,
        messageIndex,
        ...resultMetadata,
      });
    });
  });

  return subagents;
}

/**
 * Hook to extract subagent information from Task tool calls
 */
export function useSubagents({
  messages,
  getContentBlocks,
  findToolResult,
}: UseSubagentsParams): SubagentInfo[] {
  return useMemo(
    () => extractSubagentsFromMessages(messages, getContentBlocks, findToolResult),
    [messages, getContentBlocks, findToolResult],
  );
}
