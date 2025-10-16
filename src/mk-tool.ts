import z from 'zod';
import { type Tool, tool } from 'ai';
import {
  compileFixup,
  ToolCallRejected,
  ToolCallResult,
  type DomainType,
  type FieldSpec,
  type ToolSpec,
} from './validation.js';
import { detectRequiresCycles } from './graph.js';
import { type FieldFeedback } from './feedback.js';

type MkToolParams<
  D extends DomainType,
  InputSchema extends z.ZodType<D>,
  OutputSchema extends z.ZodTypeAny,
> = {
  inputSchema: InputSchema;
  outputSchema: OutputSchema;
  description?: string;
  execute: (input: D) => Promise<z.infer<OutputSchema>>;
};

type AreAllFieldsAdded<All extends PropertyKey, Added extends PropertyKey> =
  Exclude<All, Added> extends never ? true : false;

type BuilderState<D extends DomainType> = {
  readonly spec: Partial<ToolSpec<D>>;
};

export type FieldConfig<
  D extends DomainType,
  K extends keyof D,
  Requires extends readonly Exclude<keyof D, K>[] = readonly Exclude<keyof D, K>[],
  Influences extends readonly Exclude<keyof D, K>[] = readonly Exclude<keyof D, K>[],
> = {
  requires: Requires;
  influencedBy: Influences;
  description?: string;
  validate: (
    value: D[K] | undefined,
    context: Pick<D, Requires[number]> & Partial<Pick<D, Influences[number]>>,
  ) => Promise<FieldFeedback<D[K]>>;
};

export const HiddenSpecSymbol = Symbol('HiddenSpec');

export type Tool2ToolResponse<Out extends z.ZodTypeAny> =
  | {
      status: 'rejected';
      validationResults: Record<
        string,
        { valid: boolean; allowedOptions?: unknown[]; refusalReason?: string }
      >;
    }
  | {
      status: 'accepted';
      value: z.infer<Out>;
    };

type BuiltTool<In extends z.ZodTypeAny, Out extends z.ZodTypeAny> = Tool<
  z.infer<In>,
  Tool2ToolResponse<Out>
>;

type BuilderApi<
  D extends DomainType,
  LooseSchema extends z.ZodTypeAny,
  OutputSchema extends z.ZodTypeAny,
  Added extends keyof D,
> = {
  field: <
    K extends Exclude<keyof D, Added>,
    R extends readonly Exclude<keyof D, K>[],
    I extends readonly Exclude<keyof D, K>[],
  >(
    key: K,
    cfg: FieldConfig<D, K, R, I>,
  ) => BuilderApi<D, LooseSchema, OutputSchema, Added | K>;
  // build: returns an SDK Tool with erased generics to avoid deep type instantiation at call sites
  build: (
    ...args: Exclude<keyof D, Added> extends never ? [] : [arg: never]
  ) => AreAllFieldsAdded<keyof D, Added> extends true
    ? BuiltTool<LooseSchema, OutputSchema>
    : never;

  spec: ToolSpec<D>;
};

// Erased builder (loose) — returns SDK Tool with erased generics to avoid deep type instantiation
function buildToolLoose<
  D extends DomainType,
  InputSchema extends z.ZodType<D>,
  OutputSchema extends z.ZodTypeAny,
>(
  params: MkToolParams<D, InputSchema, OutputSchema>,
  spec: ToolSpec<D>,
): BuiltTool<InputSchema, OutputSchema> {
  // Cycle detection on the dependency graph upfront (defensive runtime check)
  const flowLike: Record<
    string,
    { requires: string[]; influencedBy: string[]; description: string }
  > = {};
  for (const key of Object.keys(spec) as (keyof D)[]) {
    const rule = spec[key];
    flowLike[String(key)] = {
      requires: rule.requires as string[],
      influencedBy: rule.influencedBy as string[],
      description: rule.description ?? '',
    };
  }
  const cycles = detectRequiresCycles(flowLike as any);
  if (cycles.length > 0) {
    const msg = cycles.map(c => c.join(' -> ')).join('; ');
    throw new Error(`Cycle detected in requires graph: ${msg}`);
  }

  const fixup = compileFixup(spec);

  const wrappedOutputSchema = z.discriminatedUnion('status', [
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
    z.object({ status: z.literal('accepted' as const), value: params.outputSchema }),
  ]) as z.ZodTypeAny;

  const t = {
    inputSchema: params.inputSchema,
    outputSchema: wrappedOutputSchema,
    description: params.description,
    execute: async (input: unknown, options: unknown) => {
      const result = await fixup(input as Partial<D>);
      if (result.status === 'rejected') {
        return {
          status: 'rejected' as const,
          validationResults: (result as any).validationResults,
        } as any;
      }
      const value = await params.execute(result.value as D);
      return { status: 'accepted' as const, value } as any;
    },
  };
  const ret = tool(t as any) as unknown as BuiltTool<InputSchema, OutputSchema>;
  (ret as any)[HiddenSpecSymbol] = spec;
  return ret as BuiltTool<InputSchema, OutputSchema>;
}

// TODO: dive deeper into the internals of Zod and make this work without infer
export type PartialSchema<T> = {
  [K in keyof T]: T[K] extends z.ZodTypeAny ? z.infer<z.ZodOptional<T[K]>> : T[K];
};

// Implements builder pattern for tool definition
// Use `.field(...)` for each field in the `D` type, and then
// call `.build()` to get the tool.
// If you miss any of the fields, `.build()` will error on the type level.
export function mkTool<
  D extends DomainType,
  InputSchema extends z.ZodType<D>,
  OutputSchema extends z.ZodTypeAny,
>(
  params: MkToolParams<D, InputSchema, OutputSchema>,
): BuilderApi<D, InputSchema, OutputSchema, never> {
  const state: BuilderState<D> = { spec: {} };

  const api: BuilderApi<D, InputSchema, OutputSchema, never> = {
    spec: state.spec as ToolSpec<D>, // a lie :)
    field: (key, cfg) => {
      const normalizedCfg: FieldSpec<D, typeof key> = {
        requires: [...(cfg.requires as readonly Exclude<keyof D, typeof key>[])] as Exclude<
          keyof D,
          typeof key
        >[],
        influencedBy: [...(cfg.influencedBy as readonly Exclude<keyof D, typeof key>[])] as Exclude<
          keyof D,
          typeof key
        >[],
        description: cfg.description,
        validate: cfg.validate as any,
      };
      const nextSpec: Partial<ToolSpec<D>> = { ...state.spec, [key]: normalizedCfg };
      const next: BuilderState<D> = { spec: nextSpec };
      return makeApi<D, InputSchema, OutputSchema, typeof key>(params, next) as any;
    },
    build: ((..._args: any[]) =>
      buildToolLoose<D, InputSchema, OutputSchema>(
        params,
        state.spec as ToolSpec<D>,
      )) as BuilderApi<D, InputSchema, OutputSchema, never>['build'],
  };
  return api;
}

function makeApi<
  D extends DomainType,
  InputSchema extends z.ZodType<D>,
  OutputSchema extends z.ZodTypeAny,
  Added extends keyof D,
>(
  params: MkToolParams<D, InputSchema, OutputSchema>,
  state: BuilderState<D>,
): BuilderApi<D, InputSchema, OutputSchema, Added> {
  return {
    field: (key, cfg) => {
      const normalizedCfg: FieldSpec<D, typeof key> = {
        requires: [
          ...(cfg.requires as readonly Exclude<keyof D, typeof key>[]),
        ] as unknown as Exclude<keyof D, typeof key>[],
        influencedBy: [
          ...(cfg.influencedBy as readonly Exclude<keyof D, typeof key>[]),
        ] as unknown as Exclude<keyof D, typeof key>[],
        description: cfg.description,
        validate: cfg.validate as any,
      };
      const nextSpec: Partial<ToolSpec<D>> = { ...state.spec, [key]: normalizedCfg };
      const nextState: BuilderState<D> = { spec: nextSpec };
      return makeApi<D, InputSchema, OutputSchema, Added | typeof key>(params, nextState) as any;
    },
    build: ((..._args: any[]) =>
      buildToolLoose<D, InputSchema, OutputSchema>(
        params,
        state.spec as ToolSpec<D>,
      )) as BuilderApi<D, InputSchema, OutputSchema, Added>['build'],
  } as BuilderApi<D, InputSchema, OutputSchema, Added>;
}
