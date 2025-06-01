import { z } from 'zod';
import type { OptionChoice } from './types.js';
import { mkOpenRouter } from './llm.js';
import { PARAMETER_SPECIFICATION_TEMPERATURE, DEFAULT_PARAMETER_SPECIFICATION_MODEL } from './constants.js';

export async function specifyUsingOpenRouter<T>(
  userInput: string,
  availableOptions: OptionChoice<T>[],
  parameterName: string,
  useReasoning: boolean = false
): Promise<OptionChoice<T>> {
  const client = mkOpenRouter(DEFAULT_PARAMETER_SPECIFICATION_MODEL);

  // Create schema based on whether reasoning is requested
  const responseSchema = useReasoning 
    ? z.object({
        reasoning: z.string(),
        selectedOption: z.enum(availableOptions.map(opt => opt.id) as [string, ...string[]])
      })
    : z.object({
        selectedOption: z.enum(availableOptions.map(opt => opt.id) as [string, ...string[]])
      });

  const basePrompt = `You are helping a user specify a parameter value. The user has entered "${userInput}" for the parameter "${parameterName}".

Here are the available options:
${availableOptions.map(opt => `- ${opt.id}`).join('\n')}

The user's input may contain typos or be an approximation. Please select the most appropriate option ID from the available choices that best matches what the user likely meant.`;

  const prompt = useReasoning 
    ? `${basePrompt}

You must respond with a JSON object containing:
- reasoning: A brief explanation of why you are choosing this option and how it matches the user's input
- selectedOption: The option that best matches the user's input

Think through your reasoning first, then choose the option ID that best matches the user's intent, even if there are typos or slight variations in the input.`
    : `${basePrompt}

You must respond with a JSON object containing:
- selectedOption: The option that best matches the user's input

Choose the option ID that best matches the user's intent, even if there are typos or slight variations in the input.`;

  try {
    const result = await client.generateObject({
      prompt,
      schema: responseSchema,
      temperature: PARAMETER_SPECIFICATION_TEMPERATURE,
    });

    // Look up the full option based on the selected ID
    const selectedOption = availableOptions.find(opt => opt.id === result.object.selectedOption);
    if (!selectedOption) {
      throw new Error(`LLM selected invalid option ID: ${result.object.selectedOption}`);
    }

    return selectedOption;
  } catch (error) {
    throw new Error(`Failed to specify parameter with LLM: ${error}`);
  }
} 