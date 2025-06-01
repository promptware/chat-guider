import { z } from 'zod';
import type { OptionChoice } from './types.js';
import { mkOpenRouter } from './llm.js';

export async function askUserForValue<T>(
  parameterName: string,
  description: string,
  options?: OptionChoice<T>[]
): Promise<string> {
  const client = mkOpenRouter();
  console.log('askUserForValue', parameterName, description, options);
  // Create schema for value only
  const responseSchema = z.object({
    value: z.string()
  });

  const optionsText = options && options.length > 0 
    ? `\n\nAvailable options:\n${options.map(opt => `- ${opt.id}: ${JSON.stringify(opt.value)}`).join('\n')}`
    : '';

  const prompt = `You are helping a user provide a value for a parameter that is currently empty.

Parameter name: ${parameterName}
Description: ${description}

${optionsText}

The user needs to provide a value for this parameter. Please ask the user what value they would like to use for this parameter in a clear and helpful way. Your response should include a request for the specific information needed.

DO NOT ask the user to provide "other values" or "other options" - the only valid values are the ones provided in the options list. DO NOT add any other options to the list.

You must respond with a JSON object containing:
- value: The question/prompt to ask the user for this parameter value

Be VERY succinct. List the options as raw text list.`;

    const result = await client.generateObject({
      prompt,
      schema: responseSchema,
    });

    return result.object.value;
} 