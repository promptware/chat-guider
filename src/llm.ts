import 'dotenv/config';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateObject } from 'ai';
import { z } from 'zod';

export interface OpenRouterClient {
  generateObject: <T extends z.ZodType>(params: {
    prompt: string;
    schema: T;
    temperature: number;
  }) => Promise<{ object: z.infer<T> }>;
}

export function mkOpenRouter(model: string): OpenRouterClient {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable is required');
  }

  const openrouter = createOpenRouter({
    apiKey,
  });

  return {
    generateObject: async <T extends z.ZodType>(params: {
      prompt: string;
      schema: T;
      temperature: number;
    }) => {
      return await generateObject({
        model: openrouter(model),
        prompt: params.prompt,
        schema: params.schema,
        temperature: params.temperature,
      });
    }
  };
} 