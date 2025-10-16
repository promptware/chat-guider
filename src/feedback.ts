import z from 'zod';
import { ToolCallResult } from './validation';
import { match } from 'ts-pattern';

type Tool<InputSchema extends z.ZodTypeAny, OutputSchema extends z.ZodTypeAny> = {
  inputSchema: InputSchema;
  outputSchema: OutputSchema;
  execute: (input: z.infer<InputSchema>, context: unknown) => Promise<z.infer<OutputSchema>>;
  description?: string;
};

export type DomainMap = Record<string, unknown>;

export type FieldFeedbackCommon<T> = {
  allowedOptions?: T[];
  feedback?: string;
  normalizedValue?: T;
};

export type FieldFeedbackRefusal =
  | {
      refusalReason: string;
    }
  | {
      // TODO: make this field required. this is a temporary hack.
      // in the future, we will have separate types for validate() response type in the public interface
      // and in the internal feedback API.
      // the public interface, that takes care of tracking required fields, will not mandate needsValidFields.
      // But we actually need them for the tool protocol, because every refusal must be accompanied by an
      // actionable reason.
      needsValidFields?: string[];
    };

export type FieldFeedbackVariants =
  | {
      valid: true;
    }
  | ({
      valid: false;
    } & FieldFeedbackRefusal);

export type FieldFeedback<T> = FieldFeedbackCommon<T> & FieldFeedbackVariants;

export type ValidationResults<D extends DomainMap> = {
  [K in Extract<keyof D, string>]: FieldFeedback<D[K]>;
};

type ToolParams<
  InputSchema extends z.ZodTypeAny,
  OutputSchema extends z.ZodTypeAny,
  D extends DomainMap = DomainMap,
> = {
  inputSchema: InputSchema;
  outputSchema: OutputSchema;
  execute: (input: z.infer<InputSchema>, options: unknown) => Promise<z.infer<OutputSchema>>;
  description?: string;
  validate: (input: z.infer<PartialSchema<InputSchema>>) => Promise<ToolCallResult<D>>;
};

export const mkTool2ToolResponseSchema = <OutputSchema extends z.ZodTypeAny>(
  outputSchema: OutputSchema,
): z.ZodTypeAny => {
  return z.discriminatedUnion('status', [
    z.object({
      status: z.literal('rejected' as const),
      validationResults: z.record(
        z.object({
          valid: z.boolean(),
          allowedOptions: z.array(z.any()).optional(),
          refusalReason: z.string().optional(),
        }),
      ),
    }),
    z.object({ status: z.literal('accepted' as const), value: outputSchema }),
  ]);
};

export type Tool2ToolResponseSchema<OutputSchema extends z.ZodTypeAny> = z.infer<
  ReturnType<typeof mkTool2ToolResponseSchema<OutputSchema>>
>;

// TODO: dive deeper into the internals of Zod and make this work without infer
export type PartialSchema<T> = {
  [K in keyof T]: T[K] extends z.ZodTypeAny ? z.infer<ReturnType<T[K]['optional']>> : T[K];
};

export function mkTool<
  InputSchema extends z.ZodObject<z.ZodRawShape>,
  OutputSchema extends z.ZodTypeAny,
  D extends DomainMap = DomainMap,
>({
  inputSchema,
  outputSchema,
  execute,
  description,
  validate,
}: ToolParams<InputSchema, OutputSchema, D>): Tool<
  PartialSchema<InputSchema>,
  Tool2ToolResponseSchema<OutputSchema>
> {
  const wrappedOutputSchema = mkTool2ToolResponseSchema<OutputSchema>(outputSchema);
  type PartialInputSchema = z.infer<PartialSchema<InputSchema>>;
  return {
    inputSchema: inputSchema.partial() as PartialSchema<InputSchema>,
    outputSchema: wrappedOutputSchema,
    description: description,
    execute: async (
      input: PartialInputSchema,
      context: unknown,
    ): Promise<Tool2ToolResponseSchema<OutputSchema>> => {
      const validationResult = await validate(input);
      return await match(validationResult)
        .with({ status: 'rejected' }, async validationResult => {
          return validationResult;
        })
        .with({ status: 'accepted' }, async response => {
          const result = await execute(response.value, context);
          return { status: 'accepted' as const, value: result };
        })
        .exhaustive();
    },
  };
}
