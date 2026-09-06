/**
 * LLM Adapter — Anthropic + OpenAI-compatible interface
 * Abstracts provider details and logs usage to AiUsageLog + deducts credits.
 */

import { prisma } from '@/lib/db';
import crypto from 'crypto';

export type LlmProvider = 'anthropic' | 'openai';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmOptions {
  provider?: LlmProvider;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LlmResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  provider: string;
  model: string;
}

const DEFAULT_PROVIDER: LlmProvider = 'anthropic';
const DEFAULT_MODELS: Record<LlmProvider, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
};

// Credit cost per 1K tokens (configurable per tenant later)
const CREDITS_PER_1K_INPUT = 1;
const CREDITS_PER_1K_OUTPUT = 3;

/**
 * Call an LLM and return the response text.
 */
async function callProvider(
  messages: LlmMessage[],
  opts: Required<Pick<LlmOptions, 'provider' | 'model' | 'maxTokens' | 'temperature'>>
): Promise<LlmResult> {
  const { provider, model, maxTokens, temperature } = opts;

  if (provider === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

    const systemMsg = messages.find(m => m.role === 'system')?.content || '';
    const userMessages = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role,
      content: m.content,
    }));

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        system: systemMsg,
        messages: userMessages,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${body}`);
    }

    const data = await res.json();
    return {
      text: data.content?.[0]?.text || '',
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
      provider: 'anthropic',
      model,
    };
  }

  if (provider === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not set');

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        messages,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${body}`);
    }

    const data = await res.json();
    return {
      text: data.choices?.[0]?.message?.content || '',
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
      provider: 'openai',
      model,
    };
  }

  throw new Error(`Unknown LLM provider: ${provider}`);
}

/**
 * Calculate credit cost from token usage.
 */
function calculateCredits(inputTokens: number, outputTokens: number): number {
  return Math.ceil(inputTokens / 1000) * CREDITS_PER_1K_INPUT
       + Math.ceil(outputTokens / 1000) * CREDITS_PER_1K_OUTPUT;
}

/**
 * Get current credit balance for a tenant.
 */
export async function getCreditBalance(tenantId: string): Promise<number> {
  const result = await prisma.creditLedger.aggregate({
    where: { tenantId },
    _sum: { delta: true },
  });
  return result._sum.delta || 0;
}

/**
 * High-level function: call LLM, log usage, deduct credits.
 * Throws if tenant has insufficient credits.
 */
export async function generateWithAI(
  tenantId: string,
  userId: string,
  messages: LlmMessage[],
  meta: { module: string; purpose: string; proposalId?: string; section?: string },
  opts?: LlmOptions
): Promise<LlmResult> {
  // 1. Check credit balance
  const balance = await getCreditBalance(tenantId);
  if (balance <= 0) {
    throw new Error('Insufficient AI credits. Please purchase more credits or upgrade your plan.');
  }

  const provider = opts?.provider || DEFAULT_PROVIDER;
  const model = opts?.model || DEFAULT_MODELS[provider];
  const maxTokens = opts?.maxTokens || 4096;
  const temperature = opts?.temperature || 0.7;

  // 2. Call LLM
  const result = await callProvider(messages, { provider, model, maxTokens, temperature });

  // 3. Calculate credits
  const credits = calculateCredits(result.inputTokens, result.outputTokens);

  // 4. Log usage + deduct credits in a transaction
  const promptHash = crypto.createHash('sha256')
    .update(messages.map(m => m.content).join(''))
    .digest('hex')
    .slice(0, 16);

  await prisma.$transaction(async (tx: any) => {
    await tx.aiUsageLog.create({
      data: {
        tenantId,
        userId,
        module: meta.module,
        purpose: meta.purpose,
        provider: result.provider,
        model: result.model,
        promptHash,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        credits,
        proposalId: meta.proposalId,
        section: meta.section,
      },
    });
    await tx.creditLedger.create({
      data: {
        tenantId,
        delta: -credits,
        reason: `usage:${meta.module}`,
        refId: meta.proposalId,
      },
    });
  });

  return result;
}
