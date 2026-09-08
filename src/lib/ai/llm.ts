import { prisma } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';
import crypto from 'crypto';
import { errorStatus } from '@/lib/errors';
import { env } from '@/lib/env';

// `|| 'mock-key'` is kept deliberately: this client is constructed at module
// load, and throwing here would take down every route that imports it. The key
// itself is read through `src/lib/env.ts`, not the raw environment (CLAUDE.md
// "Yapma" list).
const anthropic = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY || 'mock-key',
});

// Helper for exponential backoff retry
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      attempt++;
      // Check if it's a rate limit (429) or server error (50x)
      // An error with no status is not a client error, so it stays retryable —
      // the same outcome the old `undefined >= 400` comparison produced.
      const status = errorStatus(error);
      const isClientError = status !== undefined && status !== 429 && status >= 400 && status < 500;
      if (attempt > maxRetries || isClientError) {
        throw error;
      }
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.warn(`[AI Retry] Attempt ${attempt} failed with ${status}. Retrying in ${delay}ms...`);
      await new Promise(res => setTimeout(res, delay));
    }
  }
}

export interface LLMGenerateOptions {
  tenantId: string;
  userId?: string;
  module: string;
  purpose: string;
  proposalId?: string;
  section?: string;
  system?: string;
  prompt: string;
  model?: string;
}

export async function generateText(options: LLMGenerateOptions): Promise<string> {
  const modelName = options.model || 'claude-3-5-sonnet-20240620';
  
  // 1. Check if tenant has enough credits
  const creditsResult = await prisma.creditLedger.aggregate({
    where: { tenantId: options.tenantId },
    _sum: { delta: true }
  });
  const currentCredits = creditsResult._sum.delta || 0;
  
  if (currentCredits <= 0) {
    throw new Error('Insufficient AI credits. Please purchase a credit pack or wait for monthly renewal.');
  }

  // 2. Call Anthropic API with Retry Mechanism
  const response = await withRetry(() => anthropic.messages.create({
    model: modelName,
    max_tokens: 4096,
    system: options.system,
    messages: [
      { role: 'user', content: options.prompt }
    ]
  }));
  
  const textContent = response.content.find(c => c.type === 'text');
  const resultText = textContent?.type === 'text' ? textContent.text : '';

  // 3. Log usage and deduct credits
  const promptHash = crypto.createHash('sha256').update(options.prompt).digest('hex');
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  
  // Credit calculation: e.g. 1 credit per 10k combined tokens, min 1
  const totalTokens = inputTokens + outputTokens;
  const creditsUsed = Math.max(1, Math.ceil(totalTokens / 10000)); 

  await prisma.$transaction(async (tx) => {
    await tx.aiUsageLog.create({
      data: {
        tenantId: options.tenantId,
        userId: options.userId,
        module: options.module,
        purpose: options.purpose,
        provider: 'anthropic',
        model: modelName,
        promptHash,
        inputTokens,
        outputTokens,
        credits: creditsUsed,
        proposalId: options.proposalId,
        section: options.section,
      }
    });
    await tx.creditLedger.create({
      data: {
        tenantId: options.tenantId,
        delta: -creditsUsed,
        reason: `usage:${options.module}`,
      }
    });
  });

  return resultText;
}
