import z from "zod";
import { tool } from 'ai';

type Tool<InputSchema extends z.ZodTypeAny, OutputSchema extends z.ZodTypeAny> = {
  inputSchema: InputSchema;
  outputSchema: OutputSchema;
  execute: (input: z.infer<InputSchema>, options: unknown) => Promise<z.infer<OutputSchema>>;
  description?: string,
  // onInputStart?: (options: unknown) => void | PromiseLike<void>,
  // onInputDelta?: (options: { inputTextDelta: string } & unknown) => void | PromiseLike<void>,
  // onInputAvailable?: (options: { input: z.infer<InputSchema> } & unknown) => void | PromiseLike<void>,

};

type DomainMap = Record<string, unknown>;

export type ValidationResults<D extends DomainMap> = {
  [K in Extract<keyof D, string>]: {
    valid: boolean;
    allowedOptions?: D[K][];
    refusalReason?: string;
  };
};

export type ToolzyFeedback<Value, D extends DomainMap = DomainMap> =
  | {
      tag: 'rejected';
      validationResults: ValidationResults<D>;
    }
  | {
      tag: 'accepted';
      value: Value;
    };

type ToolParams<
  LooseSchema extends z.ZodTypeAny,
  State,
  InputSchema extends z.ZodTypeAny,
  OutputSchema extends z.ZodTypeAny,
  D extends DomainMap = DomainMap
> = {
  inputSchema: InputSchema;
  outputSchema: OutputSchema;
  execute: (input: z.infer<InputSchema>, options: unknown) => Promise<z.infer<OutputSchema>>;
  description?: string;
  looseSchema: LooseSchema;
  fixup: (loozeValue: z.infer<LooseSchema>) => Promise<ToolzyFeedback<z.infer<InputSchema>, D>>;
  fetchState: (loozeValue: z.infer<LooseSchema>) => Promise<State>;
};

export function mkTool<
  LooseSchema extends z.ZodTypeAny,
  State,
  InputSchema extends z.ZodTypeAny,
  OutputSchema extends z.ZodTypeAny,
  D extends DomainMap = DomainMap
>(
  toolParams: ToolParams<LooseSchema, State, InputSchema, OutputSchema, D>
) {
  // const paramsWithoutExecute: Omit<Tool<Input, Output>, 'execute'> = omit(toolParams, 'execute');
  const wrappedOutputSchema = z.discriminatedUnion('tag', [
    z.object({
      tag: z.literal('rejected' as const),
      validationResults: z.record(
        z.object({
          valid: z.boolean(),
          allowedOptions: z.array(z.any()).optional(),
          refusalReason: z.string().optional(),
        })
      ),
    }),
    z.object({ tag: z.literal('accepted' as const), value: toolParams.outputSchema }),
  ]);
  const cns: Tool<LooseSchema, typeof wrappedOutputSchema> = {
    inputSchema: toolParams.looseSchema,
    outputSchema: wrappedOutputSchema,
    description: toolParams.description,
    execute: async (input: z.infer<LooseSchema>, options: unknown): Promise<z.infer<typeof wrappedOutputSchema>> => {
      const fix = await toolParams.fixup(input);
      if (fix.tag === 'rejected') {
        return { tag: 'rejected' as const, validationResults: (fix as any).validationResults } as z.infer<typeof wrappedOutputSchema>;
      }
      const result = await toolParams.execute!(fix.value as any as z.infer<InputSchema>, options);
      return { tag: 'accepted' as const, value: result } as z.infer<typeof wrappedOutputSchema>;
    },
  };
  const toolFn = tool as unknown as <T>(args: T) => T;
  return toolFn(cns);
};