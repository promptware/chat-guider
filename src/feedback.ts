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


type FlexibleSchema<T> = z.ZodType<T>;

const schema = z.object({
  feedback: z.string().min(1),
});

const looseSchema = z.object({
  feedback: z.string().optional(),
});

type LooseValue = z.infer<typeof looseSchema>;
type Value = z.infer<typeof schema>;

export type ToolzyFeedback<Value> = {
  tag: 'rejected',
  reasons: { field: string; allowedOptions?: string[]; refusalReason?: string }[];
} | {
  tag: 'accepted',
  value: Value;
}

type ToolzyHandle<LooseType, State, Value> = {
  reject: (reason: string) => Promise<void>;
  accept: (value: Value) => Promise<void>;
  getState: () => Promise<State>;
};


type ToolParams<LooseSchema extends z.ZodTypeAny, State, InputSchema extends z.ZodTypeAny, OutputSchema extends z.ZodTypeAny> = {
  inputSchema: InputSchema;
  outputSchema: OutputSchema;
  execute: (input: z.infer<InputSchema>, options: unknown) => Promise<z.infer<OutputSchema>>;
  description?: string;
  looseSchema: LooseSchema;
  fixup: (loozeValue: z.infer<LooseSchema>) => Promise<ToolzyFeedback<z.infer<InputSchema>>>;
  fetchState: (loozeValue: z.infer<LooseSchema>) => Promise<State>;
};

export function mkTool<LooseSchema extends z.ZodTypeAny, State, InputSchema extends z.ZodTypeAny, OutputSchema extends z.ZodTypeAny>(
  toolParams: ToolParams<LooseSchema, State, InputSchema, OutputSchema>
) {
  // const paramsWithoutExecute: Omit<Tool<Input, Output>, 'execute'> = omit(toolParams, 'execute');
  const wrappedOutputSchema = z.discriminatedUnion('tag', [
    z.object({ tag: z.literal('rejected' as const), reasons: z.array(z.object({ field: z.string(), allowedOptions: z.array(z.string()).optional(), refusalReason: z.string().optional() })) }),
    z.object({ tag: z.literal('accepted' as const), value: toolParams.outputSchema }),
  ]);
  const cns: Tool<LooseSchema, typeof wrappedOutputSchema> = {
    inputSchema: toolParams.looseSchema,
    outputSchema: wrappedOutputSchema,
    description: toolParams.description,
    execute: async (input: z.infer<LooseSchema>, options: unknown): Promise<z.infer<typeof wrappedOutputSchema>> => {
      const fix = await toolParams.fixup(input);
      if (fix.tag === 'rejected') {
        return { tag: 'rejected' as const, reasons: fix.reasons } as z.infer<typeof wrappedOutputSchema>;
      }
      const result = await toolParams.execute!(fix.value as any as z.infer<InputSchema>, options);
      return { tag: 'accepted' as const, value: result } as z.infer<typeof wrappedOutputSchema>;
    },
  };
  const toolFn = tool as unknown as <T>(args: T) => T;
  return toolFn(cns);
};

// const options = await toolParams.fetchState(input);
// return await match(await toolParams.fixup(input, {
//   reject: async (reason) => { return { rejected: reason } },
//   accept: async (value) => { return value },
//   getState: async () => nullState,
// }))
//   .with({ rejected: P.string }, (value) => { return { rejected: value.rejected } })
//   .with({ accepted: P.any }, (value) => {
//     const result = await toolParams.execute(value, options);
//     return result;
//   })
//   .exhaustive();


const myTool = mkTool({
  inputSchema: schema,
  outputSchema: z.object({ ok: z.boolean() }),
  execute: async (input: Value, options: unknown): Promise<{ ok: boolean }> => {
    console.log('execute', input, options);
    return {
      ok: true,
    };
  },
  looseSchema, 
  fetchState: async () => {
    return {
    };
  },
  fixup: async (loozeValue: LooseValue): Promise<ToolzyFeedback<Value>> => {
    if (typeof loozeValue.feedback === 'string') {
      return {
        tag: 'accepted',
        value: { feedback: loozeValue.feedback }
      };
    }
    return {
      tag: 'rejected',
      reasons: [{ field: 'feedback', allowedOptions: [] }]
    };
  },
});

// export function getFeedback(params: Parameterized<D>) {
//   const feedback = await client.generateObject({
//     prompt: `Please provide feedback on the following parameters: ${JSON.stringify(params)}`,
//     schema,
//   });
// }