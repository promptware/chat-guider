import 'dotenv/config';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateObject } from 'ai';
import { z } from 'zod';
import { DEFAULT_PARAMETER_SPECIFICATION_MODEL, PARAMETER_SPECIFICATION_TEMPERATURE } from './constants.js';

export interface OpenRouterClient {
  generateObject: <T extends z.ZodType>(params: {
    prompt: string;
    schema: T;
    temperature?: number;
  }) => Promise<{ object: z.infer<T> }>;
}

export function mkOpenRouter(): OpenRouterClient {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable is required');
  }

  const model = process.env.OPENROUTER_MODEL || DEFAULT_PARAMETER_SPECIFICATION_MODEL;

  const openrouter = createOpenRouter({
    apiKey,
  });

  return {
    generateObject: async <T extends z.ZodType>(params: {
      prompt: string;
      schema: T;
      temperature?: number;
    }) => {
      return await generateObject({
        model: openrouter(model),
        prompt: params.prompt,
        schema: params.schema,
        temperature: params.temperature ?? PARAMETER_SPECIFICATION_TEMPERATURE,
      });
    }
  };
} 