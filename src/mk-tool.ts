import z from 'zod';
import { tool } from 'ai';
import {
  compileFixup,
  type Domain,
  type FieldRule,
  type ValidationResult,
  type ValidationSpec,
} from './validation.js';
import { detectRequiresCycles } from './graph.js';

type DomainMap = Domain;

type ToolLike<InputSchema extends z.ZodTypeAny, OutputSchema extends z.ZodTypeAny> = {
  inputSchema: InputSchema;
  outputSchema: OutputSchema;
  execute: (input: z.infer<InputSchema>, options: unknown) => Promise<z.infer<OutputSchema>>;
  description?: string;
};

type MkToolParams<
  D extends DomainMap,
  LooseSchema extends z.ZodTypeAny,
  OutputSchema extends z.ZodTypeAny,
> = {
  schema: z.ZodType<D>;
  toolSchema: LooseSchema; // LLM-facing, partial/loose input
  outputSchema: OutputSchema; // Execute output schema
  description?: string;
  execute: (input: D) => Promise<z.infer<OutputSchema>>;
};

type AreAllFieldsAdded<All extends PropertyKey, Added extends PropertyKey> =
  Exclude<All, Added> extends never ? true : false;

type BuilderState<D extends DomainMap> = {
  readonly spec: Partial<ValidationSpec<D>>;
};

export type FieldConfig<
  D extends DomainMap,
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
  ) => Promise<ValidationResult<D[K]>>;
};

type BuilderApi<
  D extends DomainMap,
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
  ) => AreAllFieldsAdded<keyof D, Added> extends true ? ReturnType<typeof tool> : never;
  // buildChecked: preserves stronger generic typing (may cause heavy inference when unified with external types)
  buildChecked: (
    ...args: Exclude<keyof D, Added> extends never ? [] : [arg: never]
  ) => AreAllFieldsAdded<keyof D, Added> extends true
    ? ReturnType<typeof buildToolChecked<D, LooseSchema, OutputSchema>>
    : never;
};

// Strongly-typed builder (checked) — keeps precise generics on schemas
function buildToolChecked<
  D extends DomainMap,
  LooseSchema extends z.ZodTypeAny,
  OutputSchema extends z.ZodTypeAny,
>(params: MkToolParams<D, LooseSchema, OutputSchema>, spec: ValidationSpec<D>) {
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

  const wrappedOutputSchema = z.discriminatedUnion('tag', [
    z.object({
      tag: z.literal('rejected' as const),
      validationResults: z.record(
        z.object({
          valid: z.boolean(),
          allowedOptions: z.array(z.any()).optional(),
          refusalReason: z.string().optional(),
        }),
      ),
    }),
    z.object({ tag: z.literal('accepted' as const), value: params.outputSchema }),
  ]);

  const t: ToolLike<LooseSchema, typeof wrappedOutputSchema> = {
    inputSchema: params.toolSchema,
    outputSchema: wrappedOutputSchema,
    description: params.description,
    execute: async (input: z.infer<LooseSchema>, options: unknown) => {
      const result = await fixup(input as Partial<D>);
      if (result.tag === 'rejected') {
        return {
          tag: 'rejected' as const,
          validationResults: (result as any).validationResults,
        } as z.infer<typeof wrappedOutputSchema>;
      }
      const value = await params.execute(result.value as D);
      return { tag: 'accepted' as const, value } as z.infer<typeof wrappedOutputSchema>;
    },
  };
  const toolFn = tool as unknown as <T>(args: T) => T;
  return toolFn(t);
}

// Erased builder (loose) — returns SDK Tool with erased generics to avoid deep type instantiation
function buildToolLoose<
  D extends DomainMap,
  LooseSchema extends z.ZodTypeAny,
  OutputSchema extends z.ZodTypeAny,
>(
  params: MkToolParams<D, LooseSchema, OutputSchema>,
  spec: ValidationSpec<D>,
): ReturnType<typeof tool> {
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

  const wrappedOutputSchema = z.discriminatedUnion('tag', [
    z.object({
      tag: z.literal('rejected' as const),
      validationResults: z.record(
        z.object({
          valid: z.boolean(),
          allowedOptions: z.array(z.any()).optional(),
          refusalReason: z.string().optional(),
        }),
      ),
    }),
    z.object({ tag: z.literal('accepted' as const), value: params.outputSchema }),
  ]) as z.ZodTypeAny;

  const t: ToolLike<z.ZodTypeAny, z.ZodTypeAny> = {
    inputSchema: params.toolSchema as z.ZodTypeAny,
    outputSchema: wrappedOutputSchema as z.ZodTypeAny,
    description: params.description,
    execute: async (input: unknown, options: unknown) => {
      const result = await fixup(input as Partial<D>);
      if (result.tag === 'rejected') {
        return {
          tag: 'rejected' as const,
          validationResults: (result as any).validationResults,
        } as any;
      }
      const value = await params.execute(result.value as D);
      return { tag: 'accepted' as const, value } as any;
    },
  };
  return tool(t as any) as ReturnType<typeof tool>;
}

// Implements builder pattern for tool definition
// Use `.field(...)` for each field in the `D` type, and then
// call `.build()` to get the tool.
// If you miss any of the fields, `.build()` will error on the type level.
export function mkTool<
  D extends DomainMap,
  LooseSchema extends z.ZodTypeAny,
  OutputSchema extends z.ZodTypeAny,
>(
  params: MkToolParams<D, LooseSchema, OutputSchema>,
): BuilderApi<D, LooseSchema, OutputSchema, never> {
  const state: BuilderState<D> = { spec: {} };

  const api: BuilderApi<D, LooseSchema, OutputSchema, never> = {
    field: (key, cfg) => {
      const normalizedCfg: FieldRule<D, typeof key> = {
        requires: [
          ...(cfg.requires as readonly Exclude<keyof D, typeof key>[]),
        ] as unknown as Exclude<keyof D, typeof key>[],
        influencedBy: [
          ...(cfg.influencedBy as readonly Exclude<keyof D, typeof key>[]),
        ] as unknown as Exclude<keyof D, typeof key>[],
        description: cfg.description,
        validate: cfg.validate as any,
      };
      const nextSpec: Partial<ValidationSpec<D>> = { ...state.spec, [key]: normalizedCfg };
      const next: BuilderState<D> = { spec: nextSpec };
      return makeApi<D, LooseSchema, OutputSchema, typeof key>(params, next) as any;
    },
    build: ((..._args: any[]) =>
      buildToolLoose<D, LooseSchema, OutputSchema>(
        params,
        state.spec as ValidationSpec<D>,
      )) as BuilderApi<D, LooseSchema, OutputSchema, never>['build'],
    buildChecked: ((..._args: any[]) =>
      buildToolChecked<D, LooseSchema, OutputSchema>(
        params,
        state.spec as ValidationSpec<D>,
      )) as BuilderApi<D, LooseSchema, OutputSchema, never>['buildChecked'],
  };
  return api;
}

function makeApi<
  D extends DomainMap,
  LooseSchema extends z.ZodTypeAny,
  OutputSchema extends z.ZodTypeAny,
  Added extends keyof D,
>(
  params: MkToolParams<D, LooseSchema, OutputSchema>,
  state: BuilderState<D>,
): BuilderApi<D, LooseSchema, OutputSchema, Added> {
  return {
    field: (key, cfg) => {
      const normalizedCfg: FieldRule<D, typeof key> = {
        requires: [
          ...(cfg.requires as readonly Exclude<keyof D, typeof key>[]),
        ] as unknown as Exclude<keyof D, typeof key>[],
        influencedBy: [
          ...(cfg.influencedBy as readonly Exclude<keyof D, typeof key>[]),
        ] as unknown as Exclude<keyof D, typeof key>[],
        description: cfg.description,
        validate: cfg.validate as any,
      };
      const nextSpec: Partial<ValidationSpec<D>> = { ...state.spec, [key]: normalizedCfg };
      const nextState: BuilderState<D> = { spec: nextSpec };
      return makeApi<D, LooseSchema, OutputSchema, Added | typeof key>(params, nextState) as any;
    },
    build: ((..._args: any[]) =>
      buildToolLoose<D, LooseSchema, OutputSchema>(
        params,
        state.spec as ValidationSpec<D>,
      )) as BuilderApi<D, LooseSchema, OutputSchema, Added>['build'],
    buildChecked: ((..._args: any[]) =>
      buildToolChecked<D, LooseSchema, OutputSchema>(
        params,
        state.spec as ValidationSpec<D>,
      )) as BuilderApi<D, LooseSchema, OutputSchema, Added>['buildChecked'],
  } as BuilderApi<D, LooseSchema, OutputSchema, Added>;
}
