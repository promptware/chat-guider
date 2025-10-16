import z from 'zod';
import { mkTool } from '../src/builder.js';

const DSchema = z.object({ a: z.string(), b: z.number() });
type D = z.infer<typeof DSchema>;
const Out = z.object({ ok: z.boolean() });

// Exhaustiveness should be enforced at build()
// Building early should be a type error (no dummy arg accepted)
mkTool<D, typeof DSchema, typeof Out>({
  inputSchema: DSchema,
  outputSchema: Out,
  execute: async v => ({ ok: !!v }),
})
  .field('a', {
    requires: [],
    influencedBy: [] as const,
    validate: async () => ({ valid: true, normalizedValue: 'x' }),
  })
  // @ts-expect-error - cannot build before adding all fields
  .build();

// Correct usage: both fields then build()
mkTool<D, typeof DSchema, typeof Out>({
  inputSchema: DSchema,
  outputSchema: Out,
  execute: async v => ({ ok: !!v }),
})
  .field('a', {
    requires: [],
    influencedBy: [] as const,
    validate: async () => ({ valid: true, normalizedValue: 'x' }),
  })
  .field('b', {
    requires: ['a'] as const,
    influencedBy: [] as const,
    validate: async (v, ctx: { a: string }) => ({ valid: true, normalizedValue: 1 }),
  })
  .build();

mkTool<D, typeof DSchema, typeof Out>({
  inputSchema: DSchema,
  outputSchema: Out,
  execute: async v => ({ ok: !!v }),
})
  .field('a', {
    requires: [],
    influencedBy: [] as const,
    // @ts-expect-error - normalizedValue must be string
    validate: async () => ({ valid: true, normalizedValue: 1 }),
  })
  .field('b', {
    requires: ['a'] as const,
    influencedBy: [] as const,
    validate: async (v, ctx: { a: string }) => ({ valid: true, normalizedValue: 1 }),
  })
  .build();

mkTool<D, typeof DSchema, typeof Out>({
  inputSchema: DSchema,
  outputSchema: Out,
  execute: async v => ({ ok: !!v }),
})
  .field('a', {
    requires: [],
    influencedBy: [] as const,
    validate: async () => ({ valid: true, normalizedValue: 'a' }),
  })
  .field('b', {
    requires: ['a'] as const,
    influencedBy: [] as const,
    // @ts-expect-error - wrong context field type
    validate: async (v, ctx: { a: number }) => ({ valid: true, normalizedValue: 1 }),
  })
  .build();
