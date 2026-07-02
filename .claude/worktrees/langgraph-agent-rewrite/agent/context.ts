/**
 * context.ts — Context window management with automatic compression
 *
 * Strategy:
 *   ≥80% usage → FORCE compress (agent auto-triggers before next LLM call)
 *   ≥60% usage → SUGGEST compress (nudge message sent to LLM)
 *   ≥40% usage → ALLOW compress (LLM can voluntarily call compress_context tool)
 *
 * Compression keeps: system prompt + last N system/user exchanges.
 * Older messages are summarized into a single compressed system message.
 */

import OpenAI from 'openai';
import { tool } from "@langchain/core/tools";
import { z } from "zod";

// ===================== Token Estimation =====================

/** Rough token count: ~4 chars per token (English), ~1.5 (Chinese) */
export function estimateTokens(text: string): number {
  const asciiChars = (text.match(/[\x00-\x7F]/g) || []).length;
  const nonAsciiChars = text.length - asciiChars;
  return Math.ceil(asciiChars / 4 + nonAsciiChars / 1.5);
}

export function estimateMessagesTokens(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): number {
  let total = 0;
  for (const m of messages) {
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    total += estimateTokens(content);
    if ('tool_calls' in m && m.tool_calls) {
      total += estimateTokens(JSON.stringify(m.tool_calls));
    }
  }
  return total;
}

// ===================== Context Compressor =====================

const COMPRESS_SUMMARY_PROMPT = `Summarize the following conversation history into a concise context summary.
Include: key decisions made, observations recorded, files read/written, commands executed, and current state.
Be brief but complete — the summary replaces the original messages to save context space.

Conversation to compress:`;

/** Call LLM to compress old messages into a summary. */
async function compressWithLlm(
  client: OpenAI,
  model: string,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
): Promise<string> {
  const text = messages.map(m => {
    const role = m.role;
    const content = typeof m.content === 'string' ? m.content : '';
    const tools = 'tool_calls' in m ? ` [called ${(m.tool_calls as Array<unknown>)?.length || 0} tools]` : '';
    return `[${role}]${tools} ${content.slice(0, 500)}`;
  }).join('\n');

  try {
    const resp = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: COMPRESS_SUMMARY_PROMPT },
        { role: 'user', content: text },
      ],
      max_tokens: 1024,
      temperature: 0,
    });
    return resp.choices[0]?.message?.content || '(compression failed)';
  } catch {
    return '(compression call failed)';
  }
}

// ===================== Context Manager =====================

export interface ContextState {
  usage_pct: number;
  total_tokens: number;
  max_tokens: number;
  level: 'normal' | 'allow' | 'suggest' | 'force';
}

export class ContextManager {
  public maxTokens: number;
  private client: OpenAI;
  private model: string;

  /** Messages to ALWAYS preserve (system prompt, task description) */
  private pinnedCount: number;

  constructor(client: OpenAI, model: string, maxTokens: number, pinnedCount = 2) {
    this.client = client;
    this.model = model;
    this.maxTokens = maxTokens;
    this.pinnedCount = pinnedCount;
  }

  /**
   * Check current context usage and return the compression level.
   */
  check(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): ContextState {
    const totalTokens = estimateMessagesTokens(messages);
    const usagePct = Math.round((totalTokens / this.maxTokens) * 100);
    let level: ContextState['level'] = 'normal';
    if (usagePct >= 80) level = 'force';
    else if (usagePct >= 60) level = 'suggest';
    else if (usagePct >= 40) level = 'allow';
    return { usage_pct: usagePct, total_tokens: totalTokens, max_tokens: this.maxTokens, level };
  }

  getInfo(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): { usage_pct: number; current_tokens: number; max_tokens: number; level: string } {
    const totalTokens = estimateMessagesTokens(messages);
    const usagePct = Math.round((totalTokens / this.maxTokens) * 100);
    let level = "normal";
    if (usagePct >= 80) level = "force";
    else if (usagePct >= 60) level = "suggest";
    else if (usagePct >= 40) level = "allow";
    return { usage_pct: usagePct, current_tokens: totalTokens, max_tokens: this.maxTokens, level };
  }

  /**
   * Compress messages: keep pinned messages + last N exchanges, compress the rest.
   * Returns compressed messages array.
   */
  async compress(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  ): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam[]> {
    // Keep system prompt + first user message (pinned) + last 12 messages (6 exchanges)
    const keepCount = Math.min(12, Math.max(4, Math.floor(messages.length / 2)));
    const toCompress = messages.slice(this.pinnedCount, -keepCount);
    const toKeep = [...messages.slice(0, this.pinnedCount), ...messages.slice(-keepCount)];

    if (toCompress.length === 0) return messages;

    const summary = await compressWithLlm(this.client, this.model, toCompress);
    const compressedMsg: OpenAI.Chat.Completions.ChatCompletionSystemMessageParam = {
      role: 'system',
      content: `[压缩历史] ${summary}`,
    };

    return [toKeep[0]!, compressedMsg, ...toKeep.slice(1)];
  }
}

// ===================== Context Tools =====================

export function createContextTools(
  ctxManager: ContextManager,
  getMessages: () => OpenAI.Chat.Completions.ChatCompletionMessageParam[],
) {
  const contextInfoTool = tool(
    async () => {
      const info = ctxManager.getInfo(getMessages());
      return `Context: ${info.usage_pct}% used (${info.current_tokens}/${info.max_tokens} tokens), level: ${info.level}`;
    },
    { name: "context_info", description: "查询当前上下文使用率和压缩级别", schema: z.object({}) },
  );

  const compressContextTool = tool(
    async () => {
      const msgs = getMessages();
      const before = ctxManager.getInfo(msgs);
      return `压缩请求已接收。压缩前: ${before.usage_pct}%。请等待系统执行压缩。`;
    },
    { name: "compress_context", description: "请求压缩对话上下文以释放 token 空间", schema: z.object({}) },
  );

  return { contextInfoTool, compressContextTool };
}
